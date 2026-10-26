const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/../gantt-daily-summary.js','utf8'),c);
function fixture(){return {dates:['2026-10-25','2026-10-26'],lines:[1,2,3],search:'',selected:[0,1,2,3],
 data:[{line:1,ewo:'00123',smv:12,manpower:10,print:'Yes',emb:'Yes'},{line:1,ewo:'00123',smv:12,manpower:10,print:'Yes',emb:'Yes'},{line:2,ewo:'00123',smv:12,manpower:20,print:'Yes',emb:'Yes'},{line:3,ewo:'B',smv:30,manpower:10,print:'Yes',emb:'Yes'}],
 plan:[{record_id:1,line:1,ewo:'00123',date:'2026-10-25',value:100,smv:12},{record_id:1,line:1,ewo:'00123',date:'2026-10-25',value:100,smv:12},{record_id:2,line:2,ewo:'00123',date:'2026-10-25',value:200,smv:12},{record_id:3,line:3,ewo:'B',date:'2026-10-25',value:100,smv:30},{record_id:4,line:1,ewo:'00123',date:'2026-10-26',value:80,smv:12}],
 sah:[{record_id:11,line:1,ewo:'00123',date:'2026-10-25',value:20},{record_id:12,line:2,ewo:'00123',date:'2026-10-25',value:40},{record_id:13,line:3,ewo:'B',date:'2026-10-25',value:50}],
 clock:[{record_id:21,line:1,ewo:'00123',date:'2026-10-25',value:100},{record_id:22,line:2,ewo:'00123',date:'2026-10-25',value:200},{record_id:23,line:3,ewo:'B',date:'2026-10-25',value:100},{record_id:24,line:1,ewo:'',date:'2026-10-26',value:80}],
 fabric:[{ewo:'00123',cutable_qty:100},{ewo:'B',cutable_qty:200}],sewing:[{line_no:1,ewo:'00123',wip:30},{line_no:2,ewo:'00123',wip:40},{line_no:3,ewo:'B',wip:80}],
 embellishment:[{'EWO No':'00123','Today Print Send Qty\n':50,' Today Print Receive Qty':30,'Today EMB Send Qty':30,'Today EMB Receive Qty':20},{'EWO No':'B','Today Print Send Qty\n':90,' Today Print Receive Qty':50,'Today EMB Send Qty':60,'Today EMB Receive Qty':40}]};}
const build=f=>JSON.parse(JSON.stringify(c.buildGanttDailySummary(f))),first=f=>build(f).days[0];
let f=fixture(),r=build(f);assert.deepEqual(r.days[0].values,[400,110,400,540,210,27.500000000000004,10,40]);assert.deepEqual(r.days[0].stages,[300,60,30,150]);assert.equal(r.days[1].values[3],160);assert.equal(r.days[1].values[4],32);
// Shared EWO stock appears once although both lines are scheduled. EWO SMV is
// applied before summing SAH; a global average SMV would give a different answer.
f.selected=[1,3];r=first(f);assert.equal(r.values[3],210);assert.equal(r.values[4],78);assert.equal(r.total,540);assert.deepEqual(r.values.slice(0,3),[400,110,400]);
f.selected=[];r=first(f);assert.equal(r.values[3],0);assert.equal(r.values[4],0);
f=fixture();f.lines=[1];r=first(f);assert.equal(r.values[3],160);assert.equal(r.values[4],32);assert.equal(r.values[7],10);
f=fixture();f.search='B';r=first(f);assert.equal(r.values[2],100);assert.equal(r.values[3],340);assert.equal(r.values[4],170);
f=fixture();f.fabric=[];r=first(f);assert.equal(r.values[3],240);assert.equal(r.partial[3],true);assert.equal(r.stages[0],null);f.selected=[3];r=first(f);assert.equal(r.values[3],150);assert.equal(r.values[4],54);
f=fixture();f.data.push({...f.data[0],smv:18});r=first(f);assert.equal(r.values[3],540);assert.equal(r.values[4],170);assert.equal(r.partial[4],true);
f=fixture();f.data.push({...f.data[0],manpower:15});r=first(f);assert.equal(r.values[7],null);assert.equal(r.values[6],null);
f=fixture();f.fabric[1].cutable_qty=0;r=first(f);assert.equal(r.values[3],340);
f=fixture();f.clock=[];r=first(f);assert.equal(r.values[0],null);assert.equal(r.values[5],null);
f=fixture();f.embellishment=[];f.data.forEach(row=>{row.print='No';row.emb='No'});r=first(f);assert.equal(r.values[3],450);assert.equal(r.stages[1],0);assert.equal(r.stages[2],0);
f=fixture();f.embellishment[0][' Today Print Receive Qty']=80;r=build(f);assert.equal(r.days[0].stages[1],40);assert.ok(r.notes.some(note=>note.includes('Negative')));
f=fixture();f.plan.push({record_id:99,line:1,ewo:'00123',date:'2026-10-25',value:10,smv:12});r=first(f);assert.equal(r.values[2],410);
f=fixture();f.clock.push({...f.clock[0]});f.sah.push({...f.sah[0]});r=first(f);assert.equal(r.values[0],400);assert.equal(r.values[1],110);
console.log('PASS daily planning totals, per-EWO SAH, shared stock deduplication, WIP-only filtering, source-row identity, line/search scope, missing/zero/conflicting inputs and nonnegative WIP');

// Realistic mixed coverage: one missing EWO must not blank matched report totals.
f=fixture();f.fabric.pop();f.embellishment.pop();r=first(f);
assert.deepEqual(r.stages,[100,20,10,150]);assert.deepEqual(r.stagePartial,[true,true,true,false]);
assert.equal(r.values[3],280);assert.equal(r.values[4],80);assert.equal(r.total,280);assert.equal(r.totalPartial,true);assert.equal(r.partial[3],true);
// A blank source field does not erase another numeric row in the same EWO.
f=fixture();f.fabric.push({ewo:'00123',cutable_qty:''});r=first(f);assert.equal(r.stages[0],300);assert.equal(r.stagePartial[0],true);assert.equal(r.values[3],540);assert.equal(r.partial[3],true);
// Identifiers are normalized after loading the active report.
f=fixture();f.embellishment[0]['EWO No']=' 00123.00 ';r=first(f);assert.equal(r.values[3],540);assert.equal(r.values[4],210);
// No numeric stock anywhere remains unavailable; do not fabricate zero stock.
f=fixture();f.fabric=[];f.sewing=[];f.embellishment=[];r=first(f);assert.equal(r.values[3],null);assert.equal(r.values[4],null);assert.equal(r.total,null);
f=fixture();f.data.forEach(row=>row.smv=0);r=first(f);assert.equal(r.values[3],540);assert.equal(r.values[4],null);
console.log('PASS mixed report coverage retains available WIP/SAH with partial markers; wholly missing data remains unavailable');
