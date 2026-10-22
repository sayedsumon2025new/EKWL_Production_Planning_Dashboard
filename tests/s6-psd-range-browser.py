"""Offline Slide 06 PSD controls, chart/table parity, scope reset and responsive layout."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass

STUB = """window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};"""
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/'
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = browser.new_page(viewport={'width':899,'height':884}, timezone_id='Asia/Dhaka')
        errors=[]
        page.on('pageerror', lambda error:errors.append(str(error)))
        page.route('**/*', lambda r:r.continue_() if r.request.url.startswith(base) else r.fulfill(body=STUB if '@supabase/supabase-js' in r.request.url else '', content_type='application/javascript'))
        page.goto(base,wait_until='networkidle')
        page.evaluate("""()=>{
          SITE_USER_PROFILE={role:'admin',permissions:{}};
          document.body.classList.remove('site-locked');
          document.getElementById('site-login-gate').style.display='none';
          ACTIVE_PLAN_UPLOAD={id:'psd-fixture',planning_month:'2026-10-01'};
          DATA=[{ewo:'A',line:1,startdate:'2026-10-15',buyer:'Buyer A',style:'Hoody',orderqty:6000,planqty:5000},
            {ewo:'A',line:2,startdate:'2026-10-16',buyer:'Buyer A',style:'Hoody',orderqty:1000,planqty:900},
            {ewo:'B',line:3,startdate:'2026-10-20',buyer:'Buyer B',style:'Polo',orderqty:500,planqty:400}];
          goSlide(6);
        }""")
        original=page.locator('#s6-body').inner_html()
        page.locator('#s6-psd-from').fill('2026-10-15')
        page.locator('#s6-psd-to').fill('2026-10-15')
        assert page.locator('#s6-tbl tbody tr').count()==1
        assert page.locator('#s6-tbl tbody tr td').all_text_contents()[4:9]==['1','Hoody','6,000','5,000','5,000']
        assert '1 Lines' in page.locator('#s8-bar').inner_text()
        assert 'Buyer B' not in page.locator('#s8-buyer-pie').inner_text()
        assert '6,000' in page.locator('#s6-range-pie').inner_text()
        assert page.locator('#s6-psd-to').get_attribute('max')=='2026-10-31'
        page.locator('#s6-psd-to').fill('2026-10-16')
        page.locator('#s6-feeding-filter').select_option('2')
        assert page.locator('#s6-tbl tbody tr td').all_text_contents()[4]=='2'
        page.locator('#s6-order-range-filter').select_option('5')
        assert '7,000' in page.locator('#s6-body').inner_text()
        page.locator('#s6-feeding-filter').select_option('')
        page.locator('#s6-order-range-filter').select_option('')
        page.get_by_role('button',name='All PSD dates',exact=True).click()
        assert page.locator('#s6-body').inner_html()==original
        page.locator('#s6-psd-from').fill('2026-10-22')
        page.locator('#s6-psd-to').fill('2026-10-23')
        assert 'No EWOs match' in page.locator('#s6-body').inner_text()
        page.evaluate("ACTIVE_PLAN_UPLOAD.id='next';renderS6(DATA)")
        assert page.locator('#s6-psd-from').input_value()==''
        for width in [899,390]:
            page.set_viewport_size({'width':width,'height':884})
            for theme in ['light','dark']:
                page.evaluate("theme=>{if(EKWLTheme.get()!==theme)EKWLTheme.toggle()}",theme)
                assert page.locator('.s6-filter-bar').evaluate("e=>e.scrollWidth<=e.clientWidth+1")
                assert page.locator('#s6-psd-from').is_visible()
        assert not errors,errors
        browser.close()
        print('PASS browser: inclusive PSD controls, table/chart/feeding parity, combined filters, reset, empty result, Dhaka month end and light/dark responsive layout')
finally:
    server.shutdown()
    server.server_close()
