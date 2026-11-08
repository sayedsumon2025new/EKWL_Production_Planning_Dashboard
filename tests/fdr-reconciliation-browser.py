"""Actual themed page + SQL-derived metadata, role filters and booking source dialog."""
import csv,io,json,shutil,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(Path(__file__).parent/'mysql'));from client import Client,BASE
BASE=BASE.split('api/')[0];auth=json.loads(Path(sys.argv[1]).read_text());client=Client();client.login(auth['email'],auth['password']);expected=client.call('rfd/fabrics-details',{'action':'read'})['data']
columns=[0, 1, 2, 3, 4, 5, 13, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]
view=lambda row:[row[i]for i in columns]
with sync_playwright()as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium')or shutil.which('google-chrome'),args=['--no-sandbox']);context=b.new_context(viewport={'width':1464,'height':1000});context.add_cookies([{'name':c.name,'value':c.value,'url':BASE,'httpOnly':True,'sameSite':'Strict'}for c in client.jar]);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/*',lambda r:r.continue_()if r.request.url.startswith(BASE)else r.fulfill(body=''))
 page.goto(BASE,wait_until='networkidle');page.wait_for_function("SITE_AUTH_USER!==null&&typeof setFdrReconTab==='function'")
 page.evaluate("setRfdPlanMode('all');goSlide(22)");page.locator('#fdr-tab').click();page.wait_for_function('FDR_REPORT!==null&&FDR_LOAD===null')
 assert page.locator('#fdr-table thead th').all_text_contents()==view(expected['headers']);assert page.locator('#fdr-table thead th').nth(6).inner_text()=='Booking Qty.';assert page.locator('#fdr-table thead th').nth(7).inner_text()=='Net Delivery Qty Kg.';assert page.locator('#fdr-table [data-fdr-column="14"],#fdr-table [data-total-column="14"]').count()==0;assert page.locator('#fdr-recon-body').get_attribute('aria-selected')=='true'
 body=[r for i,r in enumerate(expected['rows'])if expected['evidence'][i]['reconciliation']['type']!='rib'];support=[r for i,r in enumerate(expected['rows'])if expected['evidence'][i]['reconciliation']['type']=='rib']
 assert page.evaluate('FDR_FILTERED.map(x=>x.row)')==body
 page.locator('#fdr-search').fill('271084');page.wait_for_function('FDR_FILTERED.length===1');assert page.locator('#fdr-table [data-fdr-column="4"]').inner_text()=='Rib';assert page.locator('[data-fdr-role-label]').inner_text()=='Primary'
 page.locator('#fdr-recon-rib').click();assert page.evaluate('FDR_FILTERED.map(x=>x.row)')==support
 page.locator('#fdr-search').fill('271084');page.wait_for_function('FDR_FILTERED.length===1');assert page.locator('#fdr-table [data-fdr-column="4"]').inner_text()=='Single Jersey';assert page.locator('[data-fdr-role-label]').inner_text()=='Supporting'
 page.locator('#fdr-panel button[onclick="clearFdrFilters()"]').click()
 with page.expect_download()as download:page.locator('#fdr-export').click()
 records=list(csv.reader(io.StringIO(Path(download.value.path()).read_text(encoding='utf-8-sig'),newline='')));assert records==[view(expected['headers']),*[view(r)for r in support]]
 page.locator('#fdr-recon-body').click();page.locator('#fdr-search').fill('271080');page.wait_for_function('FDR_FILTERED.length===1');page.locator('#fdr-table [data-fdr-column="13"]').click()
 assert page.locator('#fdr-booking-breakdown tbody tr').count()==3;assert '1,300'in page.locator('#fdr-evidence-title').inner_text()or'1300'in page.locator('#fdr-evidence-title').inner_text()
 assert 'MAIN <script>window.bad=1</script>' in page.locator('#fdr-booking-breakdown').inner_text();assert page.locator('#fdr-booking-breakdown script,#fdr-booking-breakdown img').count()==0;assert page.evaluate('typeof window.bad')=='undefined'
 page.locator('#fdr-evidence button').first.click()
 assert page.evaluate('JSON.stringify(FDR_ROWS)')==json.dumps(expected['rows'],separators=(',',':'),ensure_ascii=False)
 for theme in ['light','dark']:
  page.evaluate('(t)=>applyDashboardTheme(t)',theme) if page.evaluate("typeof applyDashboardTheme==='function'")else page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
  for width in [1464,721,390]:
   page.set_viewport_size({'width':width,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/fdr-body-rib-live-layout.png',full_page=True)
 page.evaluate('siteLogout()');page.wait_for_function('SITE_AUTH_USER===null');assert page.evaluate('FDR_ROWS.length===0&&FDR_RECON_TAB==="body"');assert not errors,errors;b.close()
print('PASS real Body/Rib tabs: primary Rib, unchanged construction/source arrays, scoped exports, original booking evidence, safe text, light/dark responsive layout and logout')
