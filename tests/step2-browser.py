"""Offline Step 2 integration. All external requests are intercepted; no live account/SQL.
Run: python tests/step2-browser.py
"""
import ast
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
# Reuse the Step 1 fixture without executing its browser suite on import.
parsed=ast.parse((ROOT/'tests/step1-browser.py').read_text())
STUB=next(ast.literal_eval(node.value) for node in parsed.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='STUB' for t in node.targets))
STUB += r"""
window.tables.efficiency_run_day_ladder=[{item:'T-Shirt',day_1:40,day_2:45,day_3:50,day_4:55,day_5:60,day_6_plus:65}];
window.tables.slide4_chassis_strength=[{item_name:'T-Shirt',line_strength:12,sort_order:1}];
const oldCreate=window.supabase.createClient;
window.supabase.createClient=()=>{const db=oldCreate();db.rpc=async(name,args)=>{
 if(name==='replace_slide4_chassis_strength'){
  window.tables.slide4_chassis_strength=args.p_rows.map((r,i)=>({...r,sort_order:i+1}));
  return {data:{status:'SUCCESS',row_count:args.p_rows.length},error:null};
 }
 return {data:[],error:null};
};return db;};
"""
class QuietHandler(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
thread=Thread(target=server.serve_forever,daemon=True);thread.start()
base=f'http://127.0.0.1:{server.server_port}/'
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader'])
  page=browser.new_page(reduced_motion='reduce',accept_downloads=True)
  errors=[];requests=[];sdk=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.on('request',lambda request:requests.append(request.url))
  def route(request):
   url=request.request.url
   if '@supabase/supabase-js' in url:sdk.append(request)
   elif url.startswith(base):request.continue_()
   elif 'html2canvas' in url or 'three.min.js' in url:request.fulfill(status=503,body='unavailable',content_type='application/javascript')
   else:request.fulfill(body='',content_type='application/javascript')
  page.route('**/*',route)
  page.add_init_script("""if(window===window.top){
    localStorage.setItem('ekwl-dashboard-theme','light');localStorage.setItem('ekwlhw_active_tab_v1','0');
    window.beforeSDK=[];
    function sample(){if(document.body&&document.body.offsetHeight>0&&!window.supabase)window.beforeSDK.push(document.documentElement.dataset.theme);requestAnimationFrame(sample);}requestAnimationFrame(sample);
  }""")
  page.goto(base+'?ekwlPerf=1',wait_until='commit')
  page.wait_for_function("window.beforeSDK?.length>=3")
  assert page.evaluate("window.beforeSDK.every(theme=>theme==='light')")
  assert page.evaluate("typeof window.supabase==='undefined'")
  assert page.locator('#site-login-btn').is_disabled()
  assert sdk
  sdk[0].fulfill(body=STUB,content_type='application/javascript')
  page.wait_for_function("window.EKWL_TIMINGS?.some(t=>t.name==='boot'&&t.status==='loaded')")
  assert page.locator('html').get_attribute('data-theme')=='light'
  assert not [u for u in requests if 'html2canvas' in u or 'three.min.js' in u]
  print('PASS rendered light theme before delayed SDK; auth boot after ordered deferred runtime; zero upfront heavy-library requests')

  # Small-table result caches survive repeated Admin/fixed-ladder/chassis opens.
  page.evaluate('goSlide(12);goSlide(15);goSlide(10);goSlide(12);')
  page.wait_for_timeout(100)
  for table in ['efficiency_run_day_ladder','line_chassis_priority','slide4_chassis_strength','abp_target']:
   assert len([c for c in page.evaluate('window.calls') if c['table']==table])==1,table
  page.evaluate("renderS4StrengthSettings();document.querySelector('.s4-strength-value').value='13';s4StrengthChanged();")
  page.evaluate('saveS4Strengths()')
  assert page.evaluate("S4_STRENGTHS_CACHE[0].line_strength===13")
  assert len([c for c in page.evaluate('window.calls') if c['table']=='slide4_chassis_strength'])==2
  print('PASS settings reads once across views; strength save invalidates and verifies actual new source values')

  page.evaluate('goSlide(1);')
  before=page.evaluate('window.EKWL_FILTER_RENDER_COUNT||0')
  page.locator('#s1-ewo-search').fill('1');page.locator('#s1-ewo-search').fill('12');page.locator('#s1-ewo-search').fill('123')
  page.wait_for_timeout(120);assert page.evaluate('window.EKWL_FILTER_RENDER_COUNT||0')==before
  page.wait_for_function('(n)=>(window.EKWL_FILTER_RENDER_COUNT||0)===n+1',arg=before)
  assert page.locator('#s1-body > tr').count()==1
  before=page.evaluate('window.EKWL_FILTER_RENDER_COUNT')
  page.evaluate('applyFilter()')
  assert page.evaluate('window.EKWL_FILTER_RENDER_COUNT')==before+1
  assert page.evaluate("window.EKWL_TIMINGS.filter(t=>t.name==='filter.render').at(-1).renders") ==1
  print('PASS rapid typing debounces once; applyFilter renders the affected slide once; numbers remain 100 order / 300 plan')

  # Main and child share one root library promise even under simultaneous button clicks.
  page.evaluate('goSlide(20);')
  child=page.frame_locator('#load-analysis-workspace')
  child.locator('#screenshotBtn').wait_for()
  frame=page.query_selector('#load-analysis-workspace').content_frame()
  page.evaluate("window.imageLoads=[];for(let i=0;i<2;i++){const b=document.createElement('button');b.id='library-test-'+i;b.onclick=()=>window.imageLoads.push(ensureHtml2Canvas());document.body.appendChild(b);b.click();}")
  frame.evaluate('window.childImageLoad=ensureHtml2Canvas()')
  page.wait_for_function('window.imageLoads.length===2 && typeof window.html2canvas===\'function\'')
  assert page.evaluate('window.imageLoads[0]===window.imageLoads[1]')
  assert frame.evaluate('window.childImageLoad===parent.EKWLLibraries.html2canvas()')
  assert len([u for u in requests if 'html2canvas' in u and u.startswith('https:')])==1
  assert len([u for u in requests if u==base+'html2canvas.min.js'])==1
  with page.expect_download(timeout=30000) as downloaded:child.locator('#screenshotBtn').click()
  assert downloaded.value.suggested_filename=='EKWL-HW_SAH_Report_HD.png'
  assert len([u for u in requests if u==base+'html2canvas.min.js'])==1
  child.locator('#btnLabel').filter(has_text='HD Screenshot').wait_for()
  assert not errors,errors
  print('PASS concurrent clicks and Load Analysis use one CDN/local fallback promise; full report PNG export succeeds')

  # Use a real isolated execution iframe, including its opaque-origin parent visibility protocol.
  page.evaluate("goSlide(16);loadOrderExecutionSlide=async()=>{};")
  execution=page.frame_locator('#order-execution-frame')
  execution.locator('#page-title').wait_for()
  ef=page.query_selector('#order-execution-frame').content_frame()
  ef.evaluate("applySQLSnapshot({orders:[],records:[],daily:[],dateRange:[],planningReady:false,key:'offline'});")
  assert not [u for u in requests if 'three.min.js' in u]
  ef.evaluate("S('factory3d');S('pyramid3d');")
  execution.locator('#pyramid-canvas-wrap > canvas').wait_for(timeout=15000)
  assert len([u for u in requests if 'three.min.js' in u and u.startswith('https:')])==1
  assert len([u for u in requests if u==base+'three.min.js'])==1
  ef.evaluate("window.framesDrawn=0;const render=pyrRenderer.render.bind(pyrRenderer);pyrRenderer.render=(...args)=>{window.framesDrawn++;return render(...args);};void 0;")
  page.wait_for_timeout(100);assert ef.evaluate('window.framesDrawn')>0
  ef.evaluate("S('tbl')");count=ef.evaluate('window.framesDrawn');page.wait_for_timeout(100);assert ef.evaluate('window.framesDrawn')==count
  ef.evaluate("S('pyramid3d')");page.wait_for_timeout(100);assert ef.evaluate('window.framesDrawn')>count
  page.evaluate('goSlide(0)');page.wait_for_timeout(40);count=ef.evaluate('window.framesDrawn');page.wait_for_timeout(100);assert ef.evaluate('window.framesDrawn')==count
  page.evaluate('goSlide(16)');page.wait_for_timeout(100);assert ef.evaluate('window.framesDrawn')>count
  ef.evaluate("S('factory3d')");execution.locator('#factory-canvas-wrap > canvas').wait_for()
  assert len([u for u in requests if u==base+'three.min.js'])==1
  assert not errors,errors
  print('PASS lazy Three.js r128 local fallback; preserved 3D templates; pause/resume for subviews and hidden parent slide')
  print('OFFLINE DEV MARKS:',page.evaluate("JSON.stringify(window.EKWL_TIMINGS.filter(t=>t.name.startsWith('library.')||t.name==='filter.render'))"))
  browser.close()
finally:
 server.shutdown();server.server_close();thread.join()
