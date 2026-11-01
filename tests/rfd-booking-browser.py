"""Actual PHP/MySQL BOOKING page and upload, isolated localhost fixture only."""
import csv,hashlib,io,json,os,shutil,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(Path(__file__).parent/'mysql'))
from client import Client
BASE='http://127.0.0.1:18080/';auth=json.loads(Path(sys.argv[1]).read_text());client=Client();client.login(auth['email'],auth['password']);saved=client.call('rfd/booking',{'action':'read'})['data'];H=saved['headers'];rfd_before=client.call('rfd',{'action':'read'})['data']
private=os.environ.get('BOOKING_TEST_CSV')
if private:
 payload=Path(private).read_bytes();name='BOOKING.csv'
 with open(private,encoding='utf-8-sig',newline='') as f:records=list(csv.reader(f));assert records.pop(0)==H
else:
 records=[[str(i).zfill(7),'0001','Buyer','Team','Supplier',' Fabric, \"quoted\"\nবাংলা & <script>bad()</script> ','Cotton',' White ','160','60','KG','12.5000',''] for i in range(501)]
 stream=io.StringIO(newline='');w=csv.writer(stream);w.writerow(H);w.writerows(records);payload=stream.getvalue().encode();name='BOOKING-UI.csv'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox']);context=b.new_context(viewport={'width':1464,'height':900});context.add_cookies([{'name':c.name,'value':c.value,'url':BASE,'httpOnly':True,'sameSite':'Strict'} for c in client.jar]);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(body=''))
 page.goto(BASE,wait_until='networkidle');page.wait_for_function("SITE_AUTH_USER!==null&&SITE_USER_PROFILE!==null&&document.body.dataset.planningState==='ready'",timeout=60000)
 page.evaluate('goSlide(22)');page.locator('#booking-tab').click();page.wait_for_function('BOOKING_REPORT!==null&&BOOKING_MODE===\'sql\'');assert page.locator('#s22').is_visible();assert page.locator('#booking-table thead th').all_text_contents()==H, {'actual':page.locator('#booking-table thead th').all_text_contents(),'expected':H}
 assert page.evaluate('BOOKING_ROWS')==saved['rows'];assert page.locator('#booking-table tbody tr').count()==min(100,len(saved['rows']))
 page.locator('#booking-last').evaluate('e=>{if(!e.disabled)e.click()}');assert page.locator('#booking-table tbody tr').last.locator('td').all_text_contents()==saved['rows'][-1]
 page.evaluate("setPlanningReadState('error')");assert page.locator('#booking-table').is_visible();assert not page.locator('#s22').evaluate("e=>e.classList.contains('planning-dependent')");page.evaluate("setPlanningReadState('ready')")
 page.locator('#booking-upload').evaluate('e=>e.open=true');page.locator('#booking-file').set_input_files({'name':name,'mimeType':'text/csv','buffer':payload});page.wait_for_function('BOOKING_MODE===\'preview\'')
 assert page.evaluate('BOOKING_PREVIEW.rows')==records
 assert 'NOT SAVED' in page.locator('#booking-source').inner_text()
 page.locator('#rfd-tab').click();assert page.locator('#booking-panel').is_hidden();page.locator('#booking-tab').click();assert page.locator('#rfd-panel').is_hidden();page.evaluate('goSlide(0);goSlide(22)');assert page.evaluate('BOOKING_MODE')=='preview'
 page.locator('#booking-save').click();page.wait_for_function("name=>BOOKING_MODE==='sql'&&!BOOKING_BUSY&&BOOKING_REPORT.file_name===name",arg=name,timeout=60000)
 assert page.locator('#booking-table img,#booking-table script').count()==0
 assert page.evaluate('BOOKING_ROWS')==records;assert 'every source cell matches' in page.locator('#booking-message').inner_text()
 stored=client.call('rfd/booking',{'action':'read'})['data'];assert stored['rows']==records;assert client.call('rfd',{'action':'read'})['data']==rfd_before;assert stored['report']['file_sha256']==hashlib.sha256(payload).hexdigest()
 page.locator('#booking-last').evaluate('e=>{if(!e.disabled)e.click()}');assert page.locator('#booking-table tbody tr').last.locator('td').all_text_contents()==records[-1]
 with page.expect_download() as download:page.locator('#booking-export').click()
 text=Path(download.value.path()).read_text(encoding='utf-8-sig');assert list(csv.reader(io.StringIO(text,newline='')))==[H,*records]
 page.locator('#booking-search').fill(records[0][0]);page.wait_for_timeout(250)
 expected=[r for r in records if any(records[0][0].lower() in v.lower() for v in r)];assert page.evaluate('BOOKING_FILTERED.map(x=>x.row)')==expected
 page.locator('#s22 button[onclick="clearBookingFilters()"]').click();assert page.evaluate('BOOKING_FILTERED.length')==len(records)
 for width in [784,1065,1400,1401,1464,1920]:
  page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(100);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  for tab in ['rfd','booking']:
   assert page.locator('#'+tab+'-tab').evaluate("e=>{const r=e.getBoundingClientRect(),nav=document.querySelector('#topnav').getBoundingClientRect();return r.top>=nav.bottom&&r.bottom<=innerHeight&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('[role=tab]')===e}"),('tab covered',width,tab)
   page.locator('#'+tab+'-tab').click();assert page.locator('#'+tab+'-panel').is_visible()
  page.locator('#s22').evaluate('e=>e.scrollTop=e.scrollHeight')
  assert page.locator('#booking-tab').evaluate("e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('#booking-tab')===e}"),('tab hidden after scrolling',width)
  page.locator('#s22').evaluate('e=>e.scrollTop=0')
 page.evaluate("SITE_USER_PROFILE={role:'user',permissions:{slide_22:true}};renderBookingModule()");assert page.locator('#booking-upload').is_hidden()
 page.evaluate('siteLogout()');page.wait_for_function('SITE_AUTH_USER===null');assert page.evaluate('BOOKING_ROWS.length')==0;assert page.evaluate('RFD_ROWS.length')==0;assert page.locator('#booking-table').text_content()==''
 assert not errors,errors;b.close()
 print(json.dumps({'booking_browser_rows_verified':len(records),'cells_verified':len(records)*13,'original_headers_and_cell_strings':True,'sql_upload_readback':True,'pagination_export_and_filters':True,'independent_of_planning':True,'logout_and_permission_guards':True,'javascript_errors':0}))
