"""Actual Andon markup/module regression with synthetic planning and Size Set rows."""
from pathlib import Path
import re,shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text();start=html.index('<div class="slide" id="s17"');end=html.index('<!--',start+8)
styles=''.join(re.findall(r'<style[^>]*>.*?</style>',html,flags=re.S))
boot='''<script>
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ACTIVE_PLAN_UPLOAD={id:'p1'},DAILY_PLAN=[],DATA=[],SITE_SESSION_GENERATION=1,SITE_AUTH_USER={id:'u1'};
const getChassisMasterLines=()=>new Set([1,2,3]),canAccessSlide=()=>true,activePlanningLabel=()=>ACTIVE_PLAN_UPLOAD.id;
const dataCacheEntry=()=>null,siteIsAdmin=()=>true;
</script>'''
harness='<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'<link rel="stylesheet" href="size-set-andon.css"></head><body><div id="slides-wrap">'+html[start:end].replace('class="slide"','class="slide active"',1)+'</div>'+boot+'<script defer src="size-set-module.js"></script><script defer src="size-set-andon.js"></script></body></html>'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1464,'height':884});page.set_default_timeout(7000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
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
 const row=(EWO,action,When='')=>({row_data:{EWO,Color:'Black','Next Action to Do\\n(What)':action,When,'Bulk Pattern Actual':'24-Oct-26',Who:'Pattern Master',Remarks:'Source remarks for '+EWO}});
 DATA=DAILY_PLAN.map(r=>({...r,startdate:r.date,planqty:r.value,color:'Black'}));
 SS_ROWS=[row('A','Closed','25-Oct-26'),row('A','Closed','25-Oct-26'),row('B','Bulk Pattern','28-Oct-26'),row('C','Bulk Pattern','31-Feb-26'),row('D','SS Fabric','29-Oct'),row('REPORT_ONLY','Closed')];
 showSizeSetSub('andon');
 }''')
 assert page.locator('#ss-tab-andon').get_attribute('aria-selected')=='true'
 assert page.locator('[data-ssa-cell]').count()==6
 assert page.locator('.ssa-ewo.ssa-green').count()==2
 assert page.locator('.ssa-ewo.ssa-amber').count()==1
 assert page.locator('.ssa-ewo.ssa-red').count()==3
 assert page.evaluate("SSA_VISIBLE.every(r=>r.ewo!=='REPORT_ONLY'&&r.line!==46)")
 # Real source follow-up: completion dates, four columns, bold text, hover and keyboard behavior.
 source=page.locator('.ssa-ewo.ssa-green').first
 source.hover();page.locator('#ssa-followup').wait_for(state='visible')
 assert page.locator('#ssa-followup th').all_text_contents()==['Next Action to Do (What)','When','Who','Remarks']
 assert page.locator('#ssa-followup tbody tr').count()==2
 assert '24-Oct-26' in page.locator('#ssa-followup-content').inner_text()
 assert '25-Oct-26' not in page.locator('#ssa-followup-content').inner_text()
 assert 'Pattern Master' in page.locator('#ssa-followup-content').inner_text()
 assert 'Source remarks for A' in page.locator('#ssa-followup-content').inner_text()
 assert page.locator('#ssa-followup td').evaluate_all('els=>els.every(e=>Number(getComputedStyle(e).fontWeight)>=700)')
 assert source.locator('small').evaluate('e=>Number(getComputedStyle(e).fontWeight)>=700')
 page.locator('#ssa-followup td').first.hover();page.wait_for_timeout(350)
 assert page.locator('#ssa-followup').is_visible()
 page.mouse.move(2,2);page.wait_for_timeout(400);assert page.locator('#ssa-followup').is_hidden()
 source.focus();assert page.locator('#ssa-followup').is_visible()
 page.keyboard.press('Escape');assert page.locator('#ssa-followup').is_hidden()
 values=page.evaluate("""()=>{
 const row=(action,actual,When)=>({row_data:{[SSA_ACTION]:action,'Bulk Pattern Actual':actual,When}});
 return [ssaFollowupWhen(row('Closed','24-Oct-26','25-Oct-26')),ssaFollowupWhen(row(' close ','24-Oct-26','25-Oct-26')),ssaFollowupWhen(row('Closed','','25-Oct-26')),ssaFollowupWhen(row('Closed',null,'25-Oct-26')),ssaFollowupWhen(row('Bulk Pattern','23-Oct-26','28-Oct-26')),ssaFollowupWhen(row('SS Fabric','23-Oct-26','29-Oct-26'))];
 }""")
 assert values==['24-Oct-26','24-Oct-26','—','—','28-Oct-26','29-Oct-26'],values
 # Position stays within viewport at all edges; scrolling and navigation clear stale evidence.
 for width in [1910,1464,926,640]:
  page.set_viewport_size({'width':width,'height':884});source.scroll_into_view_if_needed();page.mouse.move(2,2);page.wait_for_timeout(100);source.hover();page.locator('#ssa-followup').wait_for(state='visible')
  box=page.locator('#ssa-followup').bounding_box()
  assert box['x']>=0 and box['x']+box['width']<=width+1 and box['y']>=0 and box['y']+box['height']<=884+1,box
  page.wait_for_timeout(200);page.screenshot(path=f'/tmp/andon-followup-{width}.png')
  page.keyboard.press('Escape')
 page.set_viewport_size({'width':1464,'height':884});page.wait_for_timeout(150)
 page.evaluate("const source=document.querySelector('.ssa-ewo');source.style.position='fixed';source.style.bottom='5px';source.style.right='5px';source.style.width='80px';ssaShowFollowup(source)")
 box=page.locator('#ssa-followup').bounding_box();assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=1464 and box['y']+box['height']<=884
 page.evaluate("document.querySelector('.ssa-ewo').removeAttribute('style');ssaHideFollowup()")
 source.click();assert '24-Oct-26' in page.locator('#ssa-detail').inner_text()
 assert '25-Oct-26' not in page.locator('#ssa-detail').inner_text()
 assert page.locator('#ssa-followup').is_hidden();page.locator('#ssa-close').click()
 page.evaluate("ssaShowFollowup(document.querySelector('.ssa-ewo'));showSizeSetSub('raw')")
 page.wait_for_timeout(30);assert page.locator('#ssa-followup').is_hidden()
 page.evaluate("showSizeSetSub('andon');ssaShowFollowup(document.querySelector('.ssa-ewo'));document.getElementById('s17').classList.remove('active')")
 page.wait_for_timeout(30);assert page.locator('#ssa-followup').is_hidden()
 page.evaluate("document.getElementById('s17').classList.add('active')")
 page.evaluate("SS_ROWS[0].row_data.Remarks='<img src=x onerror=alert(1)>';renderSizeSetAndon();ssaShowFollowup(document.querySelector('.ssa-ewo'))")
 assert page.locator('#ssa-followup img').count()==0
 assert '<img src=x onerror=alert(1)>' in page.locator('#ssa-followup-content').inner_text()
 page.locator('#ssa-search').fill('B');assert page.locator('#ssa-followup').is_hidden()
 page.locator('.ssa-ewo').first.hover();page.locator('#ssa-followup').wait_for(state='visible')
 assert '28-Oct-26' in page.locator('#ssa-followup-content').inner_text()
 assert '24-Oct-26' not in page.locator('#ssa-followup-content').inner_text()
 page.locator('#ssa-clear').click()
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
 page.evaluate("showSizeSetSub('andon');ACTIVE_PLAN_UPLOAD={id:'p2'};DAILY_PLAN=[{line:3,ewo:'NEW',date:'2026-11-02',value:10,buyer:'New Buyer'}];DATA=[{line:3,ewo:'NEW',startdate:'2026-11-02',planqty:10,buyer:'New Buyer',color:'Black'}];renderSizeSetAndon()")
 assert page.evaluate("SSA_VISIBLE.length===1&&SSA_VISIBLE[0].ewo==='NEW'")
 assert page.locator('.ssa-ewo small').inner_text()=='Black'
 page.evaluate("renderSizeSetModule()")
 assert page.evaluate('SS_FILTERED.length===0')
 page.evaluate("SS_ROWS.push({row_data:{EWO:'NEW',Buyer:'New Buyer',Line:'3',[SSA_ACTION]:'Closed'}});renderSizeSetModule()")
 assert page.evaluate("SS_FILTERED.length===1&&ssVal(SS_FILTERED[0],'EWO')==='NEW'")
 # Source PSD and color matching are independent of later daily plan dates.
 page.evaluate("""()=>{
 ACTIVE_PLAN_UPLOAD={id:'color-plan'};
 const rec=(id,line,color,startdate,planqty=10)=>({record_id:id,line,ewo:'X',color,startdate,planqty,buyer:'Buyer A'});
 DATA=[rec(1,1,'White','2026-10-26'),rec(2,1,'Black','2026-10-28'),rec(3,1,'Navy','2026-10-29'),rec(4,1,' white ','2026-10-30',20),rec(5,2,'White','2026-10-27'),rec(6,1,'Red','2026-10-28'),rec(7,1,'','2026-10-28'),rec(8,1,'<img src=x onerror=alert(1)>','2026-10-28'),rec(9,1,'Bad PSD','2026-02-31')];
 DATA.push({...DATA[0]});
 DAILY_PLAN=DATA.map(r=>({record_id:r.record_id,line:r.line,ewo:r.ewo,color:r.color,date:'2026-11-02',value:r.planqty,buyer:r.buyer}));
 const row=(Color,action,When='')=>({row_data:{EWO:'X',Color,[SSA_ACTION]:action,When}});
 SS_ROWS=[row(' WHITE ','Closed'),row('Black','Bulk Pattern','28-Oct-26'),row('Navy','SS Fabric','29-Oct'),row('','Closed')];
 renderSizeSetAndon();renderSizeSetModule();
 }""")
 assert page.locator('.ssa-ewo').count()==7
 assert page.locator('.ssa-ewo.ssa-green').count()==2
 assert page.locator('.ssa-ewo.ssa-amber').count()==1
 assert page.locator('.ssa-ewo.ssa-red').count()==4
 assert page.evaluate("SSA_VISIBLE.find(r=>r.line===1&&ssaColor(r.color)==='WHITE').date==='2026-10-26'&&SSA_VISIBLE.find(r=>r.line===1&&ssaColor(r.color)==='WHITE').qty===30")
 assert page.evaluate("SSA_VISIBLE.every(r=>r.date!=='2026-11-02')")
 assert '1 source rows missing valid PSD' in page.locator('#ssa-count').inner_text()
 assert page.locator('#ssa-table img').count()==0
 page.locator('.ssa-ewo.ssa-amber').click()
 detail=page.locator('#ssa-detail').inner_text()
 assert 'First PSD date: 2026-10-28' in detail and 'Black' in detail and 'WHITE' not in detail and 'Navy' not in detail
 page.locator('#ssa-close').click()
 page.locator('#ssa-from').fill('2026-10-28');page.locator('#ssa-from').dispatch_event('change')
 assert page.evaluate("!SSA_VISIBLE.some(r=>ssaColor(r.color)==='WHITE')")
 page.locator('#ssa-all-dates').click();page.locator('#ssa-event').select_option('Closed')
 assert page.locator('.ssa-ewo').count()==2
 page.locator('#ssa-clear').click()
 for width in [1464,640]:
  page.set_viewport_size({'width':width,'height':884})
  assert page.evaluate("document.getElementById('s17').scrollHeight<=document.getElementById('s17').clientHeight")
  page.screenshot(path=f'/tmp/andon-color-psd-{width}.png')
 page.evaluate("ssaReset();SSA_PLAN=String(ACTIVE_PLAN_UPLOAD.id);SSA_PENDING=true;renderSizeSetAndon()")
 assert page.locator('.ssa-ewo').count()==0 and 'Loading' in page.locator('#ssa-empty').inner_text()
 page.evaluate("SSA_PENDING=false;renderSizeSetAndon();resetSizeSetModule()")
 assert page.locator('.ssa-ewo').count()==0 and not page.locator('#ssa-detail').inner_text()
 assert page.locator('#ssa-followup').is_hidden() and not page.locator('#ssa-followup-content').inner_text()
 assert not errors,errors
 b.close()
print('PASS color-wise source PSD, same-EWO color status isolation, blank/missing colors, missing PSD, literal color text, record de-duplication; Andon scope, statuses, real report join, filters, popup, signed/duplicate quantities, responsive viewport, existing tabs, plan switches and logout clearing')
