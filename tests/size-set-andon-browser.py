"""Actual Andon markup/module regression with synthetic planning and Size Set rows."""
from pathlib import Path
import re,shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text();start=html.index('<div class="slide" id="s17"');end=html.index('<!--',start+8)
styles=''.join(re.findall(r'<style[^>]*>.*?</style>',html,flags=re.S))
boot='''<script>
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ACTIVE_PLAN_UPLOAD={id:'p1'},DAILY_PLAN=[],SITE_SESSION_GENERATION=1,SITE_AUTH_USER={id:'u1'};
const getChassisMasterLines=()=>new Set([1,2,3]),canAccessSlide=()=>true,activePlanningLabel=()=>ACTIVE_PLAN_UPLOAD.id;
const dataCacheEntry=()=>null,siteIsAdmin=()=>true;
</script>'''
harness='<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'<link rel="stylesheet" href="size-set-andon.css"></head><body><div id="slides-wrap">'+html[start:end].replace('class="slide"','class="slide active"',1)+'</div>'+boot+'<script defer src="size-set-module.js"></script><script defer src="size-set-andon.js"></script></body></html>'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1464,'height':884});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  name=r.request.url.split('/')[-1].split('?')[0]
  if name in ['size-set-module.js','size-set-andon.js','size-set-andon.css','size-set-tna.html']:
   r.fulfill(path=str(ROOT/name))
  elif r.request.url=='http://andon.test/':r.fulfill(body=harness,content_type='text/html')
  else:r.abort()
 page.route('**/*',route);page.goto('http://andon.test/')
 page.evaluate('''()=>{
 const plan=(id,line,ewo,date,value,buyer='Buyer A')=>({record_id:id,line,ewo,date,value,buyer});
 DAILY_PLAN=[plan(1,1,'A','2026-10-26',10),plan(1,1,'A','2026-10-27',20),plan(2,1,'B','2026-10-28',30),plan(3,2,'A','2026-10-27',40,'Buyer B'),plan(4,2,'C','2026-10-26',5),plan(5,2,'D','2026-10-29',5),plan(6,3,'MISSING','2026-10-26',8),plan(7,46,'INVALID','2026-10-26',8)];
 const row=(EWO,action,When='')=>({row_data:{EWO,'Next Action to Do\\n(What)':action,When}});
 SS_ROWS=[row('A','Closed'),row('B','Bulk Pattern','28-Oct-26'),row('C','Bulk Pattern','31-Feb-26'),row('D','SS Fabric','29-Oct'),row('REPORT_ONLY','Closed')];
 showSizeSetSub('andon');
 }''')
 assert page.locator('#ss-tab-andon').get_attribute('aria-selected')=='true'
 assert page.locator('[data-ssa-cell]').count()==6
 assert page.locator('.ssa-ewo.ssa-green').count()==2
 assert page.locator('.ssa-ewo.ssa-amber').count()==1
 assert page.locator('.ssa-ewo.ssa-red').count()==3
 assert page.evaluate("SSA_VISIBLE.every(r=>r.ewo!=='REPORT_ONLY'&&r.line!==46)")
 # Signed/duplicate source rows and color aggregation are resolved before first-date selection.
 assert page.evaluate("ssaBuildPlan([{record_id:1,line:1,ewo:'123.0',date:'2026-10-26',value:8},{record_id:1,line:1,ewo:'123.0',date:'2026-10-26',value:8},{record_id:2,line:1,ewo:'123',date:'2026-10-26',value:-8},{record_id:1,line:1,ewo:'123',date:'2026-10-27',value:5}],new Set([1])).entries[0].date==='2026-10-27'")
 assert page.evaluate("ssaStatus([{row_data:{[SSA_ACTION]:'close'}},{row_data:{[SSA_ACTION]:'Bulk Pattern',When:'28-Oct'}}]).color==='amber'")
 assert page.evaluate("ssaValidDate('2026-10-28')&&!ssaValidDate('2026-02-31')")
 page.locator('#ssa-from').fill('2026-10-27');page.locator('#ssa-from').dispatch_event('change')
 assert page.evaluate("SSA_VISIBLE.filter(r=>r.ewo==='A').length===1&&SSA_VISIBLE.find(r=>r.ewo==='A').line===2")
 page.locator('#ssa-all-dates').click();page.locator('#ssa-line').select_option('1')
 assert page.evaluate("SSA_VISIBLE.length===2&&SSA_VISIBLE.every(r=>r.line===1)")
 page.locator('#ssa-clear').click();page.locator('#ssa-buyer').select_option('Buyer B')
 assert page.locator('.ssa-ewo').count()==1
 page.locator('#ssa-clear').click();page.locator('#ssa-event').select_option('Bulk Pattern')
 assert page.locator('.ssa-ewo').count()==2
 page.locator('#ssa-clear').click();page.locator('#ssa-search').fill('B')
 assert page.locator('.ssa-ewo').count()==1
 page.locator('.ssa-ewo').click();assert page.locator('#ssa-dialog').is_visible()
 assert '28-Oct-26' in page.locator('#ssa-detail').inner_text();page.locator('#ssa-close').click()
 # Existing source controls never filter the Andon snapshot.
 page.evaluate("document.getElementById('ss-search').value='NO MATCH';renderSizeSetModule()")
 assert page.locator('.ssa-ewo').count()==1
 page.locator('#ssa-clear').click()
 for theme in ['dark','light']:
  page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
  for width in [1910,1464,926,640]:
   page.set_viewport_size({'width':width,'height':884})
   box=page.locator('.ssa-grid-wrap').bounding_box()
   assert box['height']>350,(theme,width,box)
   assert box['y']+box['height']<=884,(width,box)
   assert page.evaluate("document.getElementById('s17').scrollHeight<=document.getElementById('s17').clientHeight"),(theme,width)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=f'/tmp/andon-live-{theme}-{width}.png')
 # Source/TNA views still work and restore their own layout.
 page.evaluate("showSizeSetSub('raw')");assert page.locator('#ss-raw-view').is_visible()
 assert page.evaluate("SS_FILTERED.every(r=>ssVal(r,'EWO')!=='REPORT_ONLY')")
 assert 'REPORT_ONLY' not in page.locator('#ss-table').inner_text()
 assert not page.locator('#s17').evaluate("e=>e.classList.contains('ssa-active')")
 page.evaluate("showSizeSetSub('tna')");assert page.locator('#ss-tna-performance').get_attribute('src')
 page.evaluate("showSizeSetSub('andon');ACTIVE_PLAN_UPLOAD={id:'p2'};DAILY_PLAN=[{line:3,ewo:'NEW',date:'2026-11-02',value:10,buyer:'New Buyer'}];renderSizeSetAndon()")
 assert page.locator('.ssa-ewo').inner_text()=='NEW'
 page.evaluate("renderSizeSetModule()")
 assert page.evaluate('SS_FILTERED.length===0')
 page.evaluate("SS_ROWS.push({row_data:{EWO:'NEW',Buyer:'New Buyer',Line:'3',[SSA_ACTION]:'Closed'}});renderSizeSetModule()")
 assert page.evaluate("SS_FILTERED.length===1&&ssVal(SS_FILTERED[0],'EWO')==='NEW'")
 page.evaluate("ssaReset();SSA_PLAN=String(ACTIVE_PLAN_UPLOAD.id);SSA_PENDING=true;renderSizeSetAndon()")
 assert page.locator('.ssa-ewo').count()==0 and 'Loading' in page.locator('#ssa-empty').inner_text()
 page.evaluate("SSA_PENDING=false;renderSizeSetAndon();resetSizeSetModule()")
 assert page.locator('.ssa-ewo').count()==0 and not page.locator('#ssa-detail').inner_text()
 assert not errors,errors
 b.close()
print('PASS Andon first-date scope, statuses, real report join, filters, popup, signed/duplicate quantities, responsive viewport, existing tabs, plan switches and logout clearing')
