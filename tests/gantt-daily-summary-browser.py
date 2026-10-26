"""Offline integration using the actual Gantt markup/renderer and source fixtures."""
import re,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text()
markup=html[html.index('<div class="slide" id="s11"'):html.index('<!-- ─── SLIDE 8:')]
styles='\n'.join(re.findall(r'<style\b[^>]*>(.*?)</style>',html,re.S))+'\n'+(ROOT/'dashboard-theme.css').read_text()+'\n'+(ROOT/'gantt-daily-summary.css').read_text()
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
 page.add_script_tag(content=setup+renderer+'\n'+(ROOT/'gantt-daily-summary.js').read_text()+'\nrenderS11([]);')
 page.wait_for_function("GDS_STATE.source?.loading===false")
 def first(name):return page.locator('#gantt-daily-summary .gds-metric').filter(has=page.locator('th',has_text=name)).locator('td').first.inner_text()
 assert first('Forecastable Pcs')=='540 pcs'
 assert first('Forecastable SAH')=='210 h'
 original=page.locator('#s11-body').inner_html()
 lower=page.locator('#gds-consumable-table').inner_text()
 page.locator('#gds-filter-button').click()
 page.locator('#gds-filter-menu input[value="0"]').uncheck();page.locator('#gds-filter-menu input[value="2"]').uncheck()
 assert first('Forecastable Pcs')=='210 pcs'
 assert first('Forecastable SAH')=='78 h'
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
 # A late source response must not repaint after sign-out/reset.
 page.evaluate('holdSource={};renderS11([]);SITE_SESSION_GENERATION++;SITE_AUTH_USER=null;resetGanttDailySummary();holdSource.resolve(f.embellishment)')
 assert page.locator('#gantt-daily-summary').inner_text()==''
 page.evaluate("SITE_AUTH_USER={id:'fixture2'};holdSource=null;failSource=false;renderS11([])")
 page.wait_for_function('GDS_STATE.source?.loading===false')
 # Long date ranges must keep the dropdown within the visible scroll viewport.
 page.evaluate("for(let d=27;d<=31;d++)DAILY_PLAN.push({record_id:100+d,line:1,ewo:'00123',date:'2026-10-'+d,value:10,smv:12});S11_RANGE_PLAN_ID=null;renderS11([])")
 page.wait_for_function('GDS_STATE.source?.loading===false')
 box=page.locator('#gds-filter-button').bounding_box();assert box['x']>=0 and box['x']+box['width']<=1020,box
 page.locator('#gds-filter-button').click()
 page.screenshot(path='/tmp/gantt-summary-live-integration.png',full_page=True)
 assert not errors,errors
 b.close()
print('PASS actual Gantt integration, WIP multi-select/SAH, unchanged Gantt and lower totals, hide/show persistence, optional source failure, stale-session guard and visible filter on wide dates')
