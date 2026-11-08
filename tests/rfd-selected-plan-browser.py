"""Real RFD renderers + actual cached plan selector; isolated synthetic sources only."""
import csv,io,json,shutil
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
class Server(ThreadingHTTPServer):request_queue_size=128
server=Server(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
try:
 with sync_playwright()as p:
  b=p.chromium.launch(executable_path=shutil.which('chromium')or shutil.which('google-chrome'),args=['--no-sandbox']);page=b.new_page(viewport={'width':1464,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if r.request.url.startswith(base)and'/api/'not in r.request.url:r.continue_()
   elif'/api/'in r.request.url:r.fulfill(content_type='application/json',body=json.dumps({'data':{'session':None,'csrf':'fixture'},'error':None}))
   else:r.fulfill(body='',content_type='application/javascript')
  page.route('**/*',route);page.goto(base,wait_until='networkidle');page.wait_for_function("typeof FDR_HEADERS!=='undefined'&&typeof renderFdrModule==='function'&&typeof BOOKING_HEADERS!=='undefined'")
  page.evaluate(r"""()=>{
   SITE_AUTH_USER={id:'scope-owner'};SITE_USER_PROFILE={role:'admin',permissions:{}};document.body.classList.remove('site-locked');document.getElementById('site-login-gate').classList.add('hidden');
   window.fixtures={rfd:[],booking:[],dcs:[],fdr:[]};const entries=[['272205','Praline','Other Buyer','99'],['271080','Blue','Buyer A','10'],['271080','Red','Buyer A','20'],['271444','Black','Buyer B','30'],['EWO 271080-FBR','C. Navy','Buyer A','5'],['271080 / 272205','Mixed','Mixed Buyer','999'],['','Unknown','Unknown Buyer','999']];
   for(const[e,color,buyer,qty]of entries){const r=Array(22).fill('');r[0]='01-Nov-26';r[1]='Textile';r[2]=e;r[6]=color;r[7]='Original fabric detail';r[8]='Single Jersey';r[9]='100% Cotton';r[10]=buyer;r[14]=qty;r[15]='0';r[16]='0';r[17]='1';fixtures.rfd.push(r);fixtures.booking.push([e,'271080-FBR',buyer,'Team','Textile','Single Jersey','100% Cotton',color,'160','60','KG',qty,'Original reason']);fixtures.dcs.push(['01-Nov-26',buyer,'Team',e,'Style','Company',color,'100',qty,qty,...Array(15).fill('0')]);const f=Array(31).fill('—');f[0]=buyer;f[1]=e;f[2]=color;f[3]=r[7];f[4]=r[8];f[5]=r[9];f[6]=qty;f[7]='0';f[8]='0';f[9]='1';f[12]='KG';f[13]=qty;f[14]=qty;f[15]=qty;f[17]='100';for(const i of [19,20,21,22,23,24,25,26,27,28,29])f[i]=qty;fixtures.fdr.push(f);}
   window.derived={headers:[...FDR_HEADERS],rows:fixtures.fdr,evidence:fixtures.fdr.map((r,i)=>({pair:'p'+i,grain:{source_index:i},issues:{}})),pairs:{},sources:{},report:{id:'derived',model_version:'fixture',generated_at:'2026-11-05',dependency_digest:'d'.repeat(64)},integrity:{complete:true,row_count:fixtures.fdr.length,dependency_digest:'d'.repeat(64)}};
   const evidence=(ewo,color,source)=>({source,original_ewo:ewo,original_color:color,details:null,construction:null,composition:null,rows:[2],matched:false});
   window.converter={issues:['271080','272205'].map((ewo,i)=>({id:(i?'b':'a').repeat(64),ewo,issue:'name',records:[evidence(ewo,'Different source color','rfd')],context:[evidence(ewo,'Original color','rfd')],editable:[],targets:[],review_sources:['rfd']})),mappings:['271080','272205'].map((ewo,i)=>({id:'map'+i,ewo,source_name:'rfd',from_color:'Old',to_color:'New',valid:true,approved_at:'2026-11-01 00:00:00'})),can_approve:false,sources:Object.fromEntries(Object.keys(RCON_LABELS).map(s=>[s,{head:{id:s},status:'Complete',rows:7}])),integrity:{complete:true,issue_count:2,digest:'f'.repeat(64)}};
   const uploads=[{id:'plan-a',sequence_no:1,planning_month:'2026-11-01',file_name:'Plan A'},{id:'plan-b',sequence_no:2,planning_month:'2026-11-01',file_name:'Plan B'},{id:'plan-empty',sequence_no:3,planning_month:'2026-11-01',file_name:'Empty plan'}];PLAN_UPLOAD_CATALOG=uploads;const select=document.getElementById('planning-sequence-filter');select.replaceChildren(...uploads.map(u=>new Option(u.file_name,u.id)));
   uploads.forEach((u,i)=>{ACTIVE_PLAN_UPLOAD=u;DATA=(i===0?['271080','271444']:i===1?['272205']:[]).map((ewo,j)=>({record_id:j+1,ewo,line:j+1,buyer:'Fixture',style:'T-Shirt',color:'Plan color only',month:'Nov-26',orderqty:100,planqty:100,smv:6,startdate:'2026-11-01',enddate:'2026-11-01'}));DAILY_PLAN=[];SAH_DATA=[];SAH_DAILY=[];CLOCK_HOUR_DATA=[];CLOCK_HOUR_DAILY=[];BUYER_PLAN_DATA=[];MONTHS=['Nov-26'];EFF15_METRIC_DAILY=[];EFF15_METRIC_UPLOAD_ID=u.id;PLANNING_CACHE_VALIDATION={version:planningSnapshotVersion(u),fetchedAt:Date.now()};PLAN_VERSION_CACHE.set(u.id,capturePlanningState());});
   window.requests=0;window.holdRead=false;window.receipt=()=>({headers:[...RFD_HEADERS],rows:fixtures.rfd,report:{id:'rfd-source',file_name:'Original RFD.csv',expected_rows:7,received_rows:7},integrity:{complete:true,row_count:7,batch_id:'rfd-source'}});
   SB.request=async(route,body)=>{requests++;if(route==='rfd'){if(holdRead)return await new Promise(resolve=>window.releaseRead=()=>resolve({data:receipt()}));return{data:receipt()};}if(route==='rfd/fabrics-details')return{data:derived};if(route==='rfd/converter')return{data:converter};const key=route.endsWith('booking')?'booking':'dcs',hs=key==='booking'?BOOKING_HEADERS:DCS_HEADERS;return{data:{headers:[...hs],rows:fixtures[key],report:{id:key,file_name:key+'.csv',expected_rows:7,received_rows:7},integrity:{complete:true,row_count:7,batch_id:key}}};};
   window.openScopeTab=async prefix=>{if(prefix==='rfd')await selectRfdTab('rfd');else await selectRfdTab(prefix);};window.original=JSON.stringify({fixtures,derived,converter});
   select.value='plan-a';switchPlanningInstant('plan-a');goSlide(22);
  }""")
  page.wait_for_function("RFD_ROWS.length===7&&RFD_LOAD===null")
  def choose(plan):
   page.locator('#planning-sequence-filter').select_option(plan);page.wait_for_function('(id)=>ACTIVE_PLAN_UPLOAD?.id===id&&document.body.dataset.planningState==="ready"',arg=plan)
  for prefix,ewo_col,qty_col,total in [('rfd',2,14,'65'),('booking',0,11,'65 KG'),('dcs',3,9,'65'),('fdr',1,6,'65')]:
   page.evaluate('(p)=>openScopeTab(p)',prefix);page.wait_for_timeout(70)
   table=page.locator('#'+prefix+'-table');assert page.evaluate('p=>({rfd:RFD_FILTERED,booking:BOOKING_FILTERED,dcs:DCS_FILTERED,fdr:FDR_FILTERED}[p]).length',prefix)==4
   assert table.locator(f'tfoot [data-total-column="{qty_col}"]').inner_text()==total,(prefix,'wrong selected total')
   assert 'Red' in table.locator('tbody').inner_text() and 'C. Navy' in table.locator('tbody').inner_text();assert 'Praline'not in table.locator('tbody').inner_text()
   buyer=page.locator('#'+prefix+'-buyer');assert 'Other Buyer'not in buyer.inner_text();assert 'Mixed Buyer'not in buyer.inner_text();assert 'Unknown Buyer'not in buyer.inner_text()
   # The shared mode applies before cascades/totals/exports, across all four tables.
   page.locator('#rfd-plan-mode').select_option('without')
   assert page.evaluate('p=>({rfd:RFD_FILTERED,booking:BOOKING_FILTERED,dcs:DCS_FILTERED,fdr:FDR_FILTERED}[p]).length',prefix)==1
   assert 'Praline' in table.locator('tbody').inner_text() and 'Blue' not in table.locator('tbody').inner_text()
   assert table.locator(f'tfoot [data-total-column="{qty_col}"]').inner_text()==('99 KG' if prefix=='booking' else '99')
   assert 'Buyer A' not in buyer.inner_text()
   page.locator('#rfd-plan-mode').select_option('all')
   assert page.evaluate('p=>({rfd:RFD_FILTERED,booking:BOOKING_FILTERED,dcs:DCS_FILTERED,fdr:FDR_FILTERED}[p]).length',prefix)==7
   assert 'Mixed Buyer' in buyer.inner_text() and 'Unknown Buyer' in buyer.inner_text()
   with page.expect_download() as all_download:page.locator('#'+prefix+'-export').click()
   all_rows=list(csv.reader(io.StringIO(Path(all_download.value.path()).read_text(encoding='utf-8-sig'),newline='')))[1:]
   assert all_rows==page.evaluate('p=>fixtures[p]',prefix),'All EWO export lost source rows'
   page.locator('#rfd-plan-mode').select_option('within')
   assert page.evaluate('p=>({rfd:RFD_FILTERED,booking:BOOKING_FILTERED,dcs:DCS_FILTERED,fdr:FDR_FILTERED}[p]).length',prefix)==4
   count=page.evaluate('requests');choose('plan-b');assert page.evaluate('requests')==count,'cached plan switch fetched reports'
   assert 'Praline'in table.locator('tbody').inner_text();assert 'Blue'not in table.locator('tbody').inner_text();assert table.locator(f'tfoot [data-total-column="{qty_col}"]').inner_text()==('99 KG'if prefix=='booking'else'99')
   choose('plan-a');assert page.evaluate('requests')==count
   with page.expect_download()as d:page.locator('#'+prefix+'-export').click()
   downloaded=list(csv.reader(io.StringIO(Path(d.value.path()).read_text(encoding='utf-8-sig'),newline='')))[1:]
   expected=page.evaluate('p=>fixtures[p].slice(1,5)',prefix);assert downloaded==expected,(prefix,'source export changed or included another plan')
   if prefix=='fdr':
    table.locator('tbody [data-fdr-column="3"]').first.click();assert '"source_index": 1'in page.locator('#fdr-evidence-body').inner_text();choose('plan-b');assert not page.locator('#fdr-evidence').is_visible();choose('plan-a')
   choose('plan-empty');assert page.evaluate('p=>({rfd:RFD_FILTERED,booking:BOOKING_FILTERED,dcs:DCS_FILTERED,fdr:FDR_FILTERED}[p]).length',prefix)==0;choose('plan-a')
  page.evaluate("openScopeTab('converter')");page.wait_for_function('RCON_DATA!==null');assert page.locator('#rcon-body [data-rcon-review]').count()==1;assert '271080'in page.locator('#rcon-body').inner_text();assert '272205'not in page.locator('#rcon-map-list').inner_text()
  page.locator('#rfd-plan-mode').select_option('without');assert page.locator('#rcon-body [data-rcon-review]').count()==1;assert '272205' in page.locator('#rcon-body').inner_text();assert '271080' not in page.locator('#rcon-map-list').inner_text()
  page.locator('#rfd-plan-mode').select_option('all');assert page.locator('#rcon-body [data-rcon-review]').count()==2;assert '271080' in page.locator('#rcon-map-list').text_content() and '272205' in page.locator('#rcon-map-list').text_content(),page.locator('#rcon-map-list').inner_html()
  page.locator('#rfd-plan-mode').select_option('within')
  page.locator('#rcon-body [data-rcon-review]').click();assert page.locator('#rcon-review').is_visible();choose('plan-b');assert not page.locator('#rcon-review').is_visible();assert '272205'in page.locator('#rcon-body').inner_text();assert '271080'not in page.locator('#rcon-map-list').inner_text()
  # Late global-source response is always displayed under the CURRENT plan.
  choose('plan-a');page.evaluate("openScopeTab('rfd')");page.evaluate("()=>{holdRead=true;void loadRfdModule(true)}");page.wait_for_function('typeof releaseRead==="function"')
  page.evaluate("setPlanningReadState('loading')");assert page.evaluate('RFD_FILTERED.length')==0;assert page.locator('#rfd-table tfoot [data-total-column="14"]').get_attribute('data-total-state')=='unavailable'
  assert page.evaluate("(()=>{let prevented=false;const ok=exportRfdCSV({preventDefault(){prevented=true}});return prevented&&!ok})()")
  choose('plan-b');page.evaluate('releaseRead()');page.wait_for_function('RFD_LOAD===null');assert page.evaluate('RFD_FILTERED.length')==1;assert 'Praline'in page.locator('#rfd-table tbody').inner_text();assert 'Blue'not in page.locator('#rfd-table tbody').inner_text()
  page.evaluate("()=>{const select=document.getElementById('planning-sequence-filter');select.replaceChildren(new Option('No upload',''));select.dispatchEvent(new Event('change',{bubbles:true}));}");assert page.evaluate('RFD_FILTERED.length')==0;assert not page.evaluate('getRfdPlanScope().ready');page.evaluate("()=>{const s=document.getElementById('planning-sequence-filter');s.replaceChildren(new Option('Plan B','plan-b'));s.value='plan-b';refreshRfdPlanScope();}")
  for width in [1464,721,390]:
   page.set_viewport_size({'width':width,'height':884});page.wait_for_timeout(100);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert 'All colors'in page.locator('#rfd-plan-scope').inner_text()
  page.evaluate("setPlanningReadState('error')");assert page.evaluate('RFD_FILTERED.length')==0
  page.locator('#rfd-plan-mode').select_option('all');assert page.evaluate('RFD_FILTERED.length')==7
  page.locator('#rfd-plan-mode').select_option('without');assert page.evaluate('RFD_FILTERED.length')==0
  page.locator('#rfd-plan-mode').select_option('all')
  assert page.evaluate('JSON.stringify({fixtures,derived,converter})===original'),'original source records changed'
  page.evaluate('siteLogout()');page.wait_for_function('SITE_AUTH_USER===null');assert page.evaluate('RFD_ROWS.length===0&&BOOKING_ROWS.length===0&&DCS_ROWS.length===0&&FDR_ROWS.length===0')
  assert not errors,errors;b.close()
 print('PASS selected-plan EWO/all-color scope across five tabs, real instant cached plan switches, correct totals/original exports/evidence indices, scoped mappings, empty/error/loading fences, late-response isolation, responsive UI and immutable source rows')
finally:server.shutdown()
