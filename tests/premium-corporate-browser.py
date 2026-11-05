"""Presentation regressions using the real dashboard and isolated sample records.
Run: python tests/premium-corporate-browser.py. No live services are contacted.
"""
import ast,json,shutil
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
module=ast.parse((ROOT/'tests/theme-visual.py').read_text())
FIXTURE=next(ast.literal_eval(n.value)for n in module.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='FIXTURE'for t in n.targets))
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
try:
 with sync_playwright()as p:
  b=p.chromium.launch(executable_path=shutil.which('chromium')or shutil.which('google-chrome'),args=['--no-sandbox'])
  page=b.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if r.request.url.startswith(base)and '/api/'not in r.request.url:r.continue_()
   elif '/api/'in r.request.url:r.fulfill(content_type='application/json',body=json.dumps({'data':{'session':None,'csrf':'offline'},'error':None}))
   else:r.fulfill(body='',content_type='application/javascript')
  page.route('**/*',route);page.goto(base,wait_until='networkidle');page.evaluate(FIXTURE)
  page.evaluate("SITE_AUTH_USER={id:'style-fixture'};prepareSharedReportView=()=>true;ensureSharedReports=async()=>true;setPlanningReadState('ready')")
  before=page.evaluate('JSON.stringify({data:DATA,daily:DAILY_PLAN,size:SS_ROWS})')
  text=page.evaluate("()=>{goSlide(1);return document.getElementById('s1-tbl').textContent}")
  for theme in ['light','dark']:
   if page.evaluate('EKWLTheme.get()')!=theme:page.locator('#theme-toggle').click()
   page.evaluate('goSlide(1)');page.wait_for_timeout(120)
   assert page.locator('#s1-tbl').text_content()==text
   assert page.evaluate('JSON.stringify({data:DATA,daily:DAILY_PLAN,size:SS_ROWS})')==before
   # Visible text must be bold, and light-theme ordinary values must be black.
   cell=page.locator('#s1-body td').first
   assert float(cell.evaluate('e=>getComputedStyle(e).fontWeight'))>=600
   assert cell.evaluate('e=>getComputedStyle(e).fontSize')=='12px'
   if theme=='light':assert cell.evaluate('e=>getComputedStyle(e).color')=='rgb(0, 0, 0)'
   # Test actual theme-aware contrast including colored product/status badges.
   checks=page.evaluate("""()=>{
    const rgb=v=>(v.match(/[\\d.]+/g)||[]).map(Number),luma=a=>a.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const bg=e=>{if(!e)return[255,255,255];const a=rgb(getComputedStyle(e).backgroundColor),opacity=a.length===4?a[3]:a.length===3?1:0;if(opacity===1)return a;return bg(e.parentElement).map((v,i)=>(a[i]||0)*opacity+v*(1-opacity));};
    return [...document.querySelectorAll('#s1-tbl th,#s1-body td,#s1-body td span,#theme-toggle')].map(e=>{const a=luma(rgb(getComputedStyle(e).color)),b=luma(bg(e));return {text:e.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
   }""")
   assert all(c['ratio']>=4.5 for c in checks),[c for c in checks if c['ratio']<4.5]
   for width in [1440,721,390]:
    page.set_viewport_size({'width':width,'height':884})
    for slide in [0,1,3,5,6,7,8,10,11,12,13,14,15,17,18,19,21,22]:
     page.evaluate('(n)=>goSlide(n)',slide);page.wait_for_timeout(25)
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(theme,width,slide)
   page.set_viewport_size({'width':1440,'height':1000})
   page.evaluate("goSlide(17);showSizeSetSub('tna');syncSizeSetPerformance(false,true)")
   tna=page.frame_locator('#ss-tna-performance');tna.locator('#events tr').first.wait_for()
   assert tna.locator('html').get_attribute('data-theme')==theme
  assert page.evaluate('JSON.stringify({data:DATA,daily:DAILY_PLAN,size:SS_ROWS})')==before
  assert not errors,errors
  # A one-second report clock must not rescan thousands of unchanged cells.
  clock=b.new_page();clock.set_content('<main><span id="clock">00:00</span><table>'+''.join('<tr><td>Sample record</td><td>100</td></tr>'for _ in range(2000))+'</table></main>')
  clock.add_script_tag(content=(ROOT/'premium-corporate.js').read_text());clock.wait_for_timeout(100)
  clock.evaluate("window.styleReads=0;window.originalStyle=getComputedStyle;window.getComputedStyle=(...args)=>{styleReads++;return originalStyle(...args);};document.getElementById('clock').textContent='00:01'")
  clock.wait_for_timeout(80);assert clock.evaluate('styleReads')<30,'Clock update rescanned the report'
  b.close()
 print('PASS actual dashboard: immutable report records and table values; bold 12px black light-theme cells; 4.5:1 text contrast in both themes; responsive navigation; embedded TNA theme propagation')
finally:server.shutdown()
