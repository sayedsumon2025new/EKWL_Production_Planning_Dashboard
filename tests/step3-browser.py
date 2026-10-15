"""Offline Step 3 lifecycle tests. All external calls are intercepted; no live database."""
import ast
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
parsed=ast.parse((ROOT/'tests/step1-browser.py').read_text())
STUB=next(ast.literal_eval(node.value) for node in parsed.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='STUB' for t in node.targets))
STUB=STUB.replace('values.includes(row[key])',"values.includes(key==='row_data->>EWO'?row.row_data?.EWO:row[key])")
STUB=STUB.replace("fields.split(',').map(key=>[key,row[key]])",'''fields.split(',').map(raw=>{const key=raw.replace(/^"|"$/g,'');return [key,row[key]]})''')
STUB+=r"""
window.tables.size_set_rows=[];window.tables.accessories_rows=[];
window.tables.order_bank_latest_all=[{id:1,source_row_no:1,upload_batch_id:7,source_columns:['EWO','Buyer','GmtColor','OrderQty'],source_data:{EWO:'123',Buyer:'Buyer A',GmtColor:'Blue',OrderQty:'100'},EWO:'123',Buyer:'Buyer A',GmtColor:'Blue',OrderQty:100}];
const originalClient=window.supabase.createClient;
window.supabase.createClient=(...args)=>{const client=originalClient(...args);client.rpc=async()=>({data:[],error:null});return client;};
"""
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}/'
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader'])
  page=browser.new_page(reduced_motion='reduce');errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  def route(r):
   if '@supabase/supabase-js' in r.request.url:r.fulfill(body=STUB,content_type='application/javascript')
   elif r.request.url.startswith(base):r.continue_()
   else:r.fulfill(body='',content_type='application/javascript')
  page.route('**/*',route)
  page.add_init_script("if(window===window.top)localStorage.setItem('ekwlhw_active_tab_v1','0')")
  page.goto(base+'?ekwlPerf=1')
  page.wait_for_function("window.EKWL_TIMINGS?.some(t=>t.name==='boot'&&t.status==='loaded')")
  page.evaluate('goSlide(14)');page.wait_for_function('ORDER_BANK_RAW_ROWS.length===1')
  page.evaluate('goSlide(16)');page.wait_for_function("OE_RENDERED_KEY!==''")
  page.evaluate('goSlide(14)');page.wait_for_timeout(100)
  assert page.evaluate("calls.filter(c=>c.table==='order_bank_latest_all').length")==1
  assert page.evaluate("ORDER_BANK_RAW_ROWS[0].OrderQty")=='100'
  page.evaluate("goSlide(0);invalidateDataCache(['snapshot:orderbank']);invalidateOrderExecutionData();ORDER_BANK_RAW_ROWS=[];goSlide(16);loadOrderBankSlide()")
  page.wait_for_function("OE_RENDERED_KEY!==''&&ORDER_BANK_RAW_ROWS.length===1")
  assert page.evaluate("calls.filter(c=>c.table==='order_bank_latest_all').length")==2
  print('PASS actual Order Bank/Execution opens in both directions and concurrently share one snapshot per version')

  for slide,func,table in [(17,'SizeSet','size_set_rows'),(18,'Accessories','accessories_rows'),(19,'Embellishment','embellishment_send_receive_rows')]:
   page.evaluate(f'goSlide({slide})')
   page.evaluate(f'Promise.all([load{func}Module(),load{func}Module()])')
   count=page.evaluate(f"calls.filter(c=>c.table==='{table}').length")
   assert count==1,(table,count)
   page.evaluate(f'load{func}Module()')
   assert page.evaluate(f"calls.filter(c=>c.table==='{table}').length")==count
  print('PASS parallel module opens and successful empty active snapshots each read once')

  # Same embellishment rows serve Fabrics and Slide 19; a completed upload invalidates both.
  page.evaluate("tables.embellishment_send_receive_rows=[{is_active:true,source_row_no:1,'EWO No':'123',Color:'Blue',Date:'12-Oct-26','Today Print Send Qty\\n':'30',' Today Print Receive Qty':'20'}]")
  page.evaluate("refreshDashboardAfterSuccessfulUpload('embellishment')")
  page.evaluate('goSlide(11)')
  page.wait_for_function('S12_EM_ROWS?.length===1')
  page.evaluate('goSlide(19)');page.evaluate('loadEmbellishmentModule()')
  assert page.evaluate('S12_EM_ROWS===EM_ROWS')
  assert page.evaluate("calls.filter(c=>c.table==='embellishment_send_receive_rows').length")==2
  print('PASS Fabrics/Slide 19 use identical embellishment array after invalidation')

  page.evaluate('goSlide(7)');page.wait_for_function("sharedReportsReady(['fabric','sewing','production'])")
  page.wait_for_function("document.querySelectorAll('#s11-body [data-gantt]').length===2")
  page.evaluate("invalidateEwoSources();invalidateDataCache(['snapshot:embellishment'])")
  before=page.evaluate("calls.filter(c=>c.table==='embellishment_send_receive_rows').length")
  page.evaluate("Promise.all([ganttActionEvents('print'),ganttActionEvents('embroidery')])")
  after=page.evaluate("calls.filter(c=>c.table==='embellishment_send_receive_rows').length")
  assert after==before+1
  popup=page.evaluate("ganttHoverSources('123','Blue',['Blue'])")
  assert popup['print_send']==30 and popup['print_receive']==20,popup
  assert page.evaluate("calls.filter(c=>c.table==='embellishment_send_receive_rows').length")==after
  page.evaluate("GANTT_ACTION_TAB='print';ganttActionRefresh()")
  page.wait_for_function(f"calls.filter(c=>c.table==='embellishment_send_receive_rows').length==={after+1}")
  assert page.evaluate("ganttActionDate('12-Oct-26').day===12&&ganttActionDate('2026-10-12').day===12&&ganttActionDate('10/12/2026')===null")
  print('PASS Print/EMB and popup share source; explicit refresh refetches; date parser unchanged')

  page.evaluate("GANTT_ACTION_TAB='gantt';goSlide(0)")
  before=page.evaluate('calls.length')
  await_types=['orderbank','floor','size','accessories','embellishment','fabric','sewing','production']
  for source in await_types:page.evaluate(f"refreshDashboardAfterSuccessfulUpload('{source}')")
  new_calls=page.evaluate(f'calls.slice({before})')
  assert [c['table'] for c in new_calls]==['floor_allocation'],new_calls
  page.evaluate('goSlide(7)')
  page.wait_for_function("sharedReportsReady(['fabric','sewing','production'])")
  page.wait_for_function("document.querySelectorAll('#s11-body [data-gantt]').length===2")
  count=page.evaluate("EKWL_TIMINGS.filter(t=>t.name==='gantt.build').length")
  page.evaluate('renderS11(getFiltered());renderS11(getFiltered())')
  assert page.evaluate("EKWL_TIMINGS.filter(t=>t.name==='gantt.build').length")==count
  assert page.evaluate("EKWL_TIMINGS.some(t=>t.name==='cache.hit')&&EKWL_TIMINGS.some(t=>t.name==='gantt.render')&&EKWL_SLIDE_OPENS.some(o=>o.cacheHits>0)")
  print('OFFLINE GANTT DEV MARKS:',page.evaluate("EKWL_TIMINGS.filter(t=>['gantt.build','gantt.render'].includes(t.name)).slice(-4)"))
  page.evaluate('goSlide(21)');page.wait_for_timeout(100)
  start=page.evaluate('calls.length')
  page.evaluate("refreshDashboardAfterSuccessfulUpload('size')")
  rereads=page.evaluate(f'calls.slice({start})')
  assert [c['table'] for c in rereads]==['ewo_readiness_board'],rereads
  print('PASS Size Set refresh invalidates readiness without rereading unrelated coverage/cutoff')
  page.evaluate('siteLogout()')
  assert page.evaluate("VERSIONED_DATA_CACHE.size===0&&GANTT_INDEX_CACHE===null&&SITE_AUTH_USER===null")
  assert not errors,errors
  print('PASS uploads avoid unrelated planning/report reads; Gantt index reuse and dev marks; logout clears owner data')
  browser.close()
finally:server.shutdown();server.server_close()
