"""Offline release gate: local assets, Pages subpath, inline syntax and sensitive additions.
Every external browser request is intercepted; no live database is used.
"""
import ast
from functools import partial
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import subprocess
import tempfile
from threading import Thread
from urllib.parse import unquote, urljoin, urlsplit
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
PREFIX='/EKWL_Production_Planning_Dashboard/'
PAGES=['index.html','load-analysis.html','order-execution-plan.html']
class Parser(HTMLParser):
 def __init__(self):super().__init__();self.refs=[];self.scripts=[];self.script=None
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  for key in ['src','href','data-src']:
   if attrs.get(key):self.refs.append(attrs[key])
  if tag=='script' and not attrs.get('src') and attrs.get('type','') not in ['application/json','application/ld+json']:self.script=[]
 def handle_data(self,data):
  if self.script is not None:self.script.append(data)
 def handle_endtag(self,tag):
  if tag=='script' and self.script is not None:self.scripts.append(''.join(self.script));self.script=None
refs=set();inline=0
with tempfile.TemporaryDirectory(prefix='ekwl-asset-check-') as temp:
 temp=Path(temp)
 for page in PAGES:
  parser=Parser();text=(ROOT/page).read_text();parser.feed(text)
  for value in parser.refs:
   if value.startswith(('#','//')) or urlsplit(value).scheme:continue
   assert not value.startswith('/'),f'Root-relative asset fails Pages prefix: {page}'
   if '${' in value or '{{' in value:raise AssertionError(f'Unresolved asset path in {page}')
   path=unquote(urlsplit(value).path)
   assert (ROOT/path).is_file(),f'Missing asset: {path}'
   refs.add(path)
  # Static fetch paths (there are none in the three entrypoint HTML documents today).
  for _,value in re.findall(r'''fetch\s*\(\s*(['"`])(.+?)\1''',text,re.S):
   if urlsplit(value).scheme or '${' in value:continue
   path=unquote(urlsplit(value).path);assert (ROOT/path).is_file();refs.add(path)
  for script in parser.scripts:
   if not script.strip():continue
   file=temp/f'inline-{inline}.js';file.write_text(script);inline+=1
   result=subprocess.run(['node','--check',str(file)],capture_output=True)
   assert result.returncode==0,f'Inline JavaScript syntax failure in {page}'
 # Locally resolved dynamic screenshot/3D fallbacks must remain beside the HTML.
 for path in ['html2canvas.min.js','three.min.js']:
  assert (ROOT/path).is_file();refs.add(path)
 # All changed production files must have different URLs from the old baseline.
 old=subprocess.check_output(['git','show','479090de208a15c90bbac6e4a17039cf84e550d7:index.html'],cwd=ROOT,text=True)
 old_parser=Parser();old_parser.feed(old)
 old_refs={urlsplit(v).path:v for v in old_parser.refs}
 current=Parser();current.feed((ROOT/'index.html').read_text())
 for value in current.refs:
  path=urlsplit(value).path
  if path in old_refs and (ROOT/path).is_file():
   previous=subprocess.run(['git','show',f'479090de208a15c90bbac6e4a17039cf84e550d7:{path}'],cwd=ROOT,capture_output=True)
   if previous.returncode==0 and previous.stdout!=(ROOT/path).read_bytes():assert old_refs[path]!=value,f'Unchanged asset URL: {path}'
 # Content-only scan; output counts, never matched source/credentials/personal details.
 diff=subprocess.check_output(['git','diff','479090de208a15c90bbac6e4a17039cf84e550d7','--','*.js','*.html','*.md','*.py','*.cjs'],cwd=ROOT,text=True)
 additions='\n'.join(line[1:] for line in diff.splitlines() if line.startswith('+') and not line.startswith('+++'))
 patterns=[r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',r'\bgh[pousr]_[A-Za-z0-9]{30,}',r'\bsbp_[a-f0-9]{30,}',r'\bsb_secret_[A-Za-z0-9_-]{20,}']
 assert not any(re.search(pattern,additions) for pattern in patterns),'Sensitive credential pattern introduced'
 # The existing public client configuration must not change during the release.
 approved=subprocess.check_output(['git','show','0fa1996e6475ab7d7ff4a8d48aeaa3d99a67e79c:dashboard-main.js'],cwd=ROOT,text=True)
 for name in ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY']:
  expr=rf'const {name}\s*=\s*[^;]+;'
  assert re.search(expr,approved).group()==re.search(expr,(ROOT/'dashboard-main.js').read_text()).group(),'Client configuration changed'
 # Mount with the exact Pages prefix; HTTP status and content type for every asset.
 (temp/'EKWL_Production_Planning_Dashboard').symlink_to(ROOT,target_is_directory=True)
 class Quiet(SimpleHTTPRequestHandler):
  def log_message(self,*_):pass
  def handle(self):
   try:super().handle()
   except (BrokenPipeError,ConnectionResetError):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(temp)))
 Thread(target=server.serve_forever,daemon=True).start()
 base=f'http://127.0.0.1:{server.server_port}{PREFIX}'
 try:
  for path in set(PAGES)|refs:
   with urlopen(urljoin(base,path)) as response:
    assert response.status==200,path
    mime=response.headers.get_content_type()
    if path.endswith('.js'):assert mime in ['text/javascript','application/javascript'],path
    if path.endswith('.css'):assert mime=='text/css',path
    if path.endswith('.html'):assert mime=='text/html',path
  parsed=ast.parse((ROOT/'tests/step1-browser.py').read_text())
  stub=next(ast.literal_eval(node.value) for node in parsed.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='STUB' for t in node.targets))
  with sync_playwright() as pw:
   browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
   page=browser.new_page();errors=[];failed=[]
   page.on('pageerror',lambda e:errors.append(type(e).__name__))
   page.on('response',lambda r:failed.append(r.status) if r.url.startswith(base) and r.status>=400 else None)
   def route(r):
    if '@supabase/supabase-js' in r.request.url:r.fulfill(body=stub,content_type='application/javascript')
    elif r.request.url.startswith(base):r.continue_()
    else:r.fulfill(body='',content_type='application/javascript')
   page.route('**/*',route)
   page.goto(base+'?ekwlPerf=1')
   page.wait_for_function("window.EKWL_TIMINGS?.some(t=>t.name==='boot'&&t.status==='loaded')")
   page.evaluate('goSlide(16)');page.wait_for_function("document.getElementById('order-execution-frame').dataset.ready==='1'")
   assert not errors and not failed,'Pages-prefix runtime or local asset failure'
   browser.close()
 finally:server.shutdown();server.server_close()
print(f'PASS release assets: {len(refs)} local paths, {inline} inline scripts, Pages-prefix HTTP/MIME and offline boot/Execution, fallback presence, versioning and credential-pattern checks')
