"""Production Chassis UI/export, synthetic selected-plan data; no private reports/API."""
import base64,json,re,shutil,tempfile,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];source=(ROOT/'dashboard-main.js').read_text();html=(ROOT/'index.html').read_text()
def fn(name):
 start=re.search(r'^(?:async )?function '+name+r'\(',source,re.M).start();return source[start:source.index('\n}',start)+2]
markup=html[html.index('<div class="slide" id="s9"'):html.index('<!-- ─── SLIDE 11: FABRICS',html.index('<div class="slide" id="s9"'))]
styles='\n'.join(re.findall(r'<style[^>]*>([\s\S]*?)</style>',html))+'\n'+(ROOT/'dashboard-theme.css').read_text()
priority=re.search(r'^const DEFAULT_CHASSIS_PRIORITY=.*?;',source,re.M).group()
setup='''let SITE_AUTH_USER={id:'fixture'},CURRENT_SLIDE=10,allowed=true,ACTIVE_PLAN_UPLOAD={id:'selected-upload',file_name:'November Selected.csv'},EFF15_METRIC_UPLOAD_ID='selected-upload';
const canAccessSlide=()=>allowed,N=v=>Number(v)||0,fmt=v=>N(v).toLocaleString(),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],monthFromISO=v=>String(v).slice(0,7),getEfficiencyLadder=()=>[];
const getChassisPriority=()=>DEFAULT_CHASSIS_PRIORITY,getChassisMasterLines=()=>new Set(DEFAULT_CHASSIS_PRIORITY.map(r=>r[0])),activePlanningLabel=()=>ACTIVE_PLAN_UPLOAD.file_name;
const getS4Strengths=()=>({'T-Shirt':12,'Hoody/Jacket':13,'Sweat Shirt':3,'Polo':12,"TOP's":1,'Bottom':6});
let S4_RANGE_PLAN_ID=null,S4_RANGE_FROM='',S4_RANGE_TO='';
const dates=Array.from({length:31},(_,i)=>new Date(Date.UTC(2026,9,31+i)).toISOString().slice(0,10)),DATA=[],DAILY_PLAN=[],CLOCK_HOUR_DAILY=[],SAH_DATA=[],getFiltered=()=>DATA;
for(const [line]of DEFAULT_CHASSIS_PRIORITY){const style=['T-Shirt','Polo','Sweat Shirt','Hoody','Jogger','Tanktop','Leggings'][line%7],r={record_id:line,line,ewo:String(270000+line),color:'White',style,smv:6,manpower:31};DATA.push(r);for(const date of dates){DAILY_PLAN.push({...r,date,value:100});CLOCK_HOUR_DAILY.push({...r,date,value:310});}}
'''
functions='\n'.join(fn(n) for n in ['chassisOf','renderS9','s4DateRangeChanged','s4ResetDateRange','renderS4','drawS4ChassisChart','setupReportActions','setPlanningReadState'])
NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def validate_download(path,expected):
 with zipfile.ZipFile(path) as z:
  assert not z.testzip();sheet=ET.fromstring(z.read('xl/worksheets/sheet1.xml'));sty=ET.fromstring(z.read('xl/styles.xml'))
  fonts=list(sty.find('s:fonts',NS));fills=list(sty.find('s:fills',NS));borders=list(sty.find('s:borders',NS));xfs=list(sty.find('s:cellXfs',NS));cells={c.attrib['r']:c for c in sheet.findall('.//s:sheetData/s:row/s:c',NS)}
  assert len(cells)==len(expected)
  for item in expected:
   c=cells[item['address']];style=item['style'];xf=xfs[int(c.attrib['s'])];font=fonts[int(xf.attrib['fontId'])];fill=fills[int(xf.attrib['fillId'])];border=borders[int(xf.attrib['borderId'])]
   if item['numeric']:assert float(c.find('s:v',NS).text)==item['value']
   else:assert ''.join(n.text or '' for n in c.findall('.//s:t',NS))==item['text']
   assert fill.find('.//s:fgColor',NS).attrib['rgb']==style['fill']
   assert font.find('s:color',NS).attrib['rgb']==style['color']
   assert (font.find('s:b',NS) is not None)==style['bold']
   assert xf.find('s:alignment',NS).attrib['horizontal']==style['align']
   for side,actual in zip(['left','right','top','bottom'],style['borders']):assert border.find('s:'+side,NS).attrib.get('style')==actual['style']
  return len(cells),sheet.find('.//s:pane',NS).attrib['topLeftCell']
with sync_playwright() as p,tempfile.TemporaryDirectory() as tmp:
 b=p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox']);page=b.new_page(viewport={'width':1065,'height':884});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<!doctype html><style>'+styles+'</style><div id="topnav" style="height:90px">Production · selected plan</div><div id="slides-wrap" style="top:90px">'+markup+'</div>')
 page.evaluate("document.documentElement.dataset.theme='dark';document.getElementById('s9').classList.add('active');document.body.dataset.planningState='ready'")
 page.add_script_tag(content=priority+'\n'+setup+'\n'+functions+'\nrenderS9(DATA);renderS4(DATA);')
 table_ids=['s4-tbl','s9-cal','s9-summary-tbl','s4-chart-detail','s4-chart-total']
 before=page.evaluate('(ids)=>Object.fromEntries(ids.map(id=>[id,[...document.getElementById(id).rows].map(r=>[...r.cells].map(c=>c.innerText))]))',table_ids)
 page.add_style_tag(content=(ROOT/'chassis-compact.css').read_text());page.add_script_tag(content=(ROOT/'chassis-excel.js').read_text());page.evaluate('fitChassisReportTables();setupReportActions()')
 after=page.evaluate('(ids)=>Object.fromEntries(ids.map(id=>[id,[...document.getElementById(id).rows].map(r=>[...r.cells].map(c=>c.innerText))]))',table_ids);assert before==after
 assert page.locator('#s9 .report-actions').count()==0;assert page.locator('#s9 .s4-capture-actions').count()==0;assert page.locator('#s9 .chassis-excel').count()==2
 checked=0
 for theme in ['dark','light']:
  page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
  for id,name,freeze in [('s9-cal','Line Priority','F2'),('s9-summary-tbl','Item Count per Day','B2')]:
   expected=page.evaluate('(id)=>ChassisExcel.workbook(document.getElementById(id),"Sheet",1).values',id)
   # Reset scroll to demonstrate that the file also contains every offscreen cell.
   page.locator('#'+id).evaluate('e=>{e.parentElement.scrollLeft=0;e.parentElement.scrollTop=0}')
   with page.expect_download() as d:page.locator(f'a[onclick*="{id}"]').click()
   assert 'November_Selected' in d.value.suggested_filename and '26-Oct-26' not in d.value.suggested_filename
   path=Path(tmp)/(theme+'-'+id+'.xlsx');d.value.save_as(path);count,actual_freeze=validate_download(path,expected);checked+=count;assert actual_freeze==freeze
 # Guard old/invalid/unauthorized data and revoke any existing download URL.
 page.evaluate("setPlanningReadState('loading')");assert page.locator('.chassis-excel[download]').count()==0
 assert page.evaluate("exportChassisExcel({currentTarget:document.querySelector('.chassis-excel'),preventDefault(){}},'s9-cal','Line Priority',5)") is False
 page.evaluate("setPlanningReadState('ready');allowed=false")
 assert page.evaluate("exportChassisExcel({currentTarget:document.querySelector('.chassis-excel'),preventDefault(){}},'s9-cal','Line Priority',5)") is False
 page.evaluate("allowed=true;ACTIVE_PLAN_UPLOAD.id='changed'")
 assert page.evaluate("exportChassisExcel({currentTarget:document.querySelector('.chassis-excel'),preventDefault(){}},'s9-cal','Line Priority',5)") is False
 page.evaluate("ACTIVE_PLAN_UPLOAD.id='selected-upload';SITE_AUTH_USER=null")
 assert page.evaluate("exportChassisExcel({currentTarget:document.querySelector('.chassis-excel'),preventDefault(){}},'s9-cal','Line Priority',5)") is False
 page.evaluate("SITE_AUTH_USER={id:'fixture'};document.documentElement.dataset.theme='dark'")
 # Existing local range filter still changes only the loading summary.
 calendar=page.locator('#s9-cal').inner_text();page.locator('#s4-date-from').fill('2026-11-05');page.locator('#s4-date-from').dispatch_event('change');assert page.locator('#s9-cal').inner_text()==calendar
 for width in [784,1065,1464,1920]:
  page.set_viewport_size({'width':width,'height':884});page.wait_for_timeout(150)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  assert page.locator('#s9 .card').evaluate_all('(els)=>els.every(e=>e.getBoundingClientRect().right<=innerWidth)'),width
 # Exact text, Unicode, merged headers, leading zeros and formula-like strings.
 extra=page.evaluate("""async()=>{const t=document.createElement('table');t.style.cssText='position:fixed;left:-10000px';t.innerHTML='<tr><th rowspan="2">Line</th><th colspan="2">বাংলা &amp; &lt;source&gt;</th></tr><tr><th>Day 1</th><th>Day 2</th></tr><tr><td>001</td><td>=1+1</td><td>0%</td></tr>';document.body.append(t);const out=ChassisExcel.workbook(t,'Merged',1),bytes=new Uint8Array(await out.blob.arrayBuffer());t.remove();return {bytes:btoa(String.fromCharCode(...bytes)),values:out.values};}""")
 extra_path=Path(tmp)/'merged.xlsx';extra_path.write_bytes(base64.b64decode(extra['bytes']));validate_download(extra_path,extra['values'])
 with zipfile.ZipFile(extra_path) as z:
  sheet=ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
  assert {c.attrib['ref'] for c in sheet.findall('.//s:mergeCell',NS)}=={'A1:A2','B1:C1'}
  assert not sheet.findall('.//s:f',NS)
 # Empty selected data never exports a prior calendar or retains its wide sizing.
 page.set_viewport_size({'width':1065,'height':884});page.evaluate("document.getElementById('s9').scrollTop=0");page.screenshot(path='/tmp/chassis-production-compact.png')
 page.evaluate('DAILY_PLAN.length=0;renderS9(DATA)')
 assert page.evaluate("exportChassisExcel({currentTarget:document.querySelector('.chassis-excel'),preventDefault(){}},'s9-cal','Line Priority',5)") is False
 assert page.locator('#s9-cal').evaluate("e=>e.style.minWidth")=='0px'
 assert not errors,errors
 b.close();print('PASS production Chassis data/section parity, dark/light native XLSX all offscreen cells/styles, current-file names, freeze panes, permission/version/load guards, range filter and four viewport widths;',checked,'exported cells checked')
