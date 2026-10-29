"""Actual Fabric/Cutting render: approved receipt-based WIP and aligned totals."""
from pathlib import Path
import re,shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'dashboard-main.js').read_text();html=(ROOT/'index.html').read_text()
start=html.index('<div class="slide" id="s12"');end=html.index('<!--',start+8)
markup=html[start:end].replace('class="slide"','class="slide active"',1)
styles=''.join(re.findall(r'<style[^>]*>.*?</style>',html,re.S))
code=source[source.index('function fabricEwoColorKey('):source.index('function renderSlide(')]
boot='''
const N=v=>Number(v)||0,fmt=v=>Number(v).toLocaleString('en-US'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prepareSharedReportView=()=>true,validDate=d=>/^\\d{4}-\\d{2}-\\d{2}$/.test(d);
let S12_RANGE_PLAN_ID='',S12_RANGE_FROM='',S12_RANGE_TO='',ACTIVE_PLAN_UPLOAD={id:'p1'},SITE_AUTH_USER=null,SB=null,CURRENT_SLIDE=11;
const DATA=[{record_id:1,ewo:'271444',color:'White',line:1,print:'Yes',emb:'No'},{record_id:2,ewo:'271444',color:'Navy',line:2,print:'No',emb:'No'},{record_id:3,ewo:'272718',color:'Black',line:1,print:'No',emb:'Yes'}];
const DAILY_PLAN=DATA.map(r=>({...r,date:'2026-11-01',value:500}));
const FABRIC_CUTTING_DATA=DATA.map(r=>({ewo:r.ewo,color_name:r.color,buyer:'Buyer A',item_product_type:'T-Shirt',color_order_qty:11000,total_cut_qty:10000,cutting_balance:-1000,status:'Running'}));
const SEWING_IO_DATA=[{ewo:'271444',color:' White ',line_no:1,input:1000},{ewo:'271444',color:'white',line_no:2,input:3000},{ewo:'271444',color:'Navy',line_no:2,input:8000},{ewo:'272718',color:'Black',line_no:1,input:4000},{ewo:'271444',color:'Other color',input:99999}];
'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1464,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<!doctype html><html><head>'+styles+'</head><body>'+markup+'<script>'+boot+code+'''S12_EM_ROWS=[{'EWO No':'271444.0',Color:' white ','Today Print Send Qty\\n':4000,' Today Print Receive Qty':3000},{'EWO No':'271444',Color:'White','Today Print Send Qty':4000,'Today Print Receive Qty':3000},{'EWO No':'272718',Color:'Black','Today EMB Send Qty':8000,'Today EMB Receive Qty':5000}];renderS12();</script></body></html>''')
 headers=page.locator('#s12-tbl thead tr').last.locator('th').all_text_contents()
 assert headers.index('Cutting WIP · pcs')==headers.index('Cutting Balance')+1
 assert page.locator('#s12-body .s12-cutting-wip').all_text_contents()==['2,000','2,000','1,000']
 assert page.locator('#s12-foot .s12-cutting-wip').inner_text()=='5,000'
 assert page.locator('#s12-top-total .s12-cutting-wip').inner_text()=='5,000'
 assert page.locator('#s12-product-total td').nth(10).inner_text()=='5,000'
 assert page.locator('#s12-body tr').first.locator('td').count()==len(headers)==27
 assert page.locator('#s12-body tr').first.locator('td').nth(22).inner_text()=='-1,000'
 # Detail EWO filter: total follows visible EWO/color pairs and does not double-count lines.
 page.locator('#s12-detail-ewo').fill('271444');page.evaluate('renderS12()')
 assert page.locator('#s12-foot .s12-cutting-wip').inner_text()=='4,000'
 # Real zero receipts differ from missing receipts. Negative stock is retained and explained.
 page.evaluate("S12_EM_ROWS=S12_EM_ROWS.map(r=>({...r,'Today Print Receive Qty':0,' Today Print Receive Qty':0}));renderS12()")
 cell=page.locator('#s12-body .s12-cutting-wip').first
 assert '-4,000' in cell.inner_text() and 'Input exceeds' in cell.locator('span').get_attribute('title')
 page.evaluate('S12_EM_ROWS=[];renderS12()');assert cell.inner_text()=='—'
 # Orders may have either process order: never guess the final receipt or add both.
 page.evaluate("DATA[0].emb='Yes';S12_EM_ROWS=[{'EWO No':'271444',Color:'White','Today Print Send Qty':8000,'Today Print Receive Qty':6000,'Today EMB Send Qty':6000,'Today EMB Receive Qty':5000}];renderS12()")
 assert cell.inner_text()=='—' and 'Final process' in cell.locator('span').get_attribute('title')
 assert page.locator('#s12-foot .s12-cutting-wip').inner_text()=='—'
 for w in [1464,784]:
  page.set_viewport_size({'width':w,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 b.close()
print('PASS Fabric/Cutting renderer, received stock by EWO/color across lines, mixed summary/detail totals, 27-column alignment, filters, missing receipts and anomaly hints')
