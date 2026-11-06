"""Real Gantt renderer/popup/summary: saved RFD stock, delivery priority and filters."""
import re,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text();markup=html[html.index('<div class="slide" id="s11"'):html.index('<!-- ─── SLIDE 8:')]
styles='\n'.join(re.findall(r'<style\b[^>]*>(.*?)</style>',html,re.S))+'\n'+'\n'.join((ROOT/p).read_text() for p in ['dashboard-theme.css','gantt-daily-summary.css','gantt-layout.css'])
main=(ROOT/'dashboard-main.js').read_text();renderer=main[main.index("let GANTT_EWO_SEARCH='';"):main.index('\nfunction renderS7(data){')]
fixture=(ROOT/'tests/gantt-delivery-stock.cjs').read_text();fixture=fixture[fixture.index('const raw='):fixture.index('\nconst part=')]
setup=fixture+'''
const f=fixture();let DATA=f.data,DAILY_PLAN=f.plan,SEWING_IO_DATA=f.sewing,DATE_WISE_PRODUCTION_DATA=f.production;
const FABRIC_CUTTING_DATA=[{ewo:'271080',cutable_qty:999999,total_cut_qty:999999}],SAH_DATA=[],CLOCK_HOUR_DATA=[],SAH_DAILY=[],CLOCK_HOUR_DAILY=[];
let SITE_AUTH_USER={id:'fixture'},SITE_SESSION_GENERATION=1,reportsReady=true;
const sharedReportsForSlide=()=>['sewing','production','gantt-cutting','embellishment'],sharedReportsReady=()=>reportsReady;
const loadEwoSource=()=>Promise.resolve([]),prepareSharedReportView=()=>true,getChassisMasterLines=()=>new Set([2,5,8]),ACTIVE_PLAN_UPLOAD={id:'fixture'},activePlanningLabel=()=> 'Fixture',monthFromISO=()=> 'Nov-26';
const N=v=>Number(v)||0,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),getFiltered=()=>[];
const EWO_SOURCE_TTL=60000,loadVersionedData=(_,loader)=>loader();
'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1020,'height':1050});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<!doctype html><meta charset="utf-8"><style>'+styles+'</style><div id="slides-wrap">'+markup+'</div><dialog id="ewo-gantt-dialog"><button class="gt-modal-close" onclick="closeGanttPopup()">Close</button><div id="ewo-gantt-content"></div></dialog>')
 page.evaluate("document.documentElement.dataset.theme='dark';document.getElementById('s11').style.display='block';document.getElementById('s11').classList.add('active')")
 page.add_script_tag(content=setup+'\n'+(ROOT/'gantt-stock.js').read_text()+'\nGANTT_RFD_CUTTING=f.rfdDaily;GANTT_EMBELLISHMENT=f.embellishment;\n'+renderer+'\n'+(ROOT/'gantt-daily-summary.js').read_text()+'\n'+(ROOT/'gantt-hover.js').read_text()+'\nrenderS11([]);gdsToggleVisibility();')
 def metric(name,col=0):return page.locator('#gantt-daily-summary .gds-metric').filter(has=page.locator('th',has_text=name)).locator('td').nth(col).inner_text().replace(' *','')
 assert metric('Forecastable Pcs')=='800 pcs';assert metric('Forecastable Pcs',1)=='1,200 pcs'
 assert metric('Forecastable SAH')=='160 h';assert metric('Forecastable SAH',1)=='240 h'
 assert page.locator('#gds-filter-menu input[value="0"]').is_disabled()
 assert 'All active 4' in page.locator('#gds-filter-button').inner_text()
 assert page.locator('.g-cutable-covered,.g-material-short').count()==0
 assert page.locator('.g-cutting-covered').count()==1
 page.locator('.g-cutting-covered').click();page.wait_for_function("document.getElementById('ewo-gantt-content').textContent.includes('Σ Cutting Today')")
 popup=page.locator('#ewo-gantt-content');assert '10,000' in popup.inner_text();assert '2,000' in popup.inner_text();assert 'Daily.csv' in popup.inner_text();assert '2026-11-10' in popup.inner_text();assert 'Fabrics Booking' not in popup.inner_text()
 page.get_by_role('button',name='Close',exact=True).click()
 before=page.locator('#s11-body').inner_html();lower=page.locator('#gds-consumable-table').inner_text()
 page.locator('#gds-filter-button').click();page.locator('#gds-filter-menu input[value="4"]').uncheck()
 assert metric('Forecastable Pcs')=='0 pcs';assert page.locator('#s11-body').inner_html()==before;assert page.locator('#gds-consumable-table').inner_text()==lower
 page.locator('#gds-filter-menu input[value="4"]').check();page.keyboard.press('Escape')
 page.locator('#gantt-line-filter').select_option('2');assert metric('Forecastable Pcs')=='800 pcs'
 page.locator('#gantt-line-filter').select_option('5');assert metric('Forecastable Pcs',1)=='1,200 pcs'
 page.locator('#gantt-line-filter').select_option('');page.evaluate("S11_RANGE_FROM='2026-11-06';renderS11([])");assert metric('Forecastable Pcs')=='1,200 pcs'
 page.evaluate("S11_RANGE_PLAN_ID=null;ACTIVE_PLAN_UPLOAD.id='new-plan';DATA=DATA.map(r=>({...r,deliverydate:r.line===2?'2026-11-09':r.deliverydate}));renderS11([])")
 assert metric('Forecastable Pcs')=='1,000 pcs';assert metric('Forecastable Pcs',1)=='1,000 pcs'
 page.evaluate('reportsReady=false;renderS11([])');assert metric('Forecastable Pcs')=='—';assert page.locator('#s11-body .g-ewo:not([disabled])').count()==0
 page.evaluate('reportsReady=true;renderS11([])');assert metric('Forecastable Pcs')=='1,000 pcs'
 page.set_viewport_size({'width':721,'height':884});page.screenshot(path='/tmp/gantt-rfd-delivery-721.png',full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.evaluate('SITE_SESSION_GENERATION++;SITE_AUTH_USER=null;resetGanttDailySummary();closeGanttPopup()');assert page.locator('#gantt-daily-summary').inner_text()==''
 assert not errors,errors;b.close()
print('PASS real renderer/popup/summary share RFD quantities and delivery priority; line/date/stage filters conserve reservations; plan switch, legacy isolation, pending reports and compact viewport')
