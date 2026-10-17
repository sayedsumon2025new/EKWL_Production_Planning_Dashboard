const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const script=html.slice(html.indexOf("let GANTT_EWO_SEARCH='';"),html.indexOf('\nfunction renderS7(data){'));
const elements=new Map();
const c={document:{getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',checked:id==='gantt-color-condition'});return elements.get(id);},querySelectorAll:()=>[]},getChassisMasterLines:()=>new Set([11,12]),ACTIVE_PLAN_UPLOAD:{id:'P04'},activePlanningLabel:()=> 'P04',monthFromISO:()=> 'Oct-26',N:v=>Number(v)||0,esc:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),CLOCK_HOUR_DATA:[],SAH_DATA:[],FABRIC_CUTTING_DATA:[{ewo:'271709',total_cut_qty:100,cutable_qty:50}],SEWING_IO_DATA:[{line_no:11,ewo:'271709',input:0,wip:150},{line_no:11,ewo:'271738',input:0,wip:800}],DATE_WISE_PRODUCTION_DATA:[{line_no:11,ewo:'271709',output_date:'2026-10-04',total_qty:0}]};
const plan=(record_id,date,ewo,value,color='Off White',line=11)=>({record_id,date,ewo,value,color,line,buyer:'Tommy',style:'Dress',smv:20});
c.DAILY_PLAN=[plan(1,'2026-10-04','271709',999,'Rapid Red'),plan(2,'2026-10-11','271709',100,'Rapid Red'),plan(3,'2026-10-11','271738',400),plan(4,'2026-10-12','271738',317),plan(4,'2026-10-12','271738',317),plan(5,'2026-10-12','271709',118,'Rapid Red'),plan(6,'2026-10-12','271709',0,'White'),plan(7,'2026-10-13','271709',100,'Rapid Red')];
vm.createContext(c);vm.runInContext(script,c);
function render(){c.renderS11([]);return elements.get('s11-body').innerHTML;}
function entries(output){return [...output.matchAll(/class="g-ewo([^"]*)" data-gantt="([^"]*)"/g)].map(m=>({className:m[1],payload:JSON.parse(decodeURIComponent(m[2]))}));}
let rows=entries(render()),day=rows.filter(x=>x.payload.date==='2026-10-12');
assert.deepEqual(day.map(x=>x.payload.ewo),['271738','271709']);assert.deepEqual(day.map(x=>x.payload.qty),[317,118]);
assert.match(day[0].className,/g-wip-covered/);assert.match(day[1].className,/g-cutting-covered/);
assert.equal(day[0].payload.cellEwos.length,2);assert.equal(day[1].payload.planColors.length,1);
assert.match(rows.find(x=>x.payload.date==='2026-10-13').className,/g-material-short/);
// Lower-quantity EWO remains searchable and receives demand from days when it was formerly hidden.
vm.runInContext("GANTT_EWO_SEARCH='271709'",c);rows=entries(render());assert.equal(rows.length,4);assert.ok(rows.every(x=>x.payload.ewo==='271709'));
vm.runInContext("GANTT_EWO_SEARCH=''; S11_RANGE_FROM='2026-10-13'; S11_RANGE_TO='2026-10-13'",c);rows=entries(render());assert.equal(rows.length,1);assert.match(rows[0].className,/g-material-short/);
vm.runInContext('S11_RANGE_PLAN_ID=null',c);elements.get('gantt-condition-filter').value='cutting';rows=entries(render());assert.equal(rows.length,1);assert.equal(rows[0].payload.ewo,'271709');assert.equal(rows[0].payload.date,'2026-10-12');
elements.get('gantt-color-condition').checked=false;rows=entries(render());assert.ok(rows.every(x=>!x.className));assert.equal(rows.filter(x=>x.payload.date==='2026-10-12').length,2);
elements.get('gantt-condition-filter').value='';elements.get('gantt-color-condition').checked=true;
c.DAILY_PLAN.push(plan(8,'2026-10-12','271800',50,'Blue'));day=entries(render()).filter(x=>x.payload.date==='2026-10-12');assert.equal(day.length,3);
console.log('PASS stacked 2/3 EWO cells, exact quantities/colors, duplicate/zero exclusion, independent coverage, hidden-EWO cumulative demand, search/range/condition filters, color toggle');
