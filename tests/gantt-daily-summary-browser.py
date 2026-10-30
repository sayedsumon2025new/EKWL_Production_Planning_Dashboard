"""Offline integration using the actual Gantt markup/renderer and source fixtures."""
import re,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text()
markup=html[html.index('<div class="slide" id="s11"'):html.index('<!-- ─── SLIDE 8:')]
styles='\n'.join(re.findall(r'<style\b[^>]*>(.*?)</style>',html,re.S))+'\n'+(ROOT/'dashboard-theme.css').read_text()+'\n'+(ROOT/'gantt-daily-summary.css').read_text()+'\n'+(ROOT/'gantt-layout.css').read_text()
main=(ROOT/'dashboard-main.js').read_text();renderer=main[main.index("let GANTT_EWO_SEARCH='';"):main.index('\nfunction renderS7(data){')]
fixture=(ROOT/'tests/gantt-daily-summary.cjs').read_text();fixture=fixture[fixture.index('function fixture(){'):fixture.index('\nconst build=')]
setup=fixture+'''
const f=fixture();
const DATA=f.data,DAILY_PLAN=f.plan,SAH_DAILY=f.sah,CLOCK_HOUR_DAILY=f.clock,FABRIC_CUTTING_DATA=f.fabric,SEWING_IO_DATA=f.sewing,DATE_WISE_PRODUCTION_DATA=[{line_no:1,ewo:'00123',output_date:'2026-10-24',total_qty:0}],SAH_DATA=[],CLOCK_HOUR_DATA=[];
let SITE_AUTH_USER={id:'fixture'},SITE_SESSION_GENERATION=1,failSource=false,holdSource=null;
const loadEwoSource=()=>holdSource?new Promise(resolve=>holdSource.resolve=resolve):failSource?Promise.reject(Error('fixture source unavailable')):Promise.resolve(f.embellishment);
const prepareSharedReportView=()=>true,getChassisMasterLines=()=>new Set([1,2,3]),ACTIVE_PLAN_UPLOAD={id:'fixture'},activePlanningLabel=()=> 'Fixture',monthFromISO=()=> 'Oct-26';
const N=v=>Number(v)||0,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getFiltered=()=>[];
'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1020,'height':1050},timezone_id='Asia/Dhaka')
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<!doctype html><meta charset="utf-8"><style>'+styles+'</style><div id="slides-wrap">'+markup+'</div>')
 page.evaluate("document.documentElement.dataset.theme='dark';document.getElementById('s11').style.display='block';document.getElementById('s11').classList.add('active')")
 page.add_script_tag(content=setup+renderer+'\n'+(ROOT/'gantt-daily-summary.js').read_text()+'\nrenderS11([]);gdsToggleVisibility();')
 page.wait_for_function("GDS_STATE.source?.loading===false")
 def first(name):return page.locator('#gantt-daily-summary .gds-metric').filter(has=page.locator('th',has_text=name)).locator('td').first.inner_text().replace(' *','')
 assert page.locator('#gds-filter-menu input').count()==5
 assert page.locator('#gds-filter-menu').get_by_text('Cutting WIP',exact=True).count()==1
 assert 'All 5' in page.locator('#gds-filter-button').inner_text()
 assert first('Forecastable Pcs')=='300 pcs'
 assert first('Forecastable SAH')=='90 h'
 assert page.locator('#gantt-daily-summary .gds-metric').filter(has=page.locator('th',has_text='Forecastable Pcs')).locator('td').nth(1).inner_text().replace(' *','')=='0 pcs'
 page.evaluate("S11_RANGE_FROM='2026-10-26';renderS11([])")
 page.wait_for_function('GDS_STATE.source?.loading===false')
 assert first('Forecastable Pcs')=='0 pcs'
 page.evaluate('S11_RANGE_PLAN_ID=null;renderS11([])')
 page.wait_for_function('GDS_STATE.source?.loading===false')
 original=page.locator('#s11-body').inner_html()
 lower=page.locator('#gds-consumable-table').inner_text()
 page.locator('#gds-filter-button').click()
 page.locator('#gds-filter-menu input[value="4"]').uncheck();page.locator('#gds-filter-menu input[value="0"]').uncheck();page.locator('#gds-filter-menu input[value="2"]').uncheck()
 assert first('Forecastable Pcs')=='170 pcs'
 assert first('Forecastable SAH')=='58 h'
 assert page.locator('#s11-body').inner_html()==original
 assert page.locator('#gds-consumable-table').inner_text()==lower
 page.keyboard.press('Escape')
 page.locator('#gds-visibility').click()
 assert not page.locator('#gds-filter-button').is_visible()
 assert page.locator('#s11-body').is_visible()
 page.locator('#gds-visibility').click()
 assert page.locator('#gds-filter-button').inner_text()=='Consumable WIP · 2 selected ▾'
 page.locator('#gds-filter-button').click();page.locator('#gds-filter-menu input[value="1"]').uncheck()
 assert first('Forecastable Pcs')=='150 pcs'
 # A failed optional source must not remove known Sewing WIP or Gantt rows.
 page.evaluate('failSource=true;renderS11([])')
 page.wait_for_function('GDS_STATE.source?.error===true')
 assert first('Forecastable Pcs')=='150 pcs'
 assert 'could not load' in page.locator('#gds-note').inner_text()
 # Mixed coverage reproduces the live all-dashes bug: retain known amounts.
 page.evaluate('failSource=false;FABRIC_CUTTING_DATA.pop();GDS_STATE.selected=new Set([0,1,2,3]);renderS11([])')
 page.wait_for_function('GDS_STATE.source?.loading===false')
 assert '300' in first('Forecastable Pcs')
 assert '90' in first('Forecastable SAH')
 assert page.locator('#gantt-daily-summary .gds-metric').filter(has=page.locator('th',has_text='Forecastable Pcs')).locator('.gds-partial').first.is_visible()
 assert page.locator('#gds-consumable-table .gds-partial').count()>0
 assert 'Available WIP subtotal' in page.locator('#gds-note').inner_text()
 FABRIC_RESTORE={'ewo':'B','cutable_qty':200}
 page.evaluate('row=>FABRIC_CUTTING_DATA.push(row)',FABRIC_RESTORE)
 # A late source response must not repaint after sign-out/reset.
 page.evaluate('holdSource={};renderS11([]);SITE_SESSION_GENERATION++;SITE_AUTH_USER=null;resetGanttDailySummary();holdSource.resolve(f.embellishment)')
 assert page.locator('#gantt-daily-summary').inner_text()==''
 page.evaluate("SITE_AUTH_USER={id:'fixture2'};holdSource=null;failSource=false;renderS11([])")
 page.wait_for_function('GDS_STATE.source?.loading===false')
 page.evaluate('gdsToggleVisibility()')
 # Long date ranges must keep the dropdown within the visible scroll viewport.
 page.evaluate("for(let d=27;d<=31;d++)DAILY_PLAN.push({record_id:100+d,line:1,ewo:'00123',date:'2026-10-'+d,value:10,smv:12});S11_RANGE_PLAN_ID=null;renderS11([])")
 page.wait_for_function('GDS_STATE.source?.loading===false')
 box=page.locator('#gds-filter-button').bounding_box();assert box['x']>=0 and box['x']+box['width']<=1020,box
 page.locator('#gds-filter-button').click()
 page.screenshot(path='/tmp/gantt-summary-live-integration.png',full_page=True)
 # Compact layout: use the actual export setup and tab-switch function.
 exports=main[main.index('async function copyReportData('):main.index("document.addEventListener('DOMContentLoaded',setupReportActions);")]
 calendar=(ROOT/'gantt-action-calendars.js').read_text()
 switch=calendar[calendar.index('function showGanttActionTab('):calendar.index('function ganttActionPickMonth(')]
 page.add_script_tag(content=exports+"\nsetupReportActions();")
 page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.fixtureCopied=text}})")
 page.evaluate('if(!GDS_STATE.hidden)gdsToggleVisibility()')
 page.set_viewport_size({'width':1910,'height':970})
 box=page.locator('.gantt-wrap').bounding_box()
 assert box['y']<320 and box['height']>500,box
 tabs=page.locator('.gantt-tabs').bounding_box();exportsBox=page.locator('#s11>.card>.report-actions').bounding_box()
 assert abs(tabs['y']-exportsBox['y'])<8,(tabs,exportsBox)
 page.get_by_role('button',name='Copy data',exact=True).click()
 assert '00123' in page.evaluate('window.fixtureCopied')
 page.add_script_tag(content="const GANTT_ACTION_NAMES={psd:'PSD'};let GANTT_ACTION_TAB='gantt',GANTT_ACTION_MONTH='',GANTT_ACTION_DAY=0,GANTT_ACTION_NOTICE='',GANTT_ACTION_REQUEST=0;function renderGanttActionCalendar(){document.getElementById('gantt-action-body').textContent='PSD calendar fixture';}\n"+switch)
 page.locator('#gantt-tab-psd').click()
 assert page.locator('#gantt-action-view').is_visible() and not page.locator('#gantt-main-view').is_visible()
 page.locator('#gantt-tab-gantt').click()
 assert page.locator('#gantt-main-view').is_visible() and not page.locator('#gantt-action-view').is_visible()
 page.screenshot(path='/tmp/gantt-compact-live-desktop.png')
 page.set_viewport_size({'width':1020,'height':884})
 box=page.locator('.gantt-wrap').bounding_box();assert box['height']>350,box
 assert page.evaluate('document.documentElement.scrollWidth')<=1020
 page.locator('#gds-visibility').click()
 assert page.locator('#gds-filter-button').is_visible()
 page.locator('#gds-filter-button').click();assert page.locator('#gds-filter-menu').is_visible()
 page.keyboard.press('Escape')
 page.screenshot(path='/tmp/gantt-compact-live-summary.png')
 # Real received Cutting WIP, using the shared production calculator rather than a stub.
 helpers=main[main.index('function fabricEwoColorKey('):main.index('function fabricCuttingCascade(')]+main[main.index('function s12CuttingWipMetric('):main.index('function renderS12(')]
 page.add_script_tag(content=helpers)
 page.evaluate("""()=>{
 DATA.splice(0,DATA.length,{record_id:1,line:1,ewo:'CUT-DEMO',color:'White',smv:6,manpower:20,print:'No',emb:'No'});
 DAILY_PLAN.splice(0,DAILY_PLAN.length,...['2026-10-25','2026-10-26'].map((date,i)=>({record_id:i+1,line:1,ewo:'CUT-DEMO',color:'Navy',date,value:1000,smv:6})));
 FABRIC_CUTTING_DATA.splice(0,FABRIC_CUTTING_DATA.length,{ewo:'CUT-DEMO',color_name:'White',total_cut_qty:10000,cutable_qty:0});
 SEWING_IO_DATA.splice(0,SEWING_IO_DATA.length,{line_no:1,ewo:'CUT-DEMO',color:'White',input:8000,wip:0});
 f.embellishment.splice(0);GDS_STATE.selected=new Set([0,1,2,3,4]);S11_RANGE_PLAN_ID=null;GANTT_EWO_SEARCH='';renderS11([]);
 }""")
 page.wait_for_function('GDS_STATE.source?.loading===false')
 assert first('Forecastable Pcs')=='1,000 pcs'
 assert first('Forecastable SAH')=='100 h'
 assert page.locator('#gds-consumable-table tbody tr').filter(has=page.locator('th',has_text='Cutting WIP')).locator('td').first.text_content()=='1,000'
 page.evaluate('gdsSelectAll(false);GDS_STATE.open=true;paintGanttDailySummary()')
 page.locator('#gds-filter-menu input[value="4"]').check()
 assert first('Forecastable Pcs')=='1,000 pcs'
 assert page.locator('#gds-filter-button').inner_text()=='Consumable WIP · 1 selected ▾'
 page.locator('#gds-filter-menu').get_by_role('button',name='Select all',exact=True).click()
 assert 'All 5' in page.locator('#gds-filter-button').inner_text()
 page.set_viewport_size({'width':784,'height':884});page.locator('#gds-filter-button').scroll_into_view_if_needed()
 page.screenshot(path='/tmp/gds-cutting-stage-five.png')
 assert not errors,errors
 # Real shared-report lifecycle: planning must remain visible while WIP waits/fails.
 progressive=b.new_page(viewport={'width':1020,'height':1050})
 progressive.on('pageerror',lambda e:errors.append(str(e)))
 progressive.set_content('<!doctype html><meta charset="utf-8"><style>'+styles+'</style><div id="slides-wrap">'+markup+'</div>')
 progressive.evaluate("document.documentElement.dataset.theme='dark';const s=document.getElementById('s11');s.dataset.logicalSlide='7';s.classList.add('active');s.style.display='block'")
 progressive_setup=setup.replace('const DATA=f.data','let DATA=f.data').replace('const prepareSharedReportView=()=>true,','const ')
 lifecycle="""
 let CURRENT_SLIDE=7;const canAccessSlide=()=>true,setLoadChip=()=>{},setSupabaseLiveBadge=()=>{},setStatus=()=>{},saveFastBootCache=()=>{},saveDashboardCache=async()=>{};
 const waiting={};const SB={reportSnapshot:kind=>new Promise((resolve,reject)=>waiting[kind]={resolve,reject})};
 const snapshots={fabric:f.fabric,sewing:f.sewing.map(r=>({...r,total_input_qty:r.input,total_output_qty:r.output??0,total_wip_qty:r.wip,total_reject_qty:r.reject??0})),production:DATE_WISE_PRODUCTION_DATA};
 function finishReport(kind){const rows=snapshots[kind];waiting[kind].resolve({data:{format:'report-rows-v1',kind,rows,integrity:{complete:true,row_count:rows.length}},error:null});}
 function renderSlide(){renderS11([]);}
 """
 progressive.add_script_tag(content=progressive_setup+lifecycle+(ROOT/'shared-report-loader.js').read_text()+renderer+(ROOT/'gantt-daily-summary.js').read_text()+";window.summaryBuilds=0;const originalBuild=buildGanttDailySummary;buildGanttDailySummary=(...a)=>{window.summaryBuilds++;return originalBuild(...a)};renderS11([]);")
 assert progressive.locator('#s11-body .g-ewo').count()>0
 assert progressive.locator('#s11-body').evaluate("e=>getComputedStyle(e).visibility")=='visible'
 assert progressive.locator('#s11-body .g-ewo').first.is_disabled()
 assert progressive.locator('#s11-body .g-wip-covered,#s11-body .g-cutting-covered,#s11-body .g-material-short').count()==0
 assert progressive.evaluate('window.summaryBuilds')==0,'closed summaries must not allocate full-plan stock'
 progressive.evaluate('gdsToggleVisibility()')
 forecast=progressive.locator('#gantt-daily-summary .gds-metric').filter(has=progressive.locator('th',has_text='Forecastable Pcs')).locator('td').first
 assert forecast.inner_text()=='—'
 assert 'loading or unavailable' in progressive.locator('#gds-note').inner_text()
 progressive.evaluate("waiting.fabric.reject(Error('source failed'));finishReport('sewing');finishReport('production')")
 progressive.wait_for_function("document.getElementById('s11').dataset.reportState==='planning-error'")
 assert progressive.locator('#s11-body .g-ewo').count()>0
 assert forecast.inner_text()=='—'
 progressive.evaluate('renderS11([]);finishReport("fabric")')
 progressive.wait_for_function("sharedReportsReady(['fabric','sewing','production'])&&GDS_STATE.source?.loading===false")
 assert not progressive.locator('#s11-body .g-ewo').first.is_disabled()
 assert forecast.inner_text().replace(' *','')=='300 pcs'
 assert not errors,errors
 b.close()
print('PASS actual Gantt integration, WIP multi-select/SAH, unchanged Gantt and lower totals, hide/show persistence, optional source failure, stale-session guard and visible filter on wide dates')
