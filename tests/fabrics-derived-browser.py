"""Real browser checks: 31 source columns and the requested 30-column report view."""
import csv,io,json,shutil,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
import importlib.util
_fixture_spec=importlib.util.spec_from_file_location("rfd_plan_fixture",Path(__file__).with_name("rfd-plan-fixture.py"));_fixture=importlib.util.module_from_spec(_fixture_spec);_fixture_spec.loader.exec_module(_fixture)
sys.path.insert(0,str(Path(__file__).parent/'mysql'));from client import Client
BASE='http://127.0.0.1:18080/';auth=json.loads(Path(sys.argv[1]).read_text());client=Client();client.login(auth['email'],auth['password']);expected=client.call('rfd/fabrics-details',{'action':'read'})['data']
columns=[0, 1, 2, 3, 4, 5, 13, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]
view=lambda row:[row[i]for i in columns]
body=[r for i,r in enumerate(expected['rows'])if expected['evidence'][i]['reconciliation']['type']!='rib']
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('google-chrome')or shutil.which('chromium'),args=['--no-sandbox']);context=b.new_context(viewport={'width':1464,'height':900});context.add_cookies([{'name':c.name,'value':c.value,'url':BASE,'httpOnly':True,'sameSite':'Strict'}for c in client.jar]);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/*',lambda r:r.continue_() if r.request.url.startswith(BASE) else r.fulfill(body=''))
 page.goto(BASE,wait_until='networkidle');page.wait_for_function("SITE_AUTH_USER!==null&&SITE_USER_PROFILE!==null&&document.body.dataset.planningState==='ready'",timeout=60000)
 _fixture.select_fixture_plan(page,[r[1]for r in expected['rows']])
 page.evaluate('goSlide(22)');page.locator('#fdr-tab').click();page.wait_for_function('FDR_REPORT!==null&&FDR_LOAD===null',timeout=60000)
 assert page.locator('#fdr-panel input[type=file]').count()==0
 assert page.evaluate('FDR_ROWS')==expected['rows'];assert page.locator('#fdr-table thead th').all_text_contents()==view(expected['headers']);assert page.locator('#fdr-table tbody tr').count()==100
 page.locator('#fdr-search').fill('000123');page.wait_for_timeout(250);assert page.evaluate('FDR_FILTERED.length')==1
 page.locator('#fdr-table [data-fdr-column="3"]').first.click();assert 'fabric_details_match' in page.locator('#fdr-evidence-body').inner_text();assert 'Fabric Construction' in page.locator('#fdr-evidence-body').inner_text();page.locator('#fdr-evidence button').click()
 page.locator('#fdr-table [data-fdr-column="16"]').first.click();assert page.locator('#fdr-evidence').is_visible();assert 'excluded' in page.locator('#fdr-evidence-body').inner_text();assert 'cutting_rows' in page.locator('#fdr-evidence-body').inner_text();page.locator('#fdr-evidence button').click()
 page.locator('#fdr-panel button[onclick="clearFdrFilters()"]').click()
 for width in [784,1065,1400,1401,1464,1920]:
  page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(100);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  for tab in ['rfd','booking','dcs','fdr']:
   assert page.locator('#'+tab+'-tab').evaluate("e=>{const r=e.getBoundingClientRect();return r.top>=document.querySelector('#topnav').getBoundingClientRect().bottom&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('[role=tab]')===e}"),(width,tab)
  assert page.locator('#fdr-table').evaluate("e=>e.querySelector('col:nth-child(4)').getBoundingClientRect().width>e.querySelector('col:nth-child(21)').getBoundingClientRect().width"),'description width'
  assert page.locator('#fdr-table button[data-fdr-column="3"]').first.evaluate('e=>e.scrollHeight<=e.clientHeight+1'),'description clipped'
  page.locator('#s22').evaluate('e=>e.scrollTop=e.scrollHeight');assert page.locator('#fdr-tab').evaluate("e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('#fdr-tab')===e}");page.locator('#s22').evaluate('e=>e.scrollTop=0')
 page.locator('#fdr-last').click();assert page.locator('#fdr-table tbody tr').count()==len(body)-100
 with page.expect_download()as d:page.locator('#fdr-export').click()
 assert list(csv.reader(io.StringIO(Path(d.value.path()).read_text(encoding='utf-8-sig'),newline='')))==[view(expected['headers']),*[view(r)for r in body]]
 page.evaluate("setPlanningReadState('error')");assert page.locator('#fdr-table').is_visible();page.evaluate("setPlanningReadState('ready')")
 page.evaluate('siteLogout()');page.wait_for_function('SITE_AUTH_USER===null');assert page.evaluate('FDR_ROWS.length')==0;assert page.locator('#fdr-table').text_content()=='';assert not errors,errors
 b.close();print(json.dumps({'automatic_fabrics_rows':len(expected['rows']),'source_columns':31,'visible_columns':30,'sql_calculation_parity':True,'source_evidence_dialog':True,'all_four_tabs_hit_tested':True,'six_viewport_widths':True,'wrapped_text_not_clipped':True,'full_csv_export':True,'logout_cleared':True,'javascript_errors':0}))
