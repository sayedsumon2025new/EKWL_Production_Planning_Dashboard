"""Offline browser regression of the SQL snapshot bridge and TNA calculations."""
import json
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
selects = ''.join(f'<select id="ss-{name}"></select>' for name in ['year','line','buyer','product','action'])
containers = ''.join(f'<div id="ss-{name}"></div>' for name in ['table','pagination','kpis','msg','source','raw-view'])
harness = '<!doctype html><meta charset="utf-8">'+selects+containers+'''<input id="ss-search"><div id="ss-tna-view" hidden>
<iframe id="ss-tna-performance" style="width:100%;height:1200px;border:0"></iframe></div>
<script>const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));</script>
<script>let ACTIVE_PLAN_UPLOAD={id:"p1"},DAILY_PLAN=[];const getChassisMasterLines=()=>new Set([1,2]);const activePlanningLabel=()=>"P1";</script>
<script src="size-set-module.js?v=test"></script><script src="size-set-andon.js?v=test"></script>'''

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'), args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1100,'height':900}, timezone_id='Asia/Dhaka', accept_downloads=True)
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    def route(r):
        name=r.request.url.split('/')[-1].split('?')[0]
        if name in ['size-set-tna.html','size-set-module.js','size-set-andon.js']:
            r.fulfill(path=str(ROOT/name), content_type='text/html' if name.endswith('.html') else 'text/javascript')
        elif r.request.url=='http://ekwl.test/': r.fulfill(body=harness,content_type='text/html')
        else: r.abort()
    page.route('**/*',route)
    page.goto('http://ekwl.test/')
    # No data/sample or extra report requests before the Performance tab opens.
    assert not page.locator('#ss-tna-performance').get_attribute('src')
    rows=[
      {'EWO':'00123','Buyer':'Buyer A','Line':'1','EFD':'15-Jan-27','PP comment Plan':'28-Dec','PP comment Actual':'30-Dec','T & A Closed':'Open'},
      {'EWO':'B','Buyer':'Buyer A','Line':'1','EFD':'15-Jan-27','PP comment Plan':'2026-10-20','PP comment Actual':'2026-10-20'},
      {'EWO':'C','Buyer':'Buyer A','Line':'1','EFD':'15-Jan-27','PP comment Plan':'2026-10-24','PP comment Actual':''},
      {'EWO':'D','Buyer':'Buyer A','Line':'1','EFD':'15-Jan-27','PP comment Plan':'2026-11-01','PP comment Actual':''},
      {'EWO':'E','Buyer':'Buyer A','Line':'1','EFD':'15-Jan-27','PP comment Plan':'2026-10-22','PP comment Actual':'2026-11-02'},
      {'EWO':'<img src=x onerror=alert(1)>','Buyer':'<img src=x onerror=alert(1)>','Line':'2','EFD':'15-Jan-27','PP comment Plan':'31-Feb-26','PP comment Actual':''},
    ]
    page.evaluate('''rows=>{DAILY_PLAN=rows.map((r,i)=>({record_id:i,line:Number(r.Line),ewo:r.EWO,date:'2026-10-26',value:1}));SS_ROWS=rows.map((row_data,i)=>({row_data,source_row_no:i+2}));SS_FILE_NAME='SS.csv';renderSizeSetModule();showSizeSetSub('tna');}''',rows)
    frame=page.frame_locator('#ss-tna-performance')
    frame.locator('#src').filter(has_text='MySQL live').wait_for()
    child=page.frames[1]
    frame.locator('#d').fill('2026-10-25');frame.locator('#d').dispatch_event('input')
    values=child.evaluate('''()=>{const t=agg(ROWS,EV,'');return {t,otd:M.otd(t),first:fd(ROWS[0].ev['PP comment'].p),invalid:pd('31-Feb-26')}}''')
    assert values['t']['plan']==5,values
    assert values['t']['act']==1 and values['t']['over']==2 and values['t']['pend']==2,values
    assert round(values['otd'],2)==33.33,values
    assert values['first']=='2026-12-28' and values['invalid'] is None
    frame.locator('[data-t="t2"]').click()
    assert frame.locator('#hm').inner_text()
    frame.locator('[data-t="t3"]').click()
    frame.locator('#ds').select_option('');frame.locator('#ds').dispatch_event('input')
    assert '00123' in frame.locator('#dt').inner_text()
    assert child.locator('img').count()==0
    with page.expect_download() as dl: frame.locator('#ex').click()
    assert dl.value.suggested_filename=='tna_detail.csv'
    frame.locator('[data-t="t4"]').click()
    assert frame.locator('#sq .st').count()==12
    # Theme-only updates must preserve child filter choices.
    frame.locator('#b').select_option('Buyer A');frame.locator('#b').dispatch_event('input')
    page.evaluate("document.documentElement.dataset.theme='dark'")
    child.wait_for_function("document.documentElement.dataset.theme==='dark'")
    assert frame.locator('#b').input_value()=='Buyer A'
    page.evaluate("showSizeSetSub('raw');showSizeSetSub('tna');renderSizeSetModule()")
    assert frame.locator('#b').input_value()=='Buyer A'
    frame.locator('#yp').select_option('exclude');frame.locator('#yp').dispatch_event('change')
    assert child.evaluate("!ROWS[0].ev['PP comment']")
    # Shared search narrows the snapshot without issuing another SQL request.
    page.locator('#ss-search').fill('00123');page.evaluate('renderSizeSetModule()')
    child.wait_for_function('ROWS.length===1')
    # Changing the selected upload republishes only its EWOs to the real iframe.
    page.evaluate("ACTIVE_PLAN_UPLOAD={id:'p2'};DAILY_PLAN=[{line:1,ewo:'B',date:'2026-10-27',value:1}];renderSizeSetModule()")
    child.wait_for_function("ROWS.length===1&&ROWS[0].ewo==='B'")
    assert page.evaluate("SS_FILTERED.length===1&&ssVal(SS_FILTERED[0],'EWO')==='B'")
    page.evaluate("ACTIVE_PLAN_UPLOAD=null;DAILY_PLAN=[];renderSizeSetModule()")
    child.wait_for_function('ROWS.length===0')
    page.screenshot(path='/tmp/size-set-tna-performance.png')
    page.evaluate('resetSizeSetModule()')
    assert not page.locator('#ss-tna-performance').get_attribute('src')
    assert not errors,errors
    browser.close()
print('PASS SQL snapshot bridge, shared filters, OTD cutoff, future actuals, year rollover, invalid dates, XSS, tabs, export, theme and logout clearing')
