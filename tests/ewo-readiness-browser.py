"""Offline browser regression. All external requests are mocked; no live account/data."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

STUB = """window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),
onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>{const q=new Proxy({},
{get:(_,k)=>k==='then'?(a,b)=>Promise.resolve({data:[],error:null}).then(a,b):()=>q});return q;}})};"""

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = browser.new_page(viewport={'width':1440,'height':1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        base=f'http://127.0.0.1:{server.server_port}/'
        def route(request):
            if request.request.url.startswith(base):
                request.continue_()
            elif '@supabase/supabase-js' in request.request.url:
                request.fulfill(body=STUB, content_type='application/javascript')
            else:
                request.fulfill(body='', content_type='application/javascript')
        page.route('**/*',route)
        page.goto(base,wait_until='networkidle')
        assert not errors,errors
        page.evaluate("""async()=>{
          SITE_AUTH_USER={id:'fixture-user'};SITE_USER_PROFILE={role:'user',permissions:{slide_21:true}};
          ACTIVE_PLAN_UPLOAD={id:'fixture-plan'};PLAN_UPLOAD_CATALOG=[{id:'fixture-plan',planning_id:'Demo plan'}];
          document.body.classList.remove('site-locked');document.getElementById('site-login-gate').classList.add('hidden');
          const first={upload_id:'fixture-plan',ewo:'900001',buyer:'Demo Buyer',lines:[1],first_plan_date:'2026-10-20',
            first_day_plan_qty:100,starter_qty:80,pcd:'2026-10-18',psd:'2026-10-20',pfd:'2026-10-25',delivery:'2026-10-28',
            fabric_status:'green',cutting_status:'green',print_status:'green',embroidery_status:'green',
            accessories_status:'green',size_set_status:'green',sewing_status:'green',readiness_score:100,known_stages:6,
            applicable_stages:6,delivery_risk:'low',risk_reason:'No evidenced breach',as_of_date:'2026-10-12',input_qty:0,
            output_qty:0,plan_qty:100,sewing_started:false,accessories_uploaded_at:'2026-10-12T00:00:00Z',
            color_details:[{color:'Blue',plan_qty:100,required_qty:80,fabric_qty:80,cut_qty:80,print_qty:80,emb_qty:80,
              print_required_qty:80,emb_required_qty:80,fabric:'green',cutting:'green',print:'green',embroidery:'green',size_set:'green'}]};
          window.fixtureRows=[first,{...first,ewo:'900002',sewing_status:'amber',cutting_status:'amber',readiness_score:91.7,delivery_risk:'watch'},
            {...first,ewo:'900003',sewing_status:'red',cutting_status:'red',readiness_score:83.3,delivery_risk:'high'},
            {...first,ewo:'900004',buyer:'<img src=x onerror=alert(1)>',sewing_status:'unknown',size_set_status:'unknown',readiness_score:null,known_stages:5,delivery_risk:'unknown'}];
          window.coverageRows=[{upload_id:'fixture-plan',ewo:'900001',buyer:'Demo Buyer',lines:[1],cutoff_date:'2026-10-11',ready_input_qty:250,
            day1_date:'2026-10-12',day2_date:'2026-10-13',day3_date:'2026-10-14',day1_plan:100,day2_plan:100,day3_plan:100,
            day1_status:'green',day2_status:'green',day3_status:'red',required_qty:300,shortage_qty:50,first_short_date:'2026-10-14',
            color_details:[{color:'Blue',cut_qty:300,input_qty:50,ready_qty:250}],
            day_details:[{date:'2026-10-12',cumulative_qty:100,shortage_qty:0,status:'green'},{date:'2026-10-13',cumulative_qty:200,shortage_qty:0,status:'green'},{date:'2026-10-14',cumulative_qty:300,shortage_qty:50,status:'red'}]},
            {ewo:'900002',buyer:'<img src=x onerror=alert(1)>',lines:[2],cutoff_date:'2026-10-11',day1_plan:null,day2_plan:null,day3_plan:100,day1_status:'unknown',day2_status:'unknown',day3_status:'unknown'}];
          SB.from=(table)=>{const q={select:()=>q,eq:()=>q,order:()=>q,
            limit:async()=>({data:[{output_date:'2026-10-11'}],error:null}),
            range:async()=>({data:table==='ready_input_coverage'?window.coverageRows:window.fixtureRows,error:null})};return q;};
          SB.rpc=()=>SB.from('ready_input_coverage');
          SB.reportSnapshot=async kind=>{const rows=kind==='coverage'?window.coverageRows:window.fixtureRows;return {data:{format:'report-rows-v1',kind,rows,integrity:{complete:true,row_count:rows.length,upload_id:'fixture-plan'}},error:null};};
          applySitePermissions();goSlide(21);await loadEWOReadinessBoard();
        }""")
        assert page.locator('#s21 .slide-title').text_content().strip()=='21 EWO Readiness Board'
        assert page.locator('#s21 .slide-title').is_visible()
        assert page.locator('#s21').evaluate("e=>e.parentElement.id==='slides-wrap'")
        page.wait_for_function("document.querySelectorAll('#rc-body > tr').length===2")
        assert page.locator('#rc-body .rc-day').count()==6
        assert page.locator('#rc-body img').count()==0
        assert '2026-10-12' in page.locator('#rc-day1-head').inner_text()
        assert page.locator('#rc-body .rc-green').first.evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(20, 83, 45)'
        assert page.locator('#rc-body .rc-red').first.evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(127, 29, 29)'
        assert page.locator('#rc-body .rc-unknown').first.evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(71, 85, 105)'
        assert page.locator('#rc-body .rc-green').first.evaluate('e=>getComputedStyle(e).color')=='rgb(255, 255, 255)'
        page.locator('#rc-search').fill('900001');page.wait_for_function("document.querySelectorAll('#rc-body > tr').length===1");assert page.locator('#rc-body > tr').count()==1
        page.locator('#rc-search').fill('')
        page.wait_for_function("document.querySelectorAll('#rc-body > tr').length===2")
        page.locator('#rc-body button').first.click()
        assert 'Ready Input Evidence' in page.locator('#rd-detail-title').inner_text()
        assert '250' in page.locator('#rd-detail-body').inner_text()
        page.locator('#rd-detail-dialog button').click()
        assert page.locator('#rd-body > tr').count()==4
        assert page.locator('#rd-body .rd-light').count()==28
        assert page.locator('#rd-body img').count()==0
        assert '100%' in page.locator('#rd-body > tr').nth(0).inner_text()
        assert '5/6 known' in page.locator('#rd-body > tr').nth(3).inner_text()
        assert '—' in page.locator('#rd-body > tr').nth(3).inner_text()
        assert page.evaluate("getUserPermissionKeys().includes('slide_21')")
        assert page.locator('.home-card[data-slide-access="21"]').evaluate("e=>e.style.display!=='none'")
        page.locator('#rd-readiness').select_option('green')
        assert page.locator('#rd-body > tr').count()==1
        page.locator('#rd-readiness').select_option('')
        page.locator('#rd-risk').select_option('high')
        assert '900003' in page.locator('#rd-body').inner_text()
        page.locator('#rd-risk').select_option('')
        page.locator('#rd-search').fill('900002')
        page.wait_for_function("document.querySelectorAll('#rd-body > tr').length===1")
        assert page.locator('#rd-body > tr').count()==1
        page.locator('#rd-search').fill('')
        page.wait_for_function("document.querySelectorAll('#rd-body > tr').length===4")
        page.locator('#rd-body button').first.click()
        assert page.locator('#rd-detail-dialog').is_visible()
        assert '80% × its first-day' in page.locator('#rd-detail-body').inner_text()
        assert page.locator('#rd-detail-body table tbody tr').count()==1
        page.locator('#rd-detail-dialog button').click()
        assert not page.locator('#rd-detail-dialog').is_visible()
        # The board is scrollable on mobile and keeps a single report row per EWO.
        page.set_viewport_size({'width':390,'height':844})
        assert page.locator('#s21 .tbl-wrap').first.evaluate('(e)=>e.scrollWidth>e.clientWidth')
        assert page.locator('#rc-card .tbl-wrap').evaluate('(e)=>e.scrollWidth>e.clientWidth')
        page.set_viewport_size({'width':1440,'height':1000})
        page.locator('#s21 .tbl-wrap').first.evaluate('e=>e.scrollLeft=0')
        page.screenshot(path='/tmp/ewo-readiness-demo.png',full_page=True)
        page.evaluate("SITE_AUTH_USER=null;resetEWOReadinessBoard()")
        assert '900001' not in page.locator('#rd-body').inner_text()
        assert page.locator('#rd-kpis').inner_text()==''
        assert '900001' not in page.locator('#rc-body').inner_text()
        assert page.locator('#rd-detail-body').inner_text()==''
        assert not errors,errors
        print('PASS readiness navigation, central permission, seven lights, score/unknown display, filtering, evidence dialog, escaping, mobile scroll and logout cleanup')
        browser.close()
finally:
    server.shutdown();server.server_close();thread.join()
