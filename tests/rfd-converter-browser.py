"""Authenticated local SQL/UI review: real sources, persisted approval, FDR evidence and logout guards."""
import json,shutil,sys,secrets
from pathlib import Path
from playwright.sync_api import sync_playwright
import importlib.util
_fixture_spec=importlib.util.spec_from_file_location("rfd_plan_fixture",Path(__file__).with_name("rfd-plan-fixture.py"));_fixture=importlib.util.module_from_spec(_fixture_spec);_fixture_spec.loader.exec_module(_fixture)
sys.path.insert(0,str(Path(__file__).parent/'mysql'));from client import Client
BASE='http://127.0.0.1:18080/';auth=json.loads(Path(sys.argv[1]).read_text());client=Client();client.login(auth['email'],auth['password'])
original={route:client.call(route,{'action':'read'})['data']['rows']for route in ['rfd','rfd/booking','rfd/daily-cutting']}
with sync_playwright()as p:
 b=p.chromium.launch(executable_path=shutil.which('google-chrome')or shutil.which('chromium'),args=['--no-sandbox']);context=b.new_context(viewport={'width':1480,'height':920});context.add_cookies([{'name':c.name,'value':c.value,'url':BASE,'httpOnly':True,'sameSite':'Strict'}for c in client.jar]);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/*',lambda r:r.continue_()if r.request.url.startswith(BASE)else r.fulfill(body=''))
 page.goto(BASE,wait_until='networkidle');page.wait_for_function("SITE_AUTH_USER!==null&&SITE_USER_PROFILE!==null&&typeof loadRfdConverter==='function'",timeout=60000)
 _fixture.select_fixture_plan(page,[r[3 if route.endswith('daily-cutting')else 0 if route.endswith('booking')else 2]for route,rows in original.items()for r in rows])
 page.evaluate('goSlide(22)');page.locator('#converter-tab').click();page.wait_for_function('RCON_DATA!==null&&RCON_LOAD===null',timeout=60000)
 assert '271966'not in page.locator('#rcon-body').inner_text();assert '271080'in page.locator('#rcon-body').inner_text();assert not any('qty'in t.lower()or'quantity'in t.lower()for t in page.locator('#converter-panel th').all_text_contents())
 assert page.locator('#rcon-body button').first.evaluate('e=>e.clientHeight<40'),'Review button wraps'
 for theme in ['light','dark']:
  page.evaluate("t=>{if(EKWLTheme.get()!==t)EKWLTheme.toggle()}",theme)
  contrast=page.locator('#converter-panel .rcon-banner').evaluate("""e=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');const rgb=v=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=v;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(n=>n/255);};const luminance=a=>a.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const style=getComputedStyle(e),a=luminance(rgb(style.color)),b=luminance(rgb(style.backgroundColor));return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);}""")
  assert contrast>=4.5,(theme,contrast)
  page.screenshot(path='/tmp/rfd-converter-live-'+theme+'.png',full_page=True)
 page.screenshot(path='/tmp/rfd-converter-live-layout.png',full_page=True)
 page.locator('#rcon-search').fill('271080');assert page.locator('#rcon-body [data-rcon-review]').count()==1;page.locator('#rcon-body [data-rcon-review]').click();assert page.locator('#rcon-review').is_visible()
 assert page.locator('#rcon-comparison tr').count()==3;assert page.locator('#rcon-comparison tr').first.locator('td').nth(3).inner_text()=='Not available'
 assert '<original>'in page.locator('#rcon-comparison').inner_text();assert page.locator('#rcon-comparison img,#rcon-comparison script').count()==0
 assert page.locator('#rcon-approve').is_disabled();page.locator('#rcon-edit').select_option(index=1);page.locator('#rcon-target').select_option(label='Carbon Navy');assert page.locator('#rcon-approve').is_disabled();page.locator('#rcon-confirm').check();assert page.locator('#rcon-approve').is_enabled()
 page.screenshot(path='/tmp/rfd-converter-live-review.png',full_page=True)
 page.locator('#rcon-approve').click();page.wait_for_function("!RCON_BUSY&&RCON_DATA&&!RCON_DATA.issues.some(r=>r.ewo==='271080')",timeout=60000)
 assert page.locator('#rcon-review').is_hidden();assert page.locator('#rcon-body [data-rcon-review]').count()==0
 page.locator('#rcon-refresh').click();page.wait_for_function('RCON_DATA!==null&&RCON_LOAD===null');assert page.evaluate("RCON_DATA.mappings.some(m=>m.ewo==='271080'&&m.valid)")
 page.locator('#fdr-tab').click();page.wait_for_function('FDR_DATA!==null&&FDR_LOAD===null',timeout=60000)
 assert page.evaluate("FDR_ROWS.filter(r=>r[1]==='271080').length") ==1
 row=page.locator('#fdr-table tbody tr').filter(has=page.locator('button[data-fdr-column="1"]',has_text='271080'));row.locator('[data-fdr-column="3"]').click();assert 'C. Navy'in page.locator('#fdr-evidence-body').inner_text();assert 'color_mappings'in page.locator('#fdr-evidence-body').inner_text();page.locator('#fdr-evidence button').click()
 page.locator('#converter-tab').click();page.wait_for_function('RCON_DATA!==null&&RCON_LOAD===null');page.locator('#rcon-mappings summary').click();page.on('dialog',lambda d:d.accept());page.locator('#rcon-map-list [data-rcon-revoke]').first.click();page.wait_for_function("!RCON_BUSY&&RCON_DATA&&RCON_DATA.issues.some(r=>r.ewo==='271080')",timeout=60000)
 assert not page.evaluate('RCON_DATA.mappings.length')
 page.locator('#rcon-search').fill('271444');page.locator('#rcon-body [data-rcon-review]').click();assert page.locator('#rcon-approve').is_disabled();assert page.locator('#rcon-source-required').is_visible();page.locator('[aria-label="Close color review"]').click()
 page.locator('#rcon-search').fill('271999');page.locator('#rcon-body [data-rcon-review]').click();assert page.locator('#rcon-target option').count()==3;assert 'Matched reference'in page.locator('#rcon-comparison').inner_text();assert page.locator('#rcon-target').input_value()=='';page.locator('[aria-label="Close color review"]').click()
 page.locator('#rcon-search').fill('');page.locator('#rcon-source').select_option('booking');assert '272205'in page.locator('#rcon-body').inner_text();assert '271080'not in page.locator('#rcon-body').inner_text();page.locator('#rcon-source').select_option('')
 for width in [721,1065,1920]:
  page.set_viewport_size({'width':width,'height':884});page.wait_for_timeout(100);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert page.locator('#converter-tab').evaluate("e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('#converter-tab')===e}")
 for route,rows in original.items():assert client.call(route,{'action':'read'})['data']['rows']==rows
 # A real read-only account can inspect evidence but cannot approve through the UI.
 reader_email='color-ui-'+secrets.token_hex(5)+'@fixture.invalid';reader_pwd='Fixture-'+secrets.token_hex(12);client.call('users',{'action':'create','email':reader_email,'password':reader_pwd,'role':'user','status':'active','permissions':{'slide_22':True}});reader=Client();reader.login(reader_email,reader_pwd)
 rctx=b.new_context();rctx.add_cookies([{'name':c.name,'value':c.value,'url':BASE,'httpOnly':True,'sameSite':'Strict'}for c in reader.jar]);rp=rctx.new_page();rp.on('pageerror',lambda e:errors.append(str(e)));rp.route('**/*',lambda r:r.continue_()if r.request.url.startswith(BASE)else r.fulfill(body=''));rp.goto(BASE,wait_until='networkidle');rp.wait_for_function("SITE_USER_PROFILE?.role==='user'");rp.wait_for_function("document.body.dataset.planningState==='ready'");_fixture.select_fixture_plan(rp,[r[3 if route.endswith('daily-cutting')else 0 if route.endswith('booking')else 2]for route,rows in original.items()for r in rows]);rp.evaluate('goSlide(22)');rp.locator('#converter-tab').click();rp.wait_for_function('RCON_DATA!==null&&RCON_LOAD===null');assert rp.evaluate('RCON_DATA.can_approve')is False;rp.locator('#rcon-search').fill('271080');rp.locator('#rcon-body [data-rcon-review]').click();assert rp.locator('#rcon-admin-only').is_visible();assert rp.locator('#rcon-approve').is_disabled();assert rp.locator('#rcon-edit').is_disabled();rctx.close()
 # A read failure clears the old view; a late request cannot restore account data after logout.
 page.evaluate("()=>{window.originalRCRequest=SB.request;SB.request=async(route,body)=>route==='rfd/converter'?{data:null,error:{message:'Fixture source read failed'}}:originalRCRequest(route,body);}")
 page.locator('#rcon-refresh').click();page.wait_for_function("RCON_LOAD===null&&RCON_DATA===null");assert 'unavailable'in page.locator('#rcon-message').inner_text()
 page.evaluate("()=>{SB.request=(route,body)=>route==='rfd/converter'?new Promise(resolve=>window.delayedRC=resolve):originalRCRequest(route,body);void loadRfdConverter(true);}")
 page.wait_for_function("typeof delayedRC==='function'");page.evaluate('siteLogout()');page.wait_for_function('SITE_AUTH_USER===null');page.evaluate("delayedRC({data:{issues:[],mappings:[],sources:Object.fromEntries(Object.keys(RCON_LABELS).map(s=>[s,{head:{id:s},status:'Complete',rows:0}])),can_approve:true,integrity:{complete:true,issue_count:0,digest:'a'.repeat(64)}},error:null})");page.wait_for_timeout(50)
 assert page.evaluate('RCON_DATA===null');assert page.locator('#rcon-body').text_content()=='';assert page.locator('#rcon-comparison').text_content()=='';assert page.locator('#rcon-review').is_hidden();assert not errors,errors
 b.close();print(json.dumps({'unmatched_only':True,'three_original_sources':True,'fabric_context':True,'no_quantity_columns':True,'manual_confirmation':True,'persisted_scoped_approval':True,'fdr_mapping_evidence':True,'revoke':True,'missing_source_blocked':True,'multi_candidate_manual_choice':True,'source_rows_unchanged':True,'responsive':True,'failed_and_logout_reads_hidden':True,'javascript_errors':0}))
