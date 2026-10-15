"""Step 1 offline integration: real boot, saved tabs, dependency races and number parity.
Every external request is intercepted. No live credentials or database access.
Run: python tests/step1-browser.py
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

STUB = r"""
window.calls=[];
window.reportDelays={fabric_cutting_info:150,sewing_input_output:150,date_wise_production:800};
const user={id:'offline-admin',email:'fixture@example.invalid'};
const records=['Plan/Day','SAH/Day','Clock Hour/Day','Effi/Day'].map((criteria,i)=>({
  id:i+1,source_row:i+2,upload_id:'plan',is_summary_row:false,line_no:'Line 1',buyer:'Buyer A',
  product_type:'T-Shirt',product:'T-Shirt',ewo:123,po:'PO',col:'Blue',print:'No',emb:'No',
  order_qty:100,total:300,pcd:'2026-10-10',psd:'2026-10-11',pfd:'2026-10-12',delivery:'2026-10-15',manpower:20,smv:6,criteria
}));
window.tables={
  site_users:[{id:'profile',auth_user_id:user.id,email:user.email,role:'admin',status:'active',permissions:{}}],
  plan_uploads:[{id:'plan',file_name:'fixture.csv',status:'complete',uploaded_at:'2026-10-10',planning_month:'2026-10-01',sequence_no:1,planning_id:'P01'}],
  plan_records:records,
  plan_daily:records.flatMap(r=>['2026-10-11','2026-10-12'].map((plan_date,i)=>({record_id:r.id,upload_id:'plan',plan_date,value:r.criteria==='Plan/Day'?(i+1)*100:10}))),
  line_chassis_priority:[],efficiency_run_day_ladder:[],slide4_chassis_strength:[],dashboard_master_settings:[],
  abp_target:[{parameter_name:'ABP_MATRIX_2026_27',config:{metrics:[['Efficiency','65%']]}}],
  fabric_cutting_info:[{id:1,buyer:'Buyer A',ewo:'123',color_name:'Blue',item_product_type:'T-Shirt',color_order_qty:100,total_cut_qty:250,cutable_qty:300,status:'Running'}],
  sewing_input_output:[{id:1,ewo:'123',color:'Blue',line_no:1,total_input_qty:50,total_output_qty:40,total_wip_qty:30,total_reject_qty:0}],
  date_wise_production:[{id:1,ewo:'123',color:'Blue',line_no:1,output_date:'2026-10-11',total_qty:40}],
  embellishment_send_receive_rows:[],order_bank_latest_all:[],floor_allocation:[]
};
function from(table){
  let fields='*';const predicates=[],orders=[];
  async function run(start=0,end=Infinity,single=false){
    window.calls.push({table,start,end});
    await new Promise(r=>setTimeout(r,window.reportDelays[table]||10));
    let rows=(window.tables[table]||[]).filter(row=>predicates.every(test=>test(row)));
    rows.sort((a,b)=>{for(const [key,asc] of orders){if(a[key]<b[key])return asc?-1:1;if(a[key]>b[key])return asc?1:-1;}return 0;});
    rows=rows.slice(start,end===Infinity?undefined:end+1).map(row=>fields==='*'?{...row}:Object.fromEntries(fields.split(',').map(key=>[key,row[key]])));
    return {data:single?(rows[0]||null):rows,error:null};
  }
  const q={select(value){fields=value;return q;},eq(key,value){predicates.push(row=>String(row[key])===String(value));return q;},
    in(key,values){predicates.push(row=>values.includes(row[key]));return q;},order(key,options={}){orders.push([key,options.ascending!==false]);return q;},
    range(a,b){return run(a,b);},limit(count){return run(0,count-1);},maybeSingle(){return run(0,0,true);},then(a,b){return run().then(a,b);}};
  return q;
}
window.supabase={createClient:()=>({from,auth:{getSession:async()=>({data:{session:{user}}}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})}})};
"""

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
base = f'http://127.0.0.1:{server.server_port}/'
shared = ['fabric_cutting_info', 'sewing_input_output', 'date_wise_production']
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        def open_page(slide):
            page = browser.new_page(reduced_motion='reduce')
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            def route(request):
                if request.request.url.startswith(base):
                    request.continue_()
                elif '@supabase/supabase-js' in request.request.url:
                    request.fulfill(body=STUB, content_type='application/javascript')
                else:
                    request.fulfill(body='', content_type='application/javascript')
            page.route('**/*', route)
            page.add_init_script(f"if(window===window.top)localStorage.setItem('ekwlhw_active_tab_v1','{slide}');")
            page.goto(base+'?ekwlPerf=1', wait_until='domcontentloaded')
            page.wait_for_function("window.EKWL_TIMINGS?.some(t=>t.name==='boot'&&t.status==='loaded')")
            return page, errors

        home, errors = open_page(0)
        assert home.evaluate('CURRENT_SLIDE') == 0
        assert not [c for c in home.evaluate('window.calls') if c['table'] in shared]
        assert len([c for c in home.evaluate('window.calls') if c['table']=='abp_target']) == 1
        home_values = home.locator('#home-live-kpis .home-live-kpi-val').all_text_contents()
        assert home_values[:2] == ['100','300'], home_values
        # Direct filter/action calls during first open share the same dependency request.
        home.evaluate("goSlide(7);renderS11(getFiltered());showGanttActionTab('psd');")
        home.wait_for_function("document.querySelector('#gantt-action-body')?.textContent.includes('PSD') && sharedReportsReady(['fabric','sewing','production'])")
        home.evaluate("showGanttActionTab('gantt')")
        home.wait_for_function("document.querySelectorAll('#s11-body .g-ewo').length===2")
        gantt_before = home.locator('#s11-body').inner_html()
        for table in shared:
            assert len([c for c in home.evaluate('window.calls') if c['table']==table])==1
        count = len(home.evaluate('window.calls'))
        home.evaluate('goSlide(0);goSlide(7);')
        assert len(home.evaluate('window.calls'))==count
        assert home.locator('#s11-body').inner_html()==gantt_before
        for theme in ['light','dark']:
            home.evaluate(f"EKWLTheme.get()!=='{theme}'&&EKWLTheme.toggle()")
            assert home.locator('#s11-body').inner_html()==gantt_before
        assert not errors, errors
        home.close()

        fabric, errors = open_page(11)
        # Saved tab shell opens while only its two needed reports load.
        fabric.wait_for_function('CURRENT_SLIDE===11')
        assert fabric.locator('#s12').is_visible()
        fabric.wait_for_function("sharedReportsReady(['fabric','sewing']) && document.querySelector('#s12-kpi .kpi-val')?.textContent==='1'")
        assert not [c for c in fabric.evaluate('window.calls') if c['table']=='date_wise_production']
        assert fabric.locator('#s12-kpi .kpi-val').all_text_contents()[1]=='100'
        fabric.evaluate('goSlide(0);goSlide(11);')
        assert len([c for c in fabric.evaluate('window.calls') if c['table']=='fabric_cutting_info'])==1
        assert not errors, errors
        fabric.close()

        planning, errors = open_page(1)
        planning.wait_for_function('CURRENT_SLIDE===1')
        assert planning.locator('#s1-body > tr').count()==1
        assert not [c for c in planning.evaluate('window.calls') if c['table'] in shared]
        assert not errors, errors
        planning.close()

        race, errors = open_page(0)
        race.evaluate('goSlide(7);siteLogout();')
        race.wait_for_timeout(1000)
        assert race.evaluate('SITE_AUTH_USER===null && FABRIC_CUTTING_DATA.length===0 && SEWING_IO_DATA.length===0 && DATE_WISE_PRODUCTION_DATA.length===0')
        assert race.locator('#site-login-gate').is_visible()
        assert not errors, errors
        race.close()
        browser.close()
        print('PASS real browser boot/Home totals; saved planning and Fabric dependencies; Gantt/filter/action races, cached values, themes and logout')
finally:
    server.shutdown()
    server.server_close()
    thread.join()
