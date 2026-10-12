const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../gantt-hover.js','utf8');
const c={document:{addEventListener(){}},DATA:[],SEWING_IO_DATA:[],FABRIC_CUTTING_DATA:[],SAH_DATA:[],SAH_DAILY:[],esc:String};
vm.createContext(c);vm.runInContext(source,c);
const w={line:11,ewo:'271738',date:'2026-10-12',selectedColors:['Off White'],color:'Off White',qty:317,planColors:[{color:'Off White',qty:317}],buyer:'Tommy',style:'Dress'};
c.SAH_DATA=[
 {record_id:1,line:11,ewo:'271738.0',color:' off   white '},
 {record_id:2,line:11,ewo:'271738',color:'Off White'},
 {record_id:3,line:11,ewo:'271738',color:'Blue'},
 {record_id:4,line:12,ewo:'271738',color:'Off White'},
 {record_id:5,line:11,ewo:'different',color:'Off White'}
];
c.SAH_DAILY=[
 {record_id:1,date:'2026-10-12',value:100},
 {record_id:2,date:'2026-10-12',value:5},
 {record_id:1,date:'2026-10-12',value:100},
 {record_id:1,date:'2026-10-13',value:900},
 {record_id:3,date:'2026-10-12',value:20.25},
 {record_id:4,date:'2026-10-12',value:700},
 {record_id:5,date:'2026-10-12',value:800},
 {record_id:999,date:'2026-10-12',value:500}
];
assert.equal(c.ganttHoverPlanSah(w),105);
assert.equal(c.ganttHoverPlanSah({...w,selectedColors:['Blue']}),20.25);
assert.equal(c.ganttHoverPlanSah({...w,selectedColors:['Off White','Blue']}),125.25);
assert.equal(c.ganttHoverPlanSah({...w,date:'2026-10-14'}),null);
let html=c.ganttHoverHtml(w,{order_bank_rows:1,order_qty:558});
assert.ok(html.indexOf('Plan / Day')<html.indexOf('Plan SAH')&&html.indexOf('Plan SAH')<html.indexOf('Total Order Qty'));
assert.match(html,/Plan SAH<\/span><strong class="">105<\/strong>/);
// Switching the selected planning snapshot changes the result without a cached SAH value.
c.SAH_DAILY=[{record_id:2,date:'2026-10-12',value:151}];assert.equal(c.ganttHoverPlanSah(w),151);
c.SAH_DAILY=[{record_id:2,date:'2026-10-12',value:0}];assert.equal(c.ganttHoverPlanSah(w),0);
c.SAH_DAILY=[];assert.equal(c.ganttHoverPlanSah(w),null);
assert.match(c.ganttHoverHtml(w,null),/Plan SAH<\/span><strong class="">—<\/strong>/);
new vm.Script(source);
console.log('PASS Plan SAH: source record/color join, exact line/EWO/date, PO sums, duplicate suppression, color changes/all colors, planning switch, zero/missing values, row placement');
