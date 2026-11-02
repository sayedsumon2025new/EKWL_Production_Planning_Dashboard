"""Actual PHP/MySQL RFD page and upload, isolated localhost fixture only."""
import csv,hashlib,io,json,os,shutil,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(Path(__file__).parent/'mysql'))
from client import Client
def display_row(row):
 import re
 shown=list(row);codes=list(dict.fromkeys(re.findall(r'(?<!\d)\d{6}(?!\d)',row[2])))
 if codes:shown[2]='\n'.join(codes)
 return shown
BASE='http://127.0.0.1:18080/';auth=json.loads(Path(sys.argv[1]).read_text());client=Client();client.login(auth['email'],auth['password']);saved=client.call('rfd',{'action':'read'})['data'];H=saved['headers']
private=os.environ.get('RFD_TEST_CSV')
if private:
 payload=Path(private).read_bytes();name='RFD.csv'
 with open(private,encoding='utf-8-sig',newline='') as f:records=list(csv.reader(f));assert records.pop(0)==H
else:
 records=[['20-Jul-26','EKWL HW',str(i).zfill(7),'001','','',' White ', 'Fabric, "quoted"\nবাংলা & <script>bad()</script>','','','Buyer','','','','12.5000','0','0.000','03','','','',''] for i in range(501)]
 stream=io.StringIO(newline='');w=csv.writer(stream);w.writerow(H);w.writerows(records);payload=stream.getvalue().encode();name='RFD-UI.csv'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox']);context=b.new_context(viewport={'width':1464,'height':900});context.add_cookies([{'name':c.name,'value':c.value,'url':BASE,'httpOnly':True,'sameSite':'Strict'} for c in client.jar]);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(body=''))
 page.goto(BASE,wait_until='networkidle');page.wait_for_function("SITE_AUTH_USER!==null&&SITE_USER_PROFILE!==null&&document.body.dataset.planningState==='ready'",timeout=60000)
 page.evaluate('goSlide(22)');page.wait_for_function('RFD_REPORT!==null&&RFD_MODE===\'sql\'');assert page.locator('#s22').is_visible();assert page.locator('#rfd-table thead th').all_text_contents()==H
 assert page.evaluate('RFD_ROWS')==saved['rows'];assert page.locator('#rfd-table tbody tr').count()==min(100,len(saved['rows']))
 page.locator('#rfd-last').click();assert page.locator('#rfd-table tbody tr').last.locator('td').all_text_contents()==display_row(saved['rows'][-1])
 page.evaluate("setPlanningReadState('error')");assert page.locator('#rfd-table').is_visible();assert not page.locator('#s22').evaluate("e=>e.classList.contains('planning-dependent')");page.evaluate("setPlanningReadState('ready')")
 page.locator('#rfd-upload').evaluate('e=>e.open=true');page.locator('#rfd-file').set_input_files({'name':name,'mimeType':'text/csv','buffer':payload});page.wait_for_function('RFD_MODE===\'preview\'')
 assert page.evaluate('RFD_PREVIEW.rows')==records
 assert 'NOT SAVED' in page.locator('#rfd-source').inner_text()
 page.evaluate('goSlide(0);goSlide(22)');assert page.evaluate('RFD_MODE')=='preview'
 page.locator('#rfd-save').click();page.wait_for_function("name=>RFD_MODE==='sql'&&!RFD_BUSY&&RFD_REPORT.file_name===name",arg=name,timeout=60000)
 assert page.locator('#rfd-table img,#rfd-table script').count()==0
 assert page.evaluate('RFD_ROWS')==records;assert 'every source cell matches' in page.locator('#rfd-message').inner_text()
 stored=client.call('rfd',{'action':'read'})['data'];assert stored['rows']==records;assert stored['report']['file_sha256']==hashlib.sha256(payload).hexdigest()
 page.locator('#rfd-last').click();assert page.locator('#rfd-table tbody tr').last.locator('td').all_text_contents()==display_row(records[-1])
 with page.expect_download() as download:page.locator('#rfd-export').click()
 text=Path(download.value.path()).read_text(encoding='utf-8-sig');assert list(csv.reader(io.StringIO(text,newline='')))==[H,*records]
 page.locator('#rfd-search').fill(records[0][2]);page.wait_for_timeout(250)
 expected=[r for r in records if any(records[0][2].lower() in v.lower() for v in r)];assert page.evaluate('RFD_FILTERED.map(x=>x.row)')==expected
 page.locator('#s22 button[onclick="clearRfdFilters()"]').click();assert page.evaluate('RFD_FILTERED.length')==len(records)
 for width in [784,1065,1464,1920]:page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(100);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
 page.evaluate("SITE_USER_PROFILE={role:'user',permissions:{slide_22:true}};renderRfdModule()");assert page.locator('#rfd-upload').is_hidden()
 page.evaluate('siteLogout()');page.wait_for_function('SITE_AUTH_USER===null');assert page.evaluate('RFD_ROWS.length')==0;assert page.locator('#rfd-table').text_content()==''
 assert not errors,errors;b.close()
 print(json.dumps({'rfd_browser_rows_verified':len(records),'cells_verified':len(records)*22,'original_headers_and_cell_strings':True,'sql_upload_readback':True,'pagination_export_and_filters':True,'independent_of_planning':True,'logout_and_permission_guards':True,'javascript_errors':0}))
