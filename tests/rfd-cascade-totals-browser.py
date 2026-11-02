"""Offline real renderers: four cascading Color filters and exact all-page totals; synthetic data only."""
import csv,io,json,shutil
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
def source_csv(path):
 with Path(path).open(encoding='utf-8-sig',newline='')as f:return list(csv.reader(f))
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
class Server(ThreadingHTTPServer):request_queue_size=128
server=Server(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=shutil.which('google-chrome')or shutil.which('chromium'),args=['--no-sandbox']);page=b.new_page(viewport={'width':1464,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));base=f'http://127.0.0.1:{server.server_port}/'
  def route(r):
   if r.request.url.startswith(base)and'/api/'not in r.request.url:r.continue_()
   elif '/api/'in r.request.url:r.fulfill(content_type='application/json',body=json.dumps({'data':{'session':None,'csrf':'offline'},'error':None}))
   else:r.fulfill(body='',content_type='application/javascript')
  page.route('**/*',route);page.goto(base,wait_until='networkidle');page.wait_for_function("typeof rfdCascadeRows==='function'&&typeof renderFdrModule==='function'&&typeof SB!=='undefined'")
  page.evaluate(r"""()=>{SITE_AUTH_USER={id:'offline-owner'};SITE_USER_PROFILE={role:'admin',permissions:{slide_22:true}};document.body.classList.remove('site-locked');document.getElementById('site-login-gate').classList.add('hidden');CURRENT_SLIDE=22;document.querySelectorAll('.slide').forEach(e=>e.classList.toggle('active',e.id==='s22'));
  window.fixtureRaw={rfd:[],booking:[],dcs:[]};window.fixtureFdr=[];const evidence=[];
  for(let i=0;i<205;i++){const buyer=i<120?'Buyer A':'Buyer B',place=i<60?'Place 1':i<120?'Place 2':'Place 3',color=i<60?'Blue':i<120?'Red':'Green';
   const r=Array(22).fill('');r[2]='RFD-'+String(i).padStart(4,'0');r[1]=place;r[6]=color;r[10]=i===204?'Buyer B\r\nTeam':buyer;r[14]='0.1';r[15]='0';r[16]='0';r[17]='1';fixtureRaw.rfd.push(r);
   fixtureRaw.booking.push(['B-'+i,'0001',buyer,'Team',place,'Construction','Cotton',color,'160','60',i===204?'PCS':'kg',i===204?'2':'0.1','Reason']);
   fixtureRaw.dcs.push([i===204?'02-Nov-26':'01-Nov-26',buyer,'Team','D-'+Math.floor(i/2),'Style','Company',color,'100','1','10',...Array(15).fill('0')]);
   const f=Array(31).fill('—');f[0]=buyer;f[1]='F-'+Math.floor(i/2);f[2]=color;f[3]='Fabric original';f[4]='Construction '+i;f[5]='Cotton';f[6]='0.1';f[7]='0';f[8]='0';f[9]='1';f[12]='KG';f[13]='1';f[14]=i===204?'1':'2';f[15]=i===204?'0.1':'0.2';f[17]='100';f[18]=i===204?'0.01':'0.02';f[19]='10';f[20]='8';f[21]='6';f[22]='5';f[23]='1';f[24]='0';f[25]='0';f[26]='0';f[27]='3';f[28]='2';f[29]='1';fixtureFdr.push(f);evidence.push({pair:'PAIR-'+Math.floor(i/2),grain:{},issues:{}});
  }window.fixtureDerived={headers:[...FDR_HEADERS],rows:fixtureFdr,evidence,pairs:{},sources:{},report:{id:'offline',model_version:'offline',generated_at:'2026-11-01',materialized:false},integrity:{complete:true,row_count:205}};window.originalFixtures=JSON.stringify([fixtureRaw,fixtureFdr]);
  window.openFixture=prefix=>{RFD_ACTIVE_TAB=prefix;for(const name of ['rfd','booking','dcs','fdr']){document.getElementById(name+'-panel').hidden=name!==prefix;document.getElementById(name+'-tab').setAttribute('aria-selected',String(name===prefix));}if(prefix==='rfd')setRfdRows(fixtureRaw.rfd,{file_name:'offline.csv'},'preview');if(prefix==='booking')setBookingRows(fixtureRaw.booking,{file_name:'offline.csv'},'preview');if(prefix==='dcs')setDcsRows(fixtureRaw.dcs,{file_name:'offline.csv'},'preview');if(prefix==='fdr')fdrSet(fixtureDerived);};
  }""")
  def total(prefix,col):return page.locator(f'#{prefix}-table tfoot [data-total-column="{col}"]').inner_text()
  for prefix in ['rfd','booking','dcs','fdr']:
   page.evaluate('p=>openFixture(p)',prefix);assert page.locator(f'#{prefix}-table tbody tr').count()==100;assert page.locator(f'#{prefix}-table tfoot td').count()=={'rfd':22,'booking':13,'dcs':25,'fdr':31}[prefix]
   if prefix=='rfd':
    page.locator('#rfd-buyer').select_option('Buyer B\r\nTeam');assert page.evaluate('RFD_FILTERED.length')==1;page.evaluate('clearRfdFilters()')
   expected_all={'rfd':(14,'20.5'),'booking':(11,'20.4 KG\n2 PCS'),'dcs':(9,'1,030'),'fdr':(14,'205 KG')}[prefix];assert total(prefix,expected_all[0])==expected_all[1],(prefix,total(prefix,expected_all[0]))
   page.locator(f'#{prefix}-last').click();assert page.locator(f'#{prefix}-table tbody tr').count()==5;assert total(prefix,expected_all[0])==expected_all[1]
   page.locator(f'#{prefix}-buyer').select_option('Buyer A');color_id='fdr-place'if prefix=='fdr'else prefix+'-color';assert 'Green'not in page.locator('#'+color_id).inner_text();assert 'Blue'in page.locator('#'+color_id).inner_text();assert page.locator(f'#{prefix}-table tbody tr').count()==100
   page.locator('#'+color_id).select_option('Blue');assert page.locator(f'#{prefix}-table tbody tr').count()==60
   if prefix=='rfd':assert total(prefix,14)=='6'
   if prefix=='booking':assert total(prefix,11)=='6 KG'
   if prefix=='dcs':assert total(prefix,7)=='3,000' and total(prefix,9)=='300' and total(prefix,8)=='30'
   if prefix=='fdr':assert total(prefix,13)=='60 KG'and total(prefix,14)=='60 KG'and total(prefix,20)=='240'and total(prefix,16)=='—'and total(prefix,18)=='—'
   if prefix!='fdr':
    select=page.locator(f'#{prefix}-place');select.select_option('Place 1'if prefix!='dcs'else'01-Nov-26')
   page.locator(f'#{prefix}-buyer').select_option('Buyer B');assert page.locator('#'+color_id).input_value()=='';assert 'Blue'not in page.locator('#'+color_id).inner_text();assert 'Green'in page.locator('#'+color_id).inner_text()
   if prefix in ['rfd','booking']:assert page.locator(f'#{prefix}-place').input_value()==''
   clear={'rfd':'clearRfdFilters','booking':'clearBookingFilters','dcs':'clearDcsFilters','fdr':'clearFdrFilters'}[prefix];page.evaluate(f'{clear}()');assert total(prefix,expected_all[0])==expected_all[1]
   page.locator(f'#{prefix}-search').fill({'rfd':'RFD-0204','booking':'B-204','dcs':'D-102','fdr':'F-102'}[prefix]);page.wait_for_function("p=>({rfd:RFD_FILTERED,booking:BOOKING_FILTERED,dcs:DCS_FILTERED,fdr:FDR_FILTERED}[p]).length===1",arg=prefix);assert page.locator(f'#{prefix}-table tbody tr').count()==1;page.evaluate(f'{clear}()')
   page.locator('#'+color_id).select_option('Green')
   with page.expect_download()as d:page.locator(f'#{prefix}-export').click()
   exported=source_csv(d.value.path());expected=page.evaluate("p=>p==='fdr'?fixtureFdr.filter(r=>r[2]==='Green'):fixtureRaw[p].filter(r=>r[{rfd:6,booking:7,dcs:6}[p]]==='Green')",prefix);assert exported[1:]==expected,'Export altered source rows or appended totals'
   for width in [721,1065,1920]:
    page.set_viewport_size({'width':width,'height':884});page.wait_for_timeout(100);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(prefix,width);assert page.locator('#'+color_id).is_visible();assert page.locator(f'#{prefix}-table').evaluate("e=>e.parentElement.getBoundingClientRect().bottom+30<=innerHeight"),(prefix,width,'table exceeds viewport');assert page.locator(f'#{prefix}-table tfoot td').first.evaluate("e=>{const a=e.getBoundingClientRect(),b=e.closest('table').parentElement.getBoundingClientRect();return a.bottom<=b.bottom+2&&a.top>=b.top}"),(prefix,width,'footer not pinned')
    if width==721:page.screenshot(path='/tmp/rfd-layout-'+prefix+'.png')
   page.set_viewport_size({'width':1464,'height':900})
  page.evaluate("openFixture('booking');setBookingRows(fixtureRaw.booking.slice(0,2),{file_name:'offline.csv'},'preview')");page.set_viewport_size({'width':1920,'height':900});page.wait_for_timeout(150);assert page.locator('.booking-scroll').evaluate('e=>e.clientHeight<220'), 'short data has excess empty height';page.screenshot(path='/tmp/rfd-layout-booking-short.png')
  assert page.evaluate('JSON.stringify([fixtureRaw,fixtureFdr])===originalFixtures')
  page.evaluate('resetRfdModule()');assert page.locator('#s22 table tfoot').count()==0;assert page.evaluate('RFD_CASCADE_CACHE.size===0&&RFD_TOTAL_CACHE.size===0&&RFD_LAYOUT_CACHE.size===0');assert page.locator('#rfd-color').inner_text()=='All colors';assert not errors,errors
  b.close();print('PASS four real renderers: cascading Buyer/Place-Date/Color/search, 205-row exact totals across pages, unit separation, order/batch/pair deduplication, exclusions, source-only exports, sticky responsive footers and session cleanup')
finally:server.shutdown()
