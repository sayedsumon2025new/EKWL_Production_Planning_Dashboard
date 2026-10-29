"""Real parent bridge/iframe UI, mocked private API; no source report data."""
import json,shutil,re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1464,'height':1000})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 html=(ROOT/'load-analysis.html').read_text()
 # Do not load the screenshot dependency over the network during this test.
 html=re.sub(r'<script src="frontend-runtime[^>]*></script>','',html)
 store={};calls=[]
 def route(r):
  path=r.request.url.split('?')[0].split('/')[-1]
  if path=='host':r.fulfill(content_type='text/html',body='<iframe id="load-analysis-workspace" src="/load-analysis.html" style="width:100%;height:940px;border:0"></iframe>')
  elif path=='load-analysis.html':r.fulfill(content_type='text/html',body=html)
  elif path in ['load-analysis-plan-row.js','load-analysis-loss.js']:r.fulfill(content_type='application/javascript',body=(ROOT/path).read_text())
  else:r.fulfill(status=404,body='')
 page.route('https://ekwl.test/**',route)
 page.goto('https://ekwl.test/host')
 setup='''
 let SITE_AUTH_USER={id:'account-a'},SITE_SESSION_GENERATION=1,CURRENT_SLIDE=20,ACTIVE_PLAN_UPLOAD={id:'11111111-1111-4111-8111-111111111111'},EFF15_METRIC_UPLOAD_ID=ACTIVE_PLAN_UPLOAD.id;
 const dates=['2026-10-25','2026-10-26'];
 const DATA=[{line:1,ewo:'272718',smv:6,manpower:31,print:'No',emb:'No'}],DAILY_PLAN=dates.map((date,i)=>({record_id:i+1,line:1,ewo:'272718',date,value:1000,smv:6})),SAH_DAILY=dates.map(date=>({record_id:99,line:1,ewo:'272718',date,value:100})),CLOCK_HOUR_DAILY=[],FABRIC_CUTTING_DATA=[{ewo:'272718',cutable_qty:0}],SEWING_IO_DATA=[{line_no:1,ewo:'272718',color:'White',wip:600}],DATE_WISE_PRODUCTION_DATA=[{output_date:'2026-10-24'}],EFF15_METRIC_DAILY=dates.map(date=>({record_id:99,line:1,ewo:'272718',date,value:100,criteria:'SAH/Day'}));
 const canAccessSlide=()=>true,getChassisMasterLines=()=>new Set([1]),activePlanningLabel=()=> 'P02 fixture',getABPTarget=()=>({metrics:[['Daily Capacity','120 Hour']]}),ensureSharedReports=()=>Promise.resolve(),invalidateSharedReports=()=>{},invalidateEwoSources=()=>{};
 let hold=null,deny=false,overrides={},requests=[];
 const loadEwoSource=async type=>{if(hold)await new Promise(resolve=>hold.resolve=resolve);return type==='embellishment'?[{'EWO No':'272718','Today Print Send Qty\\n':30,' Today Print Receive Qty':0,'Today EMB Send Qty':20,'Today EMB Receive Qty':0}]:[];};
 const SB={request:async(route,data)=>{requests.push(data);if(deny&&data.action!=='list')return {error:{message:'Save unavailable'}};if(data.action==='save')overrides[data.key]={reason:data.reason,note:data.note};if(data.action==='reset')overrides={};return {data:{overrides:structuredClone(overrides)}};}};
 '''
 # Mock embellishment supplies 50 additional pcs of usable stock on the first
 # date; agreed positive WIP rule supplies both delay flags.
 page.add_script_tag(content=setup+'\n'+(ROOT/'gantt-daily-summary.js').read_text()+'\n'+(ROOT/'load-analysis-loss.js').read_text()+'\n'+(ROOT/'load-analysis-bridge.js').read_text()+'\nrefreshLoadAnalysisPlan();')
 frame=page.frame_locator('#load-analysis-workspace')
 page.wait_for_function('LOAD_ANALYSIS_MODEL!==null')
 def forecast():return [v.replace('*','') for v in frame.locator('#load-analysis-summary-table .source-row td').all_text_contents()[1:3]]
 assert forecast()==['60','0'],forecast()
 assert frame.locator('.la-donut').count()==1
 assert frame.locator('[data-dept]').count()==4
 assert frame.locator('#la-donut-value').text_content().replace('*','')=='180'
 assert frame.locator('#la-department-note').inner_text().replace('*','').endswith('Total: 180 SAH · Loss table: 180 SAH.')
 frame.locator('.la-department-panel').screenshot(path='/tmp/load-analysis-department-multicolor.png')
 assert page.evaluate('LOAD_ANALYSIS_MODEL.model.days.map(d=>d.forecast)')==[60,0]
 # Both flags preserved; Print receives the uncovered SAH once by priority.
 assert page.evaluate("LOAD_ANALYSIS_MODEL.model.records[0].evidence.map(x=>x.reason)")==['print','emb']
 assert page.evaluate('LOAD_ANALYSIS_MODEL.model.days[0].buckets.print')==3
 frame.locator('#sources').evaluate('(node)=>node.open=true')
 frame.locator('[data-edit]').first.click()
 frame.locator('#edit-reason').select_option('fabric');frame.locator('#edit-note').fill('Operator confirmed fabric shortage')
 frame.locator('#save-edit').click()
 page.wait_for_function("LOAD_ANALYSIS_MODEL?.model.records[0]?.manual?.reason==='fabric'")
 assert forecast()==['60','0']
 assert page.evaluate('LOAD_ANALYSIS_MODEL.model.days[0].buckets.fabric')==35
 frame.locator('[data-dept="textile"]').click()
 assert frame.locator('#la-donut-value').text_content().replace('*','')=='35'
 assert frame.locator('#la-donut-label').text_content()=='TEXTILE'
 assert frame.locator('#la-department-note').inner_text().replace('*','').endswith('Total: 180 SAH · Loss table: 180 SAH.')
 frame.locator('[data-dept="textile"]').click()
 assert page.evaluate('requests.filter(r=>r.action===\'save\').length')==1
 # Failure does not invent a saved correction.
 page.evaluate('deny=true')
 frame.locator('[data-edit]').first.click();frame.locator('#save-edit').click()
 frame.locator('#edit-error').filter(has_text='Save unavailable').wait_for()
 assert frame.locator('#edit-dialog').is_visible()
 frame.locator('#cancel-edit').click();page.evaluate('deny=false')
 frame.locator('#clear-overrides').click()
 page.wait_for_function('LOAD_ANALYSIS_MODEL?.model.records[0]?.manual===null')
 # A forged message origin/source cannot overwrite state.
 page.evaluate("document.getElementById('load-analysis-workspace').contentWindow.postMessage({type:'wrong',model:{}},location.origin)")
 assert forecast()==['60','0']
 # Sign-out clears the iframe and ignores all late reads.
 page.evaluate('hold={};refreshLoadAnalysisPlan();SITE_SESSION_GENERATION++;SITE_AUTH_USER=null;refreshLoadAnalysisPlan();hold.resolve?.()')
 frame.locator('#load-analysis-summary-table .source-row td').nth(1).filter(has_text='—').wait_for()
 assert frame.locator('#la-donut-value').text_content().replace('*','')=='—'
 assert frame.locator('[data-dept]').count()==0
 page.evaluate("hold=null;SITE_AUTH_USER={id:'account-b'};overrides={};refreshLoadAnalysisPlan()")
 page.wait_for_function('LOAD_ANALYSIS_MODEL!==null')
 assert forecast()==['60','0']
 page.set_viewport_size({'width':1020,'height':884})
 assert frame.locator('body').evaluate('document.documentElement.scrollWidth<=innerWidth')
 frame.locator('#sources').evaluate('(node)=>node.open=false')
 page.screenshot(path='/tmp/load-analysis-production-integration.png',full_page=True)
 # Reproduce the operator's 16-day report with large totals and partial markers.
 # Every numeric column stays readable; wide screens use the whole viewport.
 page.evaluate("""()=>{
  const dates=Array.from({length:16},(_,i)=>new Date(Date.UTC(2026,9,26+i)).toISOString().slice(0,10));
  const model=structuredClone(LOAD_ANALYSIS_MODEL.model);
  model.days=dates.map(date=>({...model.days[0],date,target:10133,plan:9742,ganttForecast:8045.3,printSah:1786.9,embSah:0,forecast:6258.5,loss:3874.5,partial:true,buckets:Object.fromEntries(Object.keys(model.days[0].buckets).map(key=>[key,key==='unknown'?3874.5:0]))}));
  model.records=[];
  document.getElementById('load-analysis-workspace').contentWindow.postMessage({type:'ekwl-load-analysis-plan',ready:true,uploadId:ACTIVE_PLAN_UPLOAD.id,dates,totals:Object.fromEntries(dates.map(date=>[date,9742])),dailyCapacity:10133,label:'Wide-range layout fixture',model,canCorrect:false},location.origin);
 }""")
 frame.locator('#load-analysis-loss-table thead tr').nth(1).locator('th').nth(17).wait_for()
 for viewport in [{'width':1910,'height':970},{'width':1464,'height':884},{'width':1020,'height':884}]:
  page.set_viewport_size(viewport)
  page.wait_for_timeout(100)
  metrics=frame.locator('body').evaluate("""()=>{
   const table=document.getElementById('load-analysis-loss-table'),row=table.tBodies[0].rows[0];
   return {viewport:innerWidth,page:document.querySelector('.page').getBoundingClientRect().width,document:document.documentElement.scrollWidth,day:row.cells[2].getBoundingClientRect().width,transform:getComputedStyle(table).transform,overlap:[...table.tBodies[0].rows].some(r=>[...r.cells].some(c=>c.scrollWidth>c.clientWidth+2)),total:row.cells[row.cells.length-2].getBoundingClientRect().width,wrap:table.parentElement.clientWidth,table:table.getBoundingClientRect().width};
  }""")
  assert metrics['document']<=metrics['viewport'],metrics
  assert metrics['page']>=metrics['viewport']-30,metrics
  assert metrics['day']>=75 and metrics['total']>=99,metrics
  assert metrics['transform']=='none' and not metrics['overlap'],metrics
  if viewport['width']==1910:assert metrics['table']<=metrics['wrap']+1,metrics
  page.screenshot(path='/tmp/load-analysis-fit-'+str(viewport['width'])+'.png',full_page=True)
  frame.locator('.la-department-panel').screenshot(path='/tmp/load-analysis-department-'+str(viewport['width'])+'.png')
 assert not errors,errors
 b.close()
print('PASS real Load Analysis iframe/parent, Gantt forecast, positive-WIP delay evidence, primary-reason conservation, API corrections/error/reset, sign-out/stale-owner guards and responsive tables')
