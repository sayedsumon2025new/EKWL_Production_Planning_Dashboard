"""Real fresh MySQL browser boot: empty is valid; stale cache clears; network error stays error."""
import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:18080/'
auth=json.loads(Path(sys.argv[1]).read_text())
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(body=''))
 page.goto(BASE,wait_until='networkidle');page.locator('#site-login-email').fill(auth['email']);page.locator('#site-login-password').fill(auth['password']);page.locator('#site-login-btn').click()
 def empty_ready():
  page.wait_for_function("SITE_BOOTED && document.querySelector('#supabase-live-badge').textContent==='MySQL connected · no planning'",timeout=30000)
  assert page.evaluate('DATA.length===0 && DAILY_PLAN.length===0 && ACTIVE_PLAN_UPLOAD===null && PLAN_UPLOAD_CATALOG.length===0')
  assert page.locator('#month-filter').inner_text()=='No Planning'
  assert page.locator('#planning-sequence-filter').inner_text()=='No upload'
  assert 'not imported yet' in page.locator('#status-msg').inner_text()
  assert 'err' not in page.locator('#supabase-live-badge').get_attribute('class')
  assert 'loading' not in page.locator('#load-fill').get_attribute('class')
 empty_ready()
 # A previously cached plan must be discarded when the current server catalog is empty.
 page.evaluate("""async()=>{ACTIVE_PLAN_UPLOAD={id:'old-cache-only',planning_month:'2026-10-01',sequence_no:1};PLAN_UPLOAD_CATALOG=[ACTIVE_PLAN_UPLOAD];DATA=[{ewo:'STALE-CACHE',line:1,month:'Oct-26',planqty:100,style:'T-Shirt'}];MONTHS=['Oct-26'];PLAN_VERSION_CACHE.set('old-cache-only',capturePlanningState());saveFastBootCache();await saveDashboardCache();}""")
 page.reload(wait_until='networkidle');empty_ready()
 assert page.evaluate('PLAN_VERSION_CACHE.size')==0
 assert page.evaluate('sessionStorage.getItem(fastBootCacheKey())') is None
 assert page.evaluate('readDashboardCache()') is None
 # Abort the real catalog request to simulate a transport outage; never call it empty.
 def offline(route):
  request=route.request
  if request.url.startswith(BASE+'api/index.php') and request.method=='POST':
   try:body=json.loads(request.post_data or '{}')
   except ValueError:body={}
   if body.get('table')=='plan_uploads' and body.get('op','select')=='select':route.abort();return
  route.fallback()
 page.route('**/*',offline);page.reload(wait_until='networkidle')
 page.wait_for_function("document.querySelector('#supabase-live-badge').className==='err'",timeout=30000)
 assert page.locator('#supabase-live-badge').inner_text()=='MySQL sync failed'
 assert not errors,errors
 browser.close()
print('PASS fresh real DB empty-state boot/refresh, authoritative empty catalog clears stale planning cache, and actual request failure remains a sync error')
