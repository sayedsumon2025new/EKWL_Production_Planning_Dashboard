"""Offline browser regression: labels, legacy links, destination permissions and paging.
Run: python tests/slides-navigation.py (Python Playwright + /usr/bin/chromium).
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

STUB = """
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>{const q=new Proxy({}, {get:(_,k)=>k==='then' ? (a,b)=>Promise.resolve({data:[],error:null}).then(a,b) : ()=>q});return q;}
})};
"""

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def route(request):
            if request.request.url.startswith(f'http://127.0.0.1:{server.server_port}/'):
                request.continue_()
            elif '@supabase/supabase-js' in request.request.url:
                request.fulfill(body=STUB, content_type='application/javascript')
            else:
                request.fulfill(body='', content_type='application/javascript')
        page.route('**/*', route)
        page.goto(f'http://127.0.0.1:{server.server_port}/', wait_until='networkidle')
        assert not errors, errors
        result = page.evaluate("""async () => {
          const assert=(ok,label)=>{if(!ok)throw Error(label)};
          SITE_USER_PROFILE={role:'admin',permissions:{}};
          document.body.classList.remove('site-locked');
          for(const slide of SLIDES){
            const panel=document.getElementById(slide.id);
            assert(+panel.dataset.logicalSlide===slide.number,'DOM mapping '+slide.number);
            assert(document.querySelector(`.stab[data-s="${slide.number}"]`).textContent.trim()===String(slide.number).padStart(2,'0')+' '+slide.title,'menu label');
            if(slide.number){
              assert(document.querySelector(`.home-card[data-slide-access="${slide.number}"] .home-card-title`).textContent===slide.title,'home label');
              assert(panel.querySelector(':scope > .slide-header .slide-title').textContent.trim()===String(slide.number).padStart(2,'0')+' '+slide.title,'panel label');
              assert(getDashboardSlideRegistry().find(s=>s.n===slide.number).title===slide.title,'permission label');
            }
          }
          assert(!document.querySelector('#s2,#s4,#s8'),'dead panels removed');
          ACTIVE_PLAN_UPLOAD={id:'test',planning_month:'2026-10-01'};
          const fixture=[{ewo:'A',line:1,startdate:'2026-10-15',buyer:'Buyer A',style:'Hoody',orderqty:6000,planqty:5000},
            {ewo:'A',line:2,startdate:'2026-10-16',buyer:'Buyer A',style:'Hoody',orderqty:1000,planqty:900}];
          renderS6(fixture);
          assert(document.getElementById('s8-buyer-pie').textContent.includes('Buyer A'),'moved buyer pie renders');
          assert(document.getElementById('s8-product-pie').textContent.includes('Hoody'),'moved product pie renders');
          assert(document.getElementById('s8-bar').textContent.includes('2 Lines'),'moved feeding bar renders');
          renderS6(fixture.map(r=>({...r,startdate:''})));
          assert(!document.getElementById('s6-data-warning').hidden,'missing PSD warning');
          assert(document.getElementById('s6-range-summary').textContent.includes('Unavailable'),'no misleading zero totals');
          renderS6(fixture);assert(document.getElementById('s6-data-warning').hidden,'warning resets');
          assert(csvDate('14-Oct-26')==='2026-10-14'&&csvDate('14-oCt-2026')==='2026-10-14','named month dates');
          assert(csvDate('31-Feb-26')===null&&csvDate('14-Bad-26')===null,'invalid dates rejected');
          assert(csvDate('2026-10-14')==='2026-10-14'&&csvDate('10/14/2026')==='2026-10-14','existing date formats');
          const csv='Buyer,Line #,Criteria,PSD,10/14/2026\\nBuyer A,Line 01,Plan/Day,14-Oct-26,80';
          const parsed=await parseRawPlanFile({text:async()=>csv});assert(parsed.rows.length===1,'valid named-month import');
          let rejected=false;try{await parseRawPlanFile({text:async()=>csv.replace('14-Oct-26','31-Feb-26')})}catch(e){rejected=e.message.includes('Record 2: invalid or ambiguous PSD')}
          assert(rejected,'invalid source dates fail before upload');

          for(const [old,destination] of [[2,6],[9,6],[4,10]]){
            goSlide(old);assert(CURRENT_SLIDE===destination,'redirect');
            assert(document.querySelectorAll('.slide.active').length===1,'single active panel');
            assert(+localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)===destination,'saved canonical number');
          }
          for(const [hash,destination] of [['#s2',6],['#s8',6],['#s9',10],['#s11',7],['#slide=9',6],['#slide-4',10]]){
            location.hash=hash;restoreActiveTab();assert(CURRENT_SLIDE===destination,'legacy hash '+hash);
          }
          assert(requestedSlideFromHash('#access_token=abc&type=recovery')===null,'auth hash untouched');
          location.hash='';localStorage.setItem(ACTIVE_TAB_STORAGE_KEY,'9');restoreActiveTab();assert(CURRENT_SLIDE===6,'saved legacy tab');
          goSlide(8);document.querySelector('#s7 .pager-btns .pg-btn:last-child').click();assert(CURRENT_SLIDE===10,'next skips removed slide');
          document.querySelector('#s9 .pager-btns .pg-btn:first-child').click();assert(CURRENT_SLIDE===8,'back skips removed slide');
          assert(document.getElementById('admin-setting-count').textContent.includes('5টি'),'five settings');
          assert(document.querySelector('[data-slide-label="7"]').textContent.includes(SLIDES.find(s=>s.number===7).title),'modal label');
          renderS4StrengthSettings();assert(document.getElementById('admin-setting-panel-title').textContent.includes(slideLabel(10)),'admin panel label');
          await loadSiteUsers();assert(document.getElementById('site-users-head').textContent.includes('07 '+SLIDES.find(s=>s.number===7).title),'user module headers');
          SITE_USER_PROFILE={role:'user',permissions:{slide_2:true,slide_9:true,slide_4:true}};
          for(const old of [2,9,4]){goSlide(old);assert(CURRENT_SLIDE===0,'legacy permission cannot bypass destination');}
          SITE_USER_PROFILE.permissions={slide_1:true,slide_6:true};applySitePermissions();
          goSlide(1);document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}));assert(CURRENT_SLIDE===6,'keyboard skips denied modules');
          goSlide(2);assert(CURRENT_SLIDE===6,'destination permission permits alias');
          assert(getUserPermissionKeys().includes('admin_settings')&&!getUserPermissionKeys().includes('slide_2'),'stable active permission keys');
          return SLIDES.length;
        }""")
        page.wait_for_timeout(200)
        assert not errors, errors
        print(f'PASS {result} central slide mappings, labels, modal/admin text, redirects, saved tabs, permissions and paging')
        browser.close()
finally:
    server.shutdown()
    server.server_close()
    thread.join()
