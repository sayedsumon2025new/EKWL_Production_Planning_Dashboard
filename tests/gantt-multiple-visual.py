"""Focused Chromium regression with synthetic reports; no production API calls."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text()
script=html[html.index("let GANTT_EWO_SEARCH='';"):html.index('\nfunction renderS7(data){')]
styles='\n'.join(re.findall(r'<style\b[^>]*>(.*?)</style>',html,re.S))
fixture="""
const N=v=>Number(v)||0,esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const getChassisMasterLines=()=>new Set([11]),activePlanningLabel=()=> 'P04',monthFromISO=()=> 'Oct-26';
const ACTIVE_PLAN_UPLOAD={id:'P04'},CLOCK_HOUR_DATA=[],DATA=[],FABRIC_CUTTING_DATA=[];
const SEWING_IO_DATA=[{line_no:11,ewo:'271738',wip:500},{line_no:11,ewo:'271709',wip:0}];
const DATE_WISE_PRODUCTION_DATA=[{line_no:11,ewo:'271738',output_date:'2026-10-04'}];
const DAILY_PLAN=[{record_id:1,line:11,date:'2026-10-12',ewo:'271738',value:317,color:'Off White',buyer:'Tommy',style:'Dress'}, {record_id:2,line:11,date:'2026-10-12',ewo:'271709',value:118,color:'Rapid Red',buyer:'Tommy',style:'Polo'}];
const SAH_DATA=[{record_id:3,line:11,ewo:'271738',color:'Off White'},{record_id:4,line:11,ewo:'271709',color:'Rapid Red'}];
const SAH_DAILY=[{record_id:3,date:'2026-10-12',value:105},{record_id:4,date:'2026-10-12',value:35}];
"""
markup='''<div id="s11"><input id="s11-date-from" type="date"><input id="s11-date-to" type="date"><button id="s11-date-all">All dates</button><span id="s11-month"></span><input id="gantt-ewo-search"><button id="gantt-ewo-search-btn">Search</button><select id="gantt-line-filter"></select><button id="gantt-filter-clear">Clear</button><input id="gantt-color-condition" type="checkbox" checked><select id="gantt-condition-filter"><option value="">All conditions</option></select><span id="s11-count"></span><div class="gantt-wrap"><table class="gantt"><thead id="s11-head"></thead><tbody id="s11-body"></tbody></table></div></div><dialog id="ewo-gantt-dialog"><div class="gt-modal-toolbar">SLIDE 07 · ORDER STATUS<button class="gt-modal-close" onclick="closeGanttPopup()">Close</button></div><div class="gt-modal-content" id="ewo-gantt-content"></div></dialog>'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1100,'height':950});page.set_content('<style>'+styles+'</style>'+markup)
 page.add_script_tag(content=fixture+script+(ROOT/'gantt-hover.js').read_text()+"\nganttHoverSources=async()=>({errors:[]});renderS11([]);")
 entries=page.locator('#s11 .g-ewo-cell .g-ewo');assert entries.count()==2
 assert entries.all_text_contents()==['271738','271709']
 assert entries.nth(0).evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgb(183, 228, 199)'
 assert entries.nth(1).evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgb(254, 202, 202)'
 boxes=[entries.nth(i).bounding_box() for i in range(2)];assert boxes[0]['y']+boxes[0]['height']<=boxes[1]['y']
 entries.nth(0).click();page.wait_for_selector('.gt-card.gt-planning')
 assert '435' in page.locator('.gt-cell-summary').inner_text() and '140' in page.locator('.gt-cell-summary').inner_text()
 assert page.locator('.gt-ewo-option').count()==2
 page.locator('[data-popup-ewo="271709"]').click();page.wait_for_function("document.querySelector('.gt-title').textContent.includes('271709') && !!document.querySelector('.gt-card.gt-planning')")
 assert page.locator('.gt-color-select').input_value()=='Rapid Red'
 assert page.locator('.gt-planning .gt-row').filter(has_text='Plan SAH').locator('strong').inner_text()=='35'
 page.locator('[data-popup-ewo="271738"]').click();page.wait_for_function("document.querySelector('.gt-title').textContent.includes('271738') && !!document.querySelector('.gt-card.gt-planning')")
 assert page.locator('.gt-planning .gt-row').filter(has_text='Plan SAH').locator('strong').inner_text()=='105'
 page.locator('.gt-modal-close').click();entries.nth(1).focus();page.keyboard.press('Enter');page.wait_for_selector('.gt-card.gt-planning')
 assert '271709' in page.locator('.gt-title').inner_text()
 page.screenshot(path='/tmp/gantt-multiple-popup.png')
 page.locator('.gt-modal-close').click();page.screenshot(path='/tmp/gantt-multiple-chart.png')
 b.close()
print('PASS browser: stacked colored entries, separate popup targets, EWO switch and SAH/Color details, totals, keyboard access')
