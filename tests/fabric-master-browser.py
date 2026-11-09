"""Authenticated registry UI, persistent aliases and cascading fabric description filter."""
import json,shutil,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(Path(__file__).parent/'mysql'));from client import Client,BASE
BASE=BASE.split('api/')[0];auth=json.loads(Path(sys.argv[1]).read_text());c=Client();c.login(auth['email'],auth['password']);expected=c.call('rfd/master-id',{'action':'read'})['data'];ids={r['ewo']:r['id']for r in expected['records']}
with sync_playwright()as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium')or shutil.which('google-chrome'),args=['--no-sandbox']);ctx=b.new_context(viewport={'width':1464,'height':950});ctx.add_cookies([{'name':x.name,'value':x.value,'url':BASE,'httpOnly':True,'sameSite':'Strict'}for x in c.jar]);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/*',lambda r:r.continue_()if r.request.url.startswith(BASE)else r.fulfill(body=''));page.goto(BASE,wait_until='networkidle');page.wait_for_function("SITE_AUTH_USER!==null&&typeof loadMasterIds==='function'");page.evaluate("setRfdPlanMode('all');goSlide(22)");page.locator('#master-tab').click();page.wait_for_function('FM_DATA!==null&&FM_LOAD===null')
 assert {r['ewo']:r['id']for r in page.evaluate('FM_DATA.records')}==ids
 assert page.locator('#fm-rows tr').count()==2;assert 'C. Navy'in page.locator('#fm-rows').inner_text();assert 'Daily Production'not in page.locator('#master-panel table thead').inner_text()
 page.locator('#fm-search').fill('271080');assert page.locator('#fm-rows tr').count()==1;page.locator('#fm-rows button').click();assert page.locator('#fm-evidence').is_visible();assert 'source_references'in page.locator('#fm-evidence-body').inner_text();assert 'C. Navy'in page.locator('#fm-evidence-body').inner_text();page.locator('#fm-evidence button').click()
 page.locator('#fm-refresh').click();page.wait_for_function('FM_DATA!==null&&FM_LOAD===null');assert {r['ewo']:r['id']for r in page.evaluate('FM_DATA.records')}==ids
 page.locator('#fdr-tab').click();page.wait_for_function('FDR_DATA!==null&&FDR_LOAD===null');page.locator('#fdr-search').fill('271084');page.wait_for_function('FDR_FILTERED.length===1');assert page.locator('#fdr-detail option').all_text_contents()==['All Fabric Details','Neck rib <original>'];page.locator('#fdr-detail').select_option(label='Neck rib <original>');assert page.locator('#fdr-table tbody tr').count()==1;assert page.locator('#fdr-table .fdr-master-code').inner_text().startswith('MID-')
 page.locator('#fdr-table [data-fdr-column="1"]').click();assert ids['271084']in page.locator('#fdr-evidence-body').inner_text();page.locator('#fdr-evidence button').click()
 page.locator('#fdr-recon-rib').click();assert page.locator('#fdr-detail').input_value()=='';assert 'Body fabric'in page.locator('#fdr-detail').inner_text();page.locator('#fdr-detail').select_option(label='Body fabric');assert page.locator('#fdr-table tbody tr').count()==1
 page.locator('#converter-tab').click();page.wait_for_function('RCON_DATA!==null&&RCON_LOAD===null');assert set(page.evaluate('Object.keys(RCON_LABELS)'))=={'orderbank','booking','rfd'};assert 'Daily Production'not in page.locator('#converter-panel .rcon-table thead').inner_text();assert page.locator('#rcon-source option').count()==4
 for theme in ['light','dark']:
  page.evaluate("t=>{if(EKWLTheme.get()!==t)EKWLTheme.toggle()}",theme)
  for width in [1464,721,390]:
   page.set_viewport_size({'width':width,'height':950});page.locator('#master-tab').click();page.wait_for_function('FM_DATA!==null&&FM_LOAD===null');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(theme,width)
  page.screenshot(path='/tmp/fabric-master-'+theme+'.png',full_page=True)
 # Scope the same IDs using a verified synthetic selected plan, without changing SQL.
 page.evaluate("()=>{ACTIVE_PLAN_UPLOAD={id:'master-plan',file_name:'Master fixture plan'};EFF15_METRIC_UPLOAD_ID='master-plan';DATA=[{ewo:'271084'}];document.getElementById('planning-sequence-filter').replaceChildren(new Option('Master plan','master-plan'));document.body.dataset.planningState='ready';clearMasterFilters();setRfdPlanMode('within');}");assert page.locator('#fm-rows tr').count()==1;assert '271084'in page.locator('#fm-rows').inner_text();page.evaluate("setRfdPlanMode('without')");assert page.locator('#fm-rows tr').count()==1;assert '271080'in page.locator('#fm-rows').inner_text()
 page.evaluate('siteLogout()');page.wait_for_function('SITE_AUTH_USER===null');assert page.evaluate('FM_DATA===null');assert page.locator('#fm-rows').text_content()=='';assert not errors,errors;b.close()
print('PASS SQL-backed Master ID UI, immutable IDs, alias evidence, three-source converter, fabric details cascading filter, shared Body/Rib ID, plan scopes, light/dark mobile and logout guards')
