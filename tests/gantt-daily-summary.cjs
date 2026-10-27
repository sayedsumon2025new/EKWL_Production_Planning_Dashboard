const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/../gantt-daily-summary.js','utf8'),c);
function fixture(){return {production:[{output_date:'2026-10-24',total_qty:0}],dates:['2026-10-25','2026-10-26'],lines:[1,2,3],search:'',selected:[0,1,2,3],
 data:[{line:1,ewo:'00123',smv:12,manpower:10,print:'Yes',emb:'Yes'},{line:1,ewo:'00123',smv:12,manpower:10,print:'Yes',emb:'Yes'},{line:2,ewo:'00123',smv:12,manpower:20,print:'Yes',emb:'Yes'},{line:3,ewo:'B',smv:30,manpower:10,print:'Yes',emb:'Yes'}],
 plan:[{record_id:1,line:1,ewo:'00123',date:'2026-10-25',value:100,smv:12},{record_id:1,line:1,ewo:'00123',date:'2026-10-25',value:100,smv:12},{record_id:2,line:2,ewo:'00123',date:'2026-10-25',value:200,smv:12},{record_id:3,line:3,ewo:'B',date:'2026-10-25',value:100,smv:30},{record_id:4,line:1,ewo:'00123',date:'2026-10-26',value:80,smv:12}],
 sah:[{record_id:11,line:1,ewo:'00123',date:'2026-10-25',value:20},{record_id:12,line:2,ewo:'00123',date:'2026-10-25',value:40},{record_id:13,line:3,ewo:'B',date:'2026-10-25',value:50}],
 clock:[{record_id:21,line:1,ewo:'00123',date:'2026-10-25',value:100},{record_id:22,line:2,ewo:'00123',date:'2026-10-25',value:200},{record_id:23,line:3,ewo:'B',date:'2026-10-25',value:100},{record_id:24,line:1,ewo:'',date:'2026-10-26',value:80}],
 fabric:[{ewo:'00123',cutable_qty:100},{ewo:'B',cutable_qty:200}],sewing:[{line_no:1,ewo:'00123',wip:30},{line_no:2,ewo:'00123',wip:40},{line_no:3,ewo:'B',wip:80}],
 embellishment:[{'EWO No':'00123','Today Print Send Qty\n':50,' Today Print Receive Qty':30,'Today EMB Send Qty':30,'Today EMB Receive Qty':20},{'EWO No':'B','Today Print Send Qty\n':90,' Today Print Receive Qty':50,'Today EMB Send Qty':60,'Today EMB Receive Qty':40}]};}
const build=f=>JSON.parse(JSON.stringify(c.buildGanttDailySummary(f))),first=f=>build(f).days[0];
let f=fixture(),r=build(f);
assert.deepEqual(r.days[0].values,[400,110,400,300,90,27.500000000000004,10,40]);
assert.deepEqual(r.days[0].stages,[100,20,30,150]);assert.equal(r.days[1].values[3],0);
f.selected=[1,3];r=first(f);assert.equal(r.values[3],170);assert.equal(r.values[4],58);assert.equal(r.total,300);
f.selected=[];assert.equal(first(f).values[3],0);assert.equal(first(f).values[4],0);
// Display filters cannot replenish the shared EWO upstream stock or skip demand
// on hidden dates/lines. Same-date allocations follow unmet-plan proportions.
f=fixture();const full=build(f);f.lines=[1];r=first(f);assert.equal(r.values[3],70);assert.equal(r.values[4],14);
f.dates=['2026-10-26'];assert.equal(first(f).values[3],full.days[1].values[3]);
f=fixture();f.search='B';r=first(f);assert.equal(r.values[3],100);assert.equal(r.values[4],50);
f=fixture();f.plan.reverse();assert.deepEqual(build(f),full);
f=fixture();f.data.push({...f.data[0],smv:18});r=first(f);assert.equal(r.values[3],300);assert.equal(r.values[4],76);assert.equal(r.partial[4],true);
f=fixture();f.data.push({...f.data[0],manpower:15});r=first(f);assert.equal(r.values[7],null);assert.equal(r.values[6],null);
f=fixture();f.clock=[];r=first(f);assert.equal(r.values[0],null);assert.equal(r.values[5],null);
f=fixture();f.clock.push({...f.clock[0]});f.sah.push({...f.sah[0]});r=first(f);assert.equal(r.values[0],400);assert.equal(r.values[1],110);
f=fixture();f.embellishment[0]['EWO No']=' 00123.00 ';assert.equal(first(f).values[3],300);
// Missing source does not poison matched daily cover; missing stays different
// from genuine numeric zero. Unknown stage priorities mark provisional totals.
f=fixture();f.fabric=[];r=first(f);assert.equal(r.values[3],200);assert.equal(r.partial[3],true);assert.equal(r.stages[0],null);
f=fixture();f.fabric.push({ewo:'00123',cutable_qty:''});r=first(f);assert.equal(r.values[3],300);assert.equal(r.partial[3],true);
f=fixture();f.fabric=[];f.sewing=[];f.embellishment=[];r=first(f);assert.equal(r.values[3],null);assert.equal(r.values[4],null);assert.equal(r.total,null);
f=fixture();f.production=[];r=build(f);assert.equal(r.days[0].values[3],null);assert.ok(r.notes.some(n=>n.includes('baseline')));
f=fixture();f.production.push({output_date:'2026-10-25',total_qty:0});r=build(f);assert.equal(r.days[0].values[3],null);assert.equal(r.days[1].values[3],80);
f=fixture();f.embellishment[0][' Today Print Receive Qty']=80;r=build(f);assert.ok(r.notes.some(n=>n.includes('Negative')));
f=fixture();f.embellishment=[];f.data.forEach(row=>{row.print='No';row.emb='No'});r=first(f);assert.equal(r.stages[1],0);assert.equal(r.stages[2],0);
// The reported incident: White WIP covers Black plan because allocation keys
// are Line+EWO, never color. 612 must not reappear on every scheduled date.
function incident(){return {dates:['2026-10-25','2026-10-26','2026-10-27'],lines:[1],search:'',selected:[0,1,2,3],production:[{output_date:'2026-10-24'}],
 data:[{line:1,ewo:'272718',color:'Black',smv:6.4,manpower:31,print:'No',emb:'No'}],
 plan:[{record_id:1,line:1,ewo:'272718',date:'2026-10-25',color:'Black',value:389},{record_id:2,line:1,ewo:'272718',date:'2026-10-26',color:'White',value:839},{record_id:3,line:1,ewo:'272718',date:'2026-10-27',color:'Black',value:839}],
 sewing:[{line_no:1,ewo:'272718',color:'White',wip:612}],fabric:[{ewo:'272718',cutable_qty:0}],embellishment:[],sah:[],clock:[]};}
f=incident();r=build(f);assert.deepEqual(r.days.map(d=>d.values[3]),[389,223,0]);assert.equal(r.days[0].values[4],389*6.4/60);assert.equal(r.days[1].values[4],223*6.4/60);
f.dates=['2026-10-26'];assert.equal(first(f).values[3],223);
f=incident();f.sewing[0].line_no=2;assert.equal(first(f).values[3],0);
f=incident();f.plan.push({...f.plan[0]});assert.equal(first(f).values[2],389);assert.equal(first(f).values[3],389);
// Approved four-stage demo: consume Sewing -> Embroidery -> Print -> Cutable.
// Stock and daily demand each count once; filter hides contributions only.
f=incident();f.dates=['2026-10-25','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30'];
f.plan=f.dates.map((date,i)=>({record_id:i+1,line:1,ewo:'272718',date,value:[389,400,300,200,300,200][i]}));
f.fabric[0].cutable_qty=500;f.embellishment=[{'EWO No':'272718','Today Print Send Qty\n':200,' Today Print Receive Qty':0,'Today EMB Send Qty':150,'Today EMB Receive Qty':0}];
r=build(f);assert.deepEqual(r.days.map(d=>d.values[3]),[389,400,300,200,173,0]);
assert.deepEqual(r.days.map(d=>d.stages),[[0,0,0,389],[0,27,150,223],[127,173,0,0],[200,0,0,0],[173,0,0,0],[0,0,0,0]]);
for(let i=0;i<4;i++)assert.equal(r.days.reduce((n,d)=>n+d.stages[i],0),[500,200,150,612][i]);
f.selected=[3];const sewingOnly=build(f);assert.deepEqual(sewingOnly.days.map(d=>d.values[3]),[389,223,0,0,0,0]);assert.deepEqual(sewingOnly.days.map(d=>d.stages),r.days.map(d=>d.stages));
// Same-date shared stock is assigned once across lines even when only one is
// visible. Source order cannot change the integer proportional distribution.
f=incident();f.sewing=[{line_no:1,ewo:'272718',wip:0},{line_no:2,ewo:'272718',wip:0}];f.fabric[0].cutable_qty=101;
f.plan=[{record_id:1,line:1,ewo:'272718',date:f.dates[0],value:100},{record_id:2,line:2,ewo:'272718',date:f.dates[0],value:100}];f.data.push({...f.data[0],line:2});
f.lines=[1];assert.equal(first(f).values[3],51);f.lines=[2];assert.equal(first(f).values[3],50);f.lines=[1,2];assert.equal(first(f).values[3],101);
f.plan.reverse();assert.equal(first(f).values[3],101);
console.log('PASS daily stock depletion across all four stages; exact line/EWO, color ignored, 612 incident, full-snapshot allocation before filters, shared stock conservation, proportional lines, per-EWO SAH, partial/missing/zero sources, production cutoff, source identity and planning metrics');
