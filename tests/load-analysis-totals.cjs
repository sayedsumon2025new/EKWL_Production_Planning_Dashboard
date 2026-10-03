const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
let sent,allowed=true,locked=false;
const frame={contentWindow:{postMessage(payload,origin){sent={payload,origin};}}};
const context={window:{addEventListener(){}},document:{addEventListener(){},getElementById(){return frame;},body:{classList:{contains(){return locked;}}}},
  location:{origin:'https://example.test'},SITE_AUTH_USER:{id:'test-user'},CURRENT_SLIDE:20,
  ACTIVE_PLAN_UPLOAD:{id:'selected'},EFF15_METRIC_UPLOAD_ID:'selected',
  canAccessSlide(){return allowed;},activePlanningLabel(){return 'Selected fixture';}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../load-analysis-bridge.js'),'utf8'),context);
const rows=[
 {record_id:1,date:'2026-10-03',criteria:'SAH/Day',value:10.25},
 {record_id:2,date:'2026-10-03',criteria:'SAH/Day',value:20.25},
 {record_id:1,date:'2026-10-03',criteria:'SAH/Day',value:10.25},
 {record_id:3,date:'2026-10-04',criteria:'SAH/Day',value:0},
 {record_id:4,date:'2026-10-03',criteria:'Plan/Day',value:99999},
 {record_id:5,date:'2026-10-05',criteria:'SAH/Day',value:null}
];
assert.deepEqual(JSON.parse(JSON.stringify(context.buildLoadAnalysisPlanTotals(rows))),{'2026-10-03':30.5,'2026-10-04':0});
assert.deepEqual(Array.from(context.buildLoadAnalysisPlanDates([{date:'2024-02-28'},{date:'2024-03-01'}])),['2024-02-28','2024-02-29','2024-03-01']);
assert.deepEqual(Array.from(context.buildLoadAnalysisPlanDates([{date:'2026-09-30'},{date:'2026-10-02'}])),['2026-09-30','2026-10-01','2026-10-02']);
context.EFF15_METRIC_DAILY=rows;
context.refreshLoadAnalysisPlan();
assert.equal(sent.origin,context.location.origin);
assert.equal(sent.payload.ready,true);
assert.equal(sent.payload.totals['2026-10-03'],30.5);
context.EFF15_METRIC_UPLOAD_ID='previous';context.refreshLoadAnalysisPlan();assert.equal(sent.payload.ready,false);assert.deepEqual(Object.keys(sent.payload.totals),[]);
context.EFF15_METRIC_UPLOAD_ID='selected';allowed=false;context.refreshLoadAnalysisPlan();assert.equal(sent.payload.ready,false);
allowed=true;locked=true;context.refreshLoadAnalysisPlan();assert.equal(sent.payload.ready,false);
locked=false;context.SITE_AUTH_USER=null;context.refreshLoadAnalysisPlan();assert.equal(sent.payload.ready,false);
console.log('PASS Load Analysis selected SAH sums, duplicate protection, date ranges, stale snapshots and auth guards');

