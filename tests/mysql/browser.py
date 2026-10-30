"""Real local PHP/MySQL browser check; no API or database mocks."""
import json,sys,urllib.request,urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:18080/'
auth=json.loads(Path(sys.argv[1]).read_text())
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':899,'height':884},timezone_id='Asia/Dhaka')
    errors=[];external=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def route(r):
        if r.request.url.startswith(BASE):r.continue_()
        else:external.append(r.request.url);r.fulfill(body='')
    page.route('**/*',route)
    page.goto(BASE,wait_until='networkidle')
    page.locator('#site-login-email').fill(auth['email'])
    page.locator('#site-login-password').fill(auth['password'])
    page.locator('#site-login-btn').click()
    page.wait_for_function("SITE_BOOTED && document.querySelector('#supabase-live-badge')?.className==='ok'",timeout=60000)
    assert not any('supabase.co' in url or 'supabase-js' in url for url in external)
    assert page.evaluate('DATA.length')==1
    assert page.evaluate('DATA[0].ewo')=='00123'
    page.evaluate('goSlide(6)')
    page.locator('#s6-psd-from').fill('2026-10-15');page.locator('#s6-psd-to').fill('2026-10-15')
    assert '00123' in page.locator('#s6-body').inner_text()
    page.evaluate('goSlide(0)')
    home=page.locator('#home-live-kpis').inner_text()
    page.reload(wait_until='networkidle')
    page.wait_for_function("SITE_BOOTED && document.querySelector('#supabase-live-badge')?.className==='ok'",timeout=60000)
    assert page.locator('#home-live-kpis').inner_text()==home
    assert page.locator('body').get_attribute('data-planning-state')=='ready'
    assert 'successfully loaded' in page.locator('#status-msg').inner_text().lower()
    page.get_by_role('button',name='Account & Data',exact=True).click()
    page.wait_for_selector('#mysql-tools[open]')
    page.locator('#mysql-tools input[placeholder="Title"]').fill('<img src=x onerror=alert(1)>')
    page.locator('#mysql-tools textarea').fill('Safe literal private text')
    page.get_by_role('button',name='Save note',exact=True).click()
    page.wait_for_function("document.querySelector('#mysql-tools article h4')?.textContent.includes('<img')")
    assert page.locator('#mysql-tools article img').count()==0
    page.get_by_role('button',name='Close',exact=True).click()
    page.evaluate('goSlide(14)')
    page.wait_for_function('ORDER_BANK_RAW_ROWS.length===1')
    assert page.evaluate('ORDER_BANK_RAW_ROWS[0].EWO')=='00123'
    page.evaluate('goSlide(20)')
    page.wait_for_selector('iframe#load-analysis-workspace')
    for mode in ['light','dark']:
        page.evaluate("mode=>{if(EKWLTheme.get()!==mode)EKWLTheme.toggle()}",mode)
        assert page.locator('#load-analysis-workspace').is_visible()
    for path in ['backend/config/config.local.php','backend/private/','database/mysql/schema.sql','tools/mysql/bootstrap-admin.php']:
        try:urllib.request.urlopen(BASE+path)
        except urllib.error.HTTPError as e:assert e.code==404
        else:raise AssertionError('Protected file exposed: '+path)
    assert not errors,errors
    page.evaluate('siteLogout()');page.wait_for_function('SITE_AUTH_USER===null')
    assert page.locator('#site-login-gate').is_visible()
    browser.close()
    print('PASS actual PHP/MySQL browser login, PSD filter, refresh/cache, Notes XSS safety, Order Bank, load-analysis, themes, logout and private paths; no hosted Supabase requests')
