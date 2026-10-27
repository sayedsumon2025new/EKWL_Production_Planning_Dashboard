const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={};vm.createContext(c);for(const file of ['gantt-daily-summary.js','load-analysis-loss.js'])vm.runInContext(fs.readFileSync(__dirname+'/../'+file,'utf8'),c);
function fixture(){const dates=['2026-10-25','2026-10-26'];return {dates,lines:[1],masterLines:[1],selected:[0,1,2,3],search:'',production:[{output_date:'2026-10-24'}],data:[{line:1,ewo:'272718',smv:6,print:'No',emb:'No'}],plan:dates.map((date,i)=>({record_id:i+1,line:1,ewo:'272718',date,value:1000,smv:6})),sah:dates.map(date=>({record_id:99,date,line:1,ewo:'272718',value:100})),clock:[],sewing:[{line_no:1,ewo:'272718',color:'White',wip:600}],fabric:[{ewo:'272718',cutable_qty:0}],embellishment:[],sources:{size:[],accessories:[],fabric:[],embellishment:[]},overrides:{},dailyCapacity:120,planTotals:Object.fromEntries(dates.map(date=>[date,100]))};}
const build=f=>JSON.parse(JSON.stringify(c.buildLoadAnalysisLoss(f)));
let f=fixture(),r=build(f);assert.deepEqual(r.days.map(d=>d.forecast),[60,0]);assert.deepEqual(r.days.map(d=>d.loss),[60,120]);assert.deepEqual(r.days.map(d=>d.loading),[20,20]);assert.deepEqual(r.days.map(d=>d.buckets.unknown),[40,100]);
f.sources.size=[{row_data:{EWO:'272718.0','T & A Closed':'Pending'}}];f.sources.accessories=[{row_data:{EWO:'272718','Sewing Trims Pending Stts':'Zipper pending'}}];r=build(f);assert.equal(r.days[0].buckets.sample,40);assert.equal(r.days[0].buckets.accessories,0);assert.equal(r.records[0].evidence.length,2);
f.sources.size[0].row_data['T & A Closed']='Closed';r=build(f);assert.equal(r.days[0].buckets.accessories,40);
f.sources.accessories[0].row_data['Sewing Trims Pending Stts']='All Acc. Balanced';f.sources.fabric=[{ewo:'272718',status:'No issue; resolved low GSM',fabric_balance:0}];r=build(f);assert.equal(r.days[0].buckets.gsm,0);assert.equal(r.days[0].buckets.unknown,40);
f.sources.fabric=[{ewo:'272718',status:'Low GSM issue',cutting_difficulties:'Panel wash challenge'}];r=build(f);assert.equal(r.days[0].buckets.gsm,40);assert.equal(r.days[0].buckets.wash,0);
// Explicit user rule: any positive Print/EMB WIP flags delay; both evidence
// flags survive but each loss contribution receives only one primary reason.
f=fixture();f.sources.embellishment=[{'EWO No':'272718','Today Print Send Qty\n':100,' Today Print Receive Qty':40,'Today EMB Send Qty':100,'Today EMB Receive Qty':80}];f.embellishment=f.sources.embellishment;r=build(f);assert.equal(r.days[0].buckets.print,6);assert.equal(r.days[0].buckets.emb,2);assert.equal(r.days[0].forecast,60);assert.equal(r.days[0].ganttForecast,68);assert.ok(r.records[0].evidence.some(x=>x.reason==='emb'));assert.ok(r.records[0].evidence.some(x=>x.reason==='print'));
f.sources.embellishment[0][' Today Print Receive Qty']=100;r=build(f);assert.equal(r.days[0].buckets.emb,2);
f.sources.embellishment[0]['Today EMB Receive Qty']=120;r=build(f);assert.equal(r.days[0].buckets.emb,0);assert.equal(r.days[0].buckets.unknown,40);
f=fixture();const key='["2026-10-25",1,"272718"]';f.overrides[key]={reason:'wash',note:'Operator confirmation'};r=build(f);assert.equal(r.days[0].buckets.wash,40);assert.equal(r.days[0].loss,60);assert.equal(r.records[0].manual.note,'Operator confirmation');
f.overrides[key].reason='planning';assert.equal(build(f).days[0].buckets.unknown,40);
// Loss is capped to target even if the plan exceeds target.
f=fixture();f.dailyCapacity=80;r=build(f);assert.equal(r.days[0].loss,20);assert.equal(r.days[0].buckets.unknown,20);assert.equal(r.days[0].loading,0);
f=fixture();f.production=[];r=build(f);assert.equal(r.days[0].forecast,null);assert.equal(r.days[0].loss,null);assert.equal(r.days[0].buckets.unknown,null);
f=fixture();f.dailyCapacity=null;r=build(f);assert.equal(r.days[0].forecast,60);assert.equal(r.days[0].loss,null);
for(const day of build(fixture()).days)assert.ok(Math.abs(Object.values(day.buckets).reduce((a,b)=>a+b,0)-day.loss)<1e-9);
f=fixture();f.dailyCapacity=10;f.planTotals=Object.fromEntries(f.dates.map(d=>[d,10]));f.plan.forEach(r=>r.value=100);f.sah.forEach(r=>r.value=10);f.sewing[0].wip=80;f.embellishment=[{'EWO No':'272718','Today Print Send Qty\n':20,' Today Print Receive Qty':0,'Today EMB Send Qty':0,'Today EMB Receive Qty':0}];f.sources.embellishment=f.embellishment;r=build(f);assert.equal(r.days[0].ganttForecast,10);assert.equal(r.days[0].forecast,8);assert.equal(r.days[0].buckets.print,2);assert.equal(r.days[0].loss,2);assert.equal(r.days[1].buckets.print,0);
console.log('PASS Gantt forecast derivation and agreed 10→8+2 quantity example, status evidence/priority, positive Print/EMB WIP delay rule, no duplicate attribution, target-plan split/cap, unknown data and manual reclassification');

const departments=days=>JSON.parse(JSON.stringify(c.buildLoadAnalysisDepartmentTotals(days)));
let chart=departments([{loss:100,partial:false,buckets:{planning:10,sample:5,accessories:10,gsm:15,fabric:20,wash:5,print:10,emb:5,unknown:20}}]);
assert.equal(chart.total,100);assert.equal(chart.expected,100);assert.equal(chart.reconciled,true);assert.equal(chart.series.find(r=>r.id==='textile').value,35);assert.equal(chart.series.find(r=>r.id==='unassigned').value,20);assert.ok(Math.abs(chart.series.reduce((n,r)=>n+r.percent,0)-100)<1e-9);
chart=departments([{loss:null,buckets:{}}]);assert.equal(chart.total,null);assert.equal(chart.knownDates,0);
chart=departments([{loss:0,buckets:Object.fromEntries(chart.series.flatMap(r=>r.keys).map(k=>[k,0]))}]);assert.equal(chart.total,0);assert.ok(chart.series.every(r=>r.percent===0));
chart=departments([{loss:100,buckets:{planning:10,sample:5,accessories:10,gsm:15,fabric:20,wash:5,print:10,emb:5,unknown:10}}]);assert.equal(chart.reconciled,false);
for(const day of build(fixture()).days){const chart=departments([day]);assert.equal(chart.total,day.loss);assert.equal(chart.reconciled,true);}
console.log('PASS department/table/header conservation, Textile grouping, Unassigned, exact percentages, missing/zero data and mismatch detection');
