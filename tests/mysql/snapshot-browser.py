"""Actual localhost PHP/MySQL browser reader; only the error response is fault-injected."""
import json,shutil,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:18080/'
auth=json.loads(Path(sys.argv[1]).read_text())
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1464,'height':900});errors=[];calls=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:calls.append((r.url,r.post_data_json)) if '/api/index.php' in r.url and r.method=='POST' else None)
 page.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(body=''))
 page.goto(BASE,wait_until='networkidle')
 page.locator('#site-login-email').fill(auth['email']);page.locator('#site-login-password').fill(auth['password']);page.locator('#site-login-btn').click()
 page.wait_for_function("document.body.dataset.planningState==='ready' && document.querySelector('#supabase-live-badge').className==='ok'",timeout=60000)
 assert page.evaluate('DATA.length')==250
 assert page.evaluate('EFF15_METRIC_DAILY.length')==90000
 assert len([u for u,q in calls if 'planning%2Fsnapshot' in u or 'planning/snapshot' in u])==1
 assert not [q for u,q in calls if q and q.get('table') in ['plan_records','plan_daily']]
 page.evaluate('goSlide(1)')
 assert page.locator('#s1').is_visible()
 def broken(r):r.fulfill(status=409,content_type='application/json',body=json.dumps({'data':None,'error':{'message':'Synthetic totals mismatch'}}))
 page.route('**/api/index.php?route=planning%2Fsnapshot',broken)
 page.evaluate('void loadFromSupabase(ACTIVE_PLAN_UPLOAD.id,true,false)')
 page.wait_for_function("document.body.dataset.planningState==='error'")
 assert 'Synthetic totals mismatch' in page.locator('#status-msg').inner_text()
 assert page.locator('#s1 .kpi-row').evaluate("e=>getComputedStyle(e).visibility")=='hidden'
 page.unroute('**/api/index.php?route=planning%2Fsnapshot',broken)
 assert page.evaluate('loadFromSupabase(ACTIVE_PLAN_UPLOAD.id,true,false)') is True
 assert page.locator('body').get_attribute('data-planning-state')=='ready'
 assert page.locator('#s1 .kpi-row').evaluate("e=>getComputedStyle(e).visibility")!='hidden'
 page.evaluate("loadActiveModuleRows('size')")
 assert len([u for u,q in calls if ('reports%2Fsnapshot' in u or 'reports/snapshot' in u) and q.get('kind')=='size'])==1
 assert not errors,errors
 page.evaluate('siteLogout()');page.wait_for_function('SITE_AUTH_USER===null')
 b.close()
 print('PASS actual PHP/MySQL browser: 90k values in one request, no daily paging, report snapshot, invalid plan hidden, recovery and logout; zero JS errors')
