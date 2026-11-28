"""Body-only production table, compact wrapping, all-page Excel and session guards."""
import base64,json,shutil,sys
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
headers=['EWO No','Buyer','Color','Body Fabric','Booking No','Fabric Booking\nKG','Order Qty\nPCS','Body Consumption\nKG / PCS','Net Received\nKG','Total Cutting\nPCS','Fabric Used\nKG','Fabric Balance\nKG','Remaining Cuttable\nPCS','Gap / Surplus\nKG']
rows=[];evidence=[]
for i in range(205):
 ewo=str(270000+i);rows.append([ewo,'Buyer A' if i<120 else 'Buyer B','Black' if i<120 else 'Cloudy Blue','Single Jersey\n100% Cotton\n180 GSM · 72 in · Body','MAIN-'+ewo+'\nADD-'+ewo,'1000','5000','0.2','800','3000','600','200','1000','-200'])
 evidence.append({'pair':json.dumps([ewo,'BLACK' if i<120 else 'CLOUDY BLUE']),'body_only':True,'issues':[],'grain':{'rfd_rows':[i+2],'booking_rows':[i*2+2,i*2+3]},'booking_lines':[]})
data={'model':'body-fabric-balance-v1','headers':headers,'rows':rows,'evidence':evidence,'sources':{},'digest':'a'*64,'excluded_non_kg':0,'integrity':{'complete':True,'row_count':205}}
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
try:
 with sync_playwright()as p:
  b=p.chromium.launch(executable_path=shutil.which('chromium')or shutil.which('google-chrome'),args=['--no-sandbox']);page=b.new_page(viewport={'width':1800,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if r.request.url.startswith(base)and'/api/'not in r.request.url:r.continue_()
   elif'/api/'in r.request.url:r.fulfill(content_type='application/json',body=json.dumps({'data':{'session':None,'csrf':'offline'},'error':None}))
   else:r.fulfill(body='')
  page.route('**/*',route);page.goto(base,wait_until='networkidle');page.wait_for_function("typeof loadBodyBalance==='function'")
  # Finish the anonymous startup handler before installing an isolated test identity.
  page.wait_for_function("document.getElementById('site-login-msg').textContent.includes('Email এবং password দিয়ে sign in করুন।')")
  page.evaluate('''data=>{SITE_AUTH_USER={id:'body-owner'};SITE_USER_PROFILE={role:'admin',permissions:{slide_22:true}};document.body.classList.remove('site-locked');document.getElementById('site-login-gate').classList.add('hidden');CURRENT_SLIDE=22;document.querySelectorAll('.slide').forEach(e=>e.classList.toggle('active',e.id==='s22'));setRfdPlanMode('all');window.testBody=data;window.bodyReads=0;SB.request=async(route)=>{if(route!=='rfd/body-balance')throw Error('Unexpected source '+route);bodyReads++;return {data:testBody};};}''',data)
  page.locator('#fdr-tab').click();page.wait_for_function('BB_STATE.data!==null&&BB_STATE.promise===null')
  assert page.locator('#bb-view').is_visible()and page.locator('#fdr-source-view').is_hidden()
  assert page.locator('#bb-table thead th').all_text_contents()==headers
  assert not any(len(h.strip())==1 for h in page.locator('#bb-table thead th').all_text_contents())
  assert page.locator('#bb-table tbody tr').count()==100
  assert page.locator('#bb-table tbody tr').first.locator('td').nth(7).inner_text()=='0.2000'
  assert page.locator('#bb-table tbody tr').first.locator('td').nth(11).inner_text()=='200.00'
  assert page.locator('#bb-table tbody tr').first.locator('td').nth(4).text_content()=='MAIN-270000\nADD-270000'
  assert page.locator('#bb-table td').first.evaluate("e=>getComputedStyle(e).fontSize")=='11px'
  assert page.locator('#bb-table td').first.evaluate("e=>getComputedStyle(e).paddingTop")=='7px'
  page.locator('#bb-last').click();assert page.locator('#bb-table tbody tr').count()==5
  before=page.locator('#bb-page').inner_text()
  with page.expect_download()as d:page.locator('#bb-export').click()
  assert d.value.suggested_filename.endswith('.xlsx');assert page.locator('#bb-page').inner_text()==before
  actual=page.evaluate('''s=>{const w=XLSX.read(Uint8Array.from(atob(s),c=>c.charCodeAt(0)),{type:'array'});return XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]],{header:1,raw:false,defval:''});}''',base64.b64encode(Path(d.value.path()).read_bytes()).decode())
  assert len(actual)==207 and actual[0]==headers and actual[1][7]=='0.2000'and actual[1][4]=='MAIN-270000\nADD-270000'
  assert actual[-2][0]=='270204'and actual[-1][0].startswith('Filtered totals')
  page.locator('#bb-buyer').select_option('Buyer B');assert page.evaluate('BB_STATE.filtered.length')==85
  assert 'Black'not in page.locator('#bb-color').inner_text()
  page.locator('#bb-table [data-bb-column="5"]').first.click();assert 'booking_rows'in page.locator('#fdr-evidence-body').inner_text();page.locator('#fdr-evidence button').first.click()
  reads=page.evaluate('bodyReads');page.locator('#rfd-plan-mode').select_option('all');assert page.evaluate('bodyReads')==reads
  for width in [721,1065,1800]:
   page.set_viewport_size({'width':width,'height':1000});page.wait_for_timeout(100)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
   assert page.locator('#bb-table tbody tr').first.locator('td').nth(3).evaluate('e=>e.scrollHeight<=e.clientHeight+1')
  page.screenshot(path='/tmp/body-fabric-balance-live-layout.png',full_page=True)
  page.evaluate("BB_STATE.loaded=0;SB.request=async()=>({error:{message:'Fixture unavailable'}});void loadBodyBalance(true)")
  page.locator('#bb-status').filter(has_text='Fixture unavailable').wait_for();assert page.evaluate('BB_STATE.data===null')
  page.evaluate('resetRfdModule()');assert page.locator('#bb-table').text_content()==''
  assert not errors,errors;b.close()
 print('PASS Body-only default, named headers, compact wrap, saved booking references, formulas, 205-row Excel with totals, filtering, responsive layout and failed-read/logout guards')
finally:server.shutdown();server.server_close()

if len(sys.argv)>1:
 sys.path.insert(0,str(ROOT/'tests/mysql'));from client import Client,BASE
 auth=json.loads(Path(sys.argv[1]).read_text());c=Client();c.login(auth['email'],auth['password']);url=BASE.split('api/')[0]
 with sync_playwright()as p:
  b=p.chromium.launch(executable_path=shutil.which('chromium')or shutil.which('google-chrome'),args=['--no-sandbox']);ctx=b.new_context(viewport={'width':1800,'height':1000});ctx.add_cookies([{'name':x.name,'value':x.value,'url':url,'httpOnly':True,'sameSite':'Strict'}for x in c.jar]);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(url,wait_until='networkidle');page.wait_for_function('SITE_AUTH_USER!==null');page.evaluate("setRfdPlanMode('all');goSlide(22)");page.locator('#fdr-tab').click();page.wait_for_function('BB_STATE.data!==null&&BB_STATE.promise===null')
  assert page.locator('#bb-table tbody tr').count()==1
  assert page.locator('#bb-table tbody [data-bb-column="11"]').inner_text()=='400.00'
  assert page.locator('#bb-table tbody [data-bb-column="12"]').inner_text()=='2,000'
  assert not errors,errors;b.close()
 print('PASS actual SQL → default Body balance UI, saved Net Receive/Booking/Order/Cutting sources and derived balances')
