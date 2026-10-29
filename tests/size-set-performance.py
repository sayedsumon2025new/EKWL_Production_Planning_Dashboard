"""Production parent/iframe regression for source-backed TNA KPIs and drilldowns."""
from pathlib import Path
import re,shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text();start=html.index('<div class="slide" id="s17"');end=html.index('<!--',start+8)
styles=''.join(re.findall(r'<style[^>]*>.*?</style>',html,re.S))
boot='''<script>
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ACTIVE_PLAN_UPLOAD={id:'p1'},DAILY_PLAN=[],DATA=[],SITE_SESSION_GENERATION=1,SITE_AUTH_USER={id:'u1'},REFRESH_ROWS=[],REFRESH_COUNT=0;
const getChassisMasterLines=()=>new Set([1,2]),canAccessSlide=()=>true,siteIsAdmin=()=>true,dataCacheEntry=()=>null;
const activePlanningLabel=()=>ACTIVE_PLAN_UPLOAD?.id||'No Planning Selected';
const loadActiveModuleRows=async()=>{REFRESH_COUNT++;return REFRESH_ROWS.map((row_data,i)=>({row_data,source_row_no:i+2}));};
</script>'''
harness='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'<link rel="stylesheet" href="dashboard-theme.css"><link rel="stylesheet" href="size-set-andon.css"></head><body><nav id="topnav"><div class="brand">EKWL · Production Planning</div></nav><div id="slides-wrap"></div>'+html[start:end].replace('class="slide"','class="slide active"',1)+boot+'<script src="size-set-module.js?v=test"></script><script src="size-set-andon.js?v=test"></script></body></html>'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1464,'height':1000},timezone_id='Asia/Dhaka');page.set_default_timeout(7000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  name=r.request.url.split('/')[-1].split('?')[0]
  if name in ['dashboard-theme.css','size-set-module.js','size-set-andon.js','size-set-andon.css','size-set-tna.html','size-set-tna.js','size-set-tna.css']:
   r.fulfill(path=str(ROOT/name),content_type='text/css' if name.endswith('.css') else 'text/html' if name.endswith('.html') else 'text/javascript')
  elif r.request.url=='http://ekwl.test/':r.fulfill(body=harness,content_type='text/html')
  else:r.abort()
 page.route('**/*',route);page.goto('http://ekwl.test/')
 assert not page.locator('#ss-tna-performance').get_attribute('src')
 rows=[
 {'EWO':'00123','Buyer':'Buyer A','Line':'1','Color':'White','EFD':'15-Jan-27','PP comment Plan':'28-Dec','PP comment Actual':'30-Dec','T & A Closed':'Open'},
 {'EWO':'B','Buyer':'Buyer A','Line':'1','Color':'Black','EFD':'15-Jan-27','PCD':'27-Oct-26','PP comment Plan':'2026-10-20','PP comment Actual':'2026-10-20','Bulk Pattern Actual':'2026-10-20','Who':'Source owner','Remarks':'<img src=x onerror=alert(1)>'},
 {'EWO':'C','Buyer':'Buyer A','Line':'1','Color':'Navy','EFD':'15-Jan-27','PP comment Plan':'2026-10-24','PP comment Actual':''},
 {'EWO':'D','Buyer':'Buyer A','Line':'1','Color':'Blue','EFD':'15-Jan-27','PP comment Plan':'2026-11-01','PP comment Actual':''},
 {'EWO':'E','Buyer':'Buyer A','Line':'1','Color':'Red','EFD':'15-Jan-27','PP comment Plan':'2026-10-22','PP comment Actual':'2026-11-02','Bulk Pattern Actual':'2026-11-02'},
 {'EWO':'<img src=x onerror=alert(1)>','Buyer':'<img src=x onerror=alert(1)>','Line':'2','Color':'Yellow','EFD':'15-Jan-27','PP comment Plan':'31-Feb-26','PP comment Actual':''},
 ]
 page.evaluate('''rows=>{DAILY_PLAN=rows.map((r,i)=>({record_id:i,line:Number(r.Line),ewo:r.EWO,date:'2026-10-26',value:1}));SS_ROWS=rows.map((row_data,i)=>({row_data,source_row_no:i+2}));SS_FILE_NAME='SS.csv';REFRESH_ROWS=rows;renderSizeSetModule();showSizeSetSub('tna');}''',rows)
 frame=page.frame_locator('#ss-tna-performance');frame.locator('#source-label').filter(has_text='SS.csv').wait_for()
 child=page.frames[1]
 frame.locator('#asof').fill('2026-10-25');frame.locator('#asof').dispatch_event('change')
 values=child.evaluate("""()=>({m:METRIC,first:TNA_ORDERS[0].events[0].plan,invalid:parseTnaDate('31-Feb-26'),counts:DATE_COUNTS,completed:ORDERS.filter(r=>r.bulkActual&&r.bulkActual<=$('asof').value).length})""")
 assert values['m']['plan']==5 and values['m']['actual']==1 and values['m']['over']==2 and values['m']['pending']==2,values
 assert round(values['m']['otd'],2)==33.33 and values['completed']==1,values
 assert values['first']=='2026-12-28' and values['invalid']=='' and values['counts']['excluded']==1,values
 assert child.evaluate('METRIC.plan===METRIC.on+METRIC.late+METRIC.over+METRIC.pending')
 assert child.locator('img').count()==0
 # All twelve milestones and the two approved views remain usable; KPI completion includes actual-only rows.
 assert frame.locator('#events tbody tr').count()==12
 frame.locator('#kpi-complete').click()
 assert child.evaluate("ACTION_ROWS.length===1&&ACTION_ROWS[0].order.ewo==='B'&&ACTION_ROWS[0].status==='Completed'")
 frame.locator('[data-detail]').click();assert frame.locator('#detail').is_visible()
 assert frame.locator('.timeline-item').count()==12
 assert 'PCD 27 Oct' in frame.locator('.dialog-head').inner_text()
 assert '<img src=x onerror=alert(1)>' in frame.locator('.timeline-note').inner_text() and child.locator('img').count()==0
 frame.locator('#detail-close').click()
 # Current-owner evidence is not invented for milestones without Who.
 assert child.evaluate("normalizeTnaRows([{'Buyer':'A','EWO':'Z','Pattern Master Name':'Pattern owner','PP comment Plan':'2026-10-20','SS Pattern Plan':'2026-10-20'}],'nearest').orders[0].events[0].owner==='—'")
 # Parent theme updates preserve interactive choices. Shared Source Table filters do not narrow TNA.
 frame.locator('#buyer').select_option('Buyer A');frame.locator('#event').select_option('PP Comment')
 assert child.evaluate("STATUS==='All'&&ACTION_ROWS.every(e=>e.event==='PP Comment')")
 page.evaluate("document.documentElement.dataset.theme='dark'")
 child.wait_for_function("document.documentElement.dataset.theme==='dark'")
 assert frame.locator('#buyer').input_value()=='Buyer A' and frame.locator('#event').input_value()=='PP Comment'
 page.evaluate("document.getElementById('ss-search').value='00123';renderSizeSetModule()")
 assert page.evaluate('SS_FILTERED.length===1') and child.evaluate('TNA_ORDERS.length===6')
 page.evaluate("showSizeSetSub('raw');showSizeSetSub('tna');renderSizeSetModule()")
 assert frame.locator('#event').input_value()=='PP Comment'
 # Switching from a scrolled Source Table must not retain a hidden outer scroll offset.
 page.evaluate("showSizeSetSub('raw');document.getElementById('ss-raw-view').style.minHeight='1600px';document.getElementById('s17').scrollTop=80")
 assert page.evaluate("document.getElementById('s17').scrollTop>0")
 page.evaluate("showSizeSetSub('tna')")
 assert page.evaluate("document.getElementById('s17').scrollTop===0"), 'TNA retains Source Table scroll offset'
 # Parent export/source controls are hidden in TNA only. The iframe occupies the remaining viewport.
 assert page.locator('.ss-controls').is_hidden() and page.locator('#ss-source').is_hidden()
 assert page.locator('#s17>.slide-header').is_hidden()
 for width in [1910,1464,1401,1400,926,784,640,420]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert page.evaluate("document.getElementById('s17').scrollHeight<=document.getElementById('s17').clientHeight"),width
  assert child.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  assert page.evaluate("(()=>{const tabs=document.querySelector('#s17 .ss-tabs').getBoundingClientRect(),nav=document.getElementById('topnav').getBoundingClientRect();return tabs.top>=nav.bottom&&document.elementFromPoint(tabs.left+10,tabs.top+10).closest('.ss-tabs')!==null})()"),width
  box=page.locator('#ss-tna-performance').bounding_box();assert box['height']>600 and box['y']+box['height']<=1000,width
  page.screenshot(path=f'/tmp/tna-kpi-production-{width}.png')
 frame.locator('#kpi-overdue').click();assert child.evaluate("ACTION_ROWS.every(e=>e.status==='Overdue')")
 frame.locator('#event').select_option('');frame.locator('#overview-tab').click();frame.locator('#events [data-event="SS Fabric"]').click()
 assert frame.locator('#event').input_value()=='SS Fabric'
 # Date inference can be disabled without changing actual explicit-year dates.
 frame.locator('.method summary').click();frame.locator('#date-policy').select_option('explicit')
 assert child.evaluate("!TNA_ORDERS[0].events[0].plan&&TNA_ORDERS[1].events[0].plan==='2026-10-20'")
 assert child.evaluate("classify({plan:'2026-10-25',actual:''},'2026-10-25')==='Due today'&&classify({plan:'2026-10-24',actual:'2026-10-30'},'2026-10-25')==='Overdue'")
 # Reject messages from non-parent windows or wrong origins.
 before=child.evaluate('TNA_ORDERS.length')
 child.evaluate("window.postMessage({type:'ekwl:size-tna',rows:[]},location.origin)")
 child.evaluate("window.dispatchEvent(new MessageEvent('message',{origin:'https://invalid.test',source:parent,data:{type:'ekwl:size-tna',rows:[]}}))")
 page.wait_for_timeout(50);assert child.evaluate('TNA_ORDERS.length')==before
 # Plan changes clear local filters, restrict source rows and close detail dialogs.
 page.evaluate("ACTIVE_PLAN_UPLOAD={id:'p2'};DAILY_PLAN=[{line:1,ewo:'B',date:'2026-10-27',value:1}];renderSizeSetModule()")
 child.wait_for_function("TNA_ORDERS.length===1&&TNA_ORDERS[0].ewo==='B'")
 assert frame.locator('#buyer').input_value()=='' and frame.locator('#event').input_value()==''
 # Refresh reuses the authenticated parent snapshot loader; empty reports clear all previous rows.
 page.evaluate('REFRESH_ROWS=[]');frame.locator('#refresh').click()
 child.wait_for_function('TNA_ORDERS.length===0')
 assert page.evaluate('REFRESH_COUNT===1') and frame.locator('#refresh').is_enabled()
 assert frame.locator('#otd').inner_text()=='—' and child.evaluate('METRIC.due===0')
 page.evaluate("ACTIVE_PLAN_UPLOAD=null;DAILY_PLAN=[];renderSizeSetModule()")
 child.wait_for_function('TNA_ORDERS.length===0')
 page.evaluate('resetSizeSetModule()')
 assert not page.locator('#ss-tna-performance').get_attribute('src')
 assert not errors,errors
 browser.close()
print('PASS production TNA snapshot bridge, source fields/grain, KPI conservation, completion without Plan, date inference/cutoff, independent filters, source-owner evidence, timeline, theme, origin guards, refresh/empty/plan/logout clearing and responsive shell.')
