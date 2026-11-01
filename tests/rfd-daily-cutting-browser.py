"""Actual PHP/MySQL DCS page and upload, isolated localhost fixture only."""
import csv,hashlib,io,json,os,shutil,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(Path(__file__).parent/'mysql'))
from client import Client
BASE='http://127.0.0.1:18080/';auth=json.loads(Path(sys.argv[1]).read_text());client=Client();client.login(auth['email'],auth['password']);saved=client.call('rfd/daily-cutting',{'action':'read'})['data'];H=saved['headers'];rfd_before=client.call('rfd',{'action':'read'})['data'];booking_before=client.call('rfd/booking',{'action':'read'})['data']
private=os.environ.get('DCS_TEST_CSV')
if private:
 payload=Path(private).read_bytes();name='DCS.csv'
 with open(private,encoding='utf-8-sig',newline='') as f:records=list(csv.reader(f));assert records.pop(0)==H
else:
 records=[['01-Nov-26',str(i).zfill(7),'Style',' Blue ','Buyer','1000','160','60','KG','12.5000',' Fabric, \"quoted\"\nবাংলা & <script>bad()</script> ','001','PCS','0'] for i in range(500)]+[['']*14]
 stream=io.StringIO(newline='');w=csv.writer(stream);w.writerow(H);w.writerows(records);payload=stream.getvalue().encode();name='DCS-UI.csv'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox']);context=b.new_context(viewport={'width':1464,'height':900});context.add_cookies([{'name':c.name,'value':c.value,'url':BASE,'httpOnly':True,'sameSite':'Strict'} for c in client.jar]);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(body=''))
 page.goto(BASE,wait_until='networkidle');page.wait_for_function("SITE_AUTH_USER!==null&&SITE_USER_PROFILE!==null&&document.body.dataset.planningState==='ready'",timeout=60000)
 page.evaluate('goSlide(22)');page.locator('#dcs-tab').click();page.wait_for_function('DCS_REPORT!==null&&DCS_MODE===\'sql\'');assert page.locator('#s22').is_visible();assert page.locator('#dcs-table thead th').all_text_contents()==H, {'actual':page.locator('#dcs-table thead th').all_text_contents(),'expected':H}
 assert page.evaluate('DCS_ROWS')==saved['rows'];assert page.locator('#dcs-table tbody tr').count()==min(100,len(saved['rows']))
 page.locator('#dcs-last').evaluate('e=>{if(!e.disabled)e.click()}');assert page.locator('#dcs-table tbody tr').last.locator('td').all_text_contents()==saved['rows'][-1]
 page.evaluate("setPlanningReadState('error')");assert page.locator('#dcs-table').is_visible();assert not page.locator('#s22').evaluate("e=>e.classList.contains('planning-dependent')");page.evaluate("setPlanningReadState('ready')")
 page.locator('#dcs-upload').evaluate('e=>e.open=true');page.locator('#dcs-file').set_input_files({'name':name,'mimeType':'text/csv','buffer':payload});page.wait_for_function('DCS_MODE===\'preview\'')
 assert page.evaluate('DCS_PREVIEW.rows')==records
 assert 'NOT SAVED' in page.locator('#dcs-source').inner_text()
 page.locator('#rfd-tab').click();assert page.locator('#dcs-panel').is_hidden();page.locator('#dcs-tab').click();assert page.locator('#rfd-panel').is_hidden();page.evaluate('goSlide(0);goSlide(22)');assert page.evaluate('DCS_MODE')=='preview'
 page.locator('#dcs-save').click();page.wait_for_function("name=>DCS_MODE==='sql'&&!DCS_BUSY&&DCS_REPORT.file_name===name",arg=name,timeout=60000)
 assert page.locator('#dcs-table img,#dcs-table script').count()==0
 assert page.evaluate('DCS_ROWS')==records;assert 'every source cell matches' in page.locator('#dcs-message').inner_text()
 stored=client.call('rfd/daily-cutting',{'action':'read'})['data'];assert stored['rows']==records;assert client.call('rfd',{'action':'read'})['data']==rfd_before;assert client.call('rfd/booking',{'action':'read'})['data']==booking_before;assert stored['report']['file_sha256']==hashlib.sha256(payload).hexdigest()
 page.locator('#dcs-last').evaluate('e=>{if(!e.disabled)e.click()}');assert page.locator('#dcs-table tbody tr').last.locator('td').all_text_contents()==records[-1]
 with page.expect_download() as download:page.locator('#dcs-export').click()
 text=Path(download.value.path()).read_text(encoding='utf-8-sig');assert list(csv.reader(io.StringIO(text,newline='')))==[H,*records]
 page.locator('#dcs-search').fill(records[0][1]);page.wait_for_timeout(250)
 expected=[r for r in records if any(records[0][1].lower() in v.lower() for v in r)];assert page.evaluate('DCS_FILTERED.map(x=>x.row)')==expected
 page.locator('#s22 button[onclick="clearDcsFilters()"]').click();assert page.evaluate('DCS_FILTERED.length')==len(records)
 page.locator('#dcs-place').select_option(records[0][0]);page.locator('#dcs-buyer').select_option(records[0][4]);assert page.evaluate('DCS_FILTERED.map(x=>x.row)')==[r for r in records if r[0]==records[0][0] and r[4]==records[0][4]]
 page.locator('#s22 button[onclick="clearDcsFilters()"]').click()
 for width in [784,1065,1400,1401,1464,1920]:
  page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(100);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  for tab in ['rfd','booking','dcs']:
   assert page.locator('#'+tab+'-tab').evaluate("e=>{const r=e.getBoundingClientRect(),nav=document.querySelector('#topnav').getBoundingClientRect();return r.top>=nav.bottom&&r.bottom<=innerHeight&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('[role=tab]')===e}"),('tab covered',width,tab)
   page.locator('#'+tab+'-tab').click();assert page.locator('#'+tab+'-panel').is_visible()
  page.locator('#s22').evaluate('e=>e.scrollTop=e.scrollHeight')
  assert page.locator('#dcs-tab').evaluate("e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('#dcs-tab')===e}"),('tab hidden after scrolling',width)
  page.locator('#s22').evaluate('e=>e.scrollTop=0')
 page.evaluate("SITE_USER_PROFILE={role:'user',permissions:{slide_22:true}};renderDcsModule()");assert page.locator('#dcs-upload').is_hidden()
 page.evaluate('siteLogout()');page.wait_for_function('SITE_AUTH_USER===null');assert page.evaluate('DCS_ROWS.length')==0;assert page.evaluate('RFD_ROWS.length')==0;assert page.evaluate('BOOKING_ROWS.length')==0;assert page.locator('#dcs-table').text_content()==''
 assert not errors,errors;b.close()
 print(json.dumps({'dcs_browser_rows_verified':len(records),'cells_verified':len(records)*14,'original_headers_and_cell_strings':True,'sql_upload_readback':True,'pagination_export_and_filters':True,'independent_of_planning':True,'logout_and_permission_guards':True,'javascript_errors':0}))
