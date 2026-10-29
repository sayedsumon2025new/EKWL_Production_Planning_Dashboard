const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const main=fs.readFileSync(__dirname+'/../dashboard-main.js','utf8');
const c={N:v=>Number(v)||0};vm.createContext(c);
vm.runInContext(main.slice(main.indexOf('function fabricEwoColorKey('),main.indexOf('function fabricCuttingCascade('))+main.slice(main.indexOf('function s12CuttingWipMetric('),main.indexOf('function renderS12(')),c);
vm.runInContext(fs.readFileSync(__dirname+'/../gantt-daily-summary.js','utf8'),c);
function fixture(){const dates=Array.from({length:6},(_,i)=>'2026-10-'+(25+i));return {dates,lines:[1],masterLines:[1,2],selected:[0,1,2,3,4],search:'',production:[{output_date:'2026-10-24'}],data:[{line:1,ewo:'A',color:'White',smv:6,manpower:20,print:'Yes',emb:'No'}],plan:dates.map((date,i)=>({record_id:i,line:1,ewo:'A',color:'Black',date,value:1000,smv:6})),sah:[],clock:[],fabric:[{ewo:'A',color_name:'White',total_cut_qty:10000,cutable_qty:500}],sewing:[{line_no:1,ewo:'A',color:'White',input:1000,wip:600},{line_no:2,ewo:'A',color:'White',input:3000,wip:0}],embellishment:[{'EWO No':'A',Color:' White ','Today Print Send Qty\n':8000,' Today Print Receive Qty':6000,'Today EMB Send Qty':0,'Today EMB Receive Qty':0}],embellishmentAvailable:true};}
const build=f=>JSON.parse(JSON.stringify(c.buildGanttDailySummary(f)));
let f=fixture(),r=build(f);
assert.deepEqual(r.days.map(d=>d.values[3]),[1000,1000,1000,1000,1000,100]);
assert.deepEqual(r.days.map(d=>d.stages[4]),[400,1000,600,0,0,0]);
assert.deepEqual(r.days[0].stages,[0,0,0,600,400]);
assert.equal(r.days.reduce((s,d)=>s+d.stages[4],0),2000);
assert.equal(r.days.reduce((s,d)=>s+d.values[3],0),5100); // 600 sewing + 2000 cutting + 2000 print + 500 cutable.
assert.equal(r.days.reduce((s,d)=>s+d.values[4],0),510);
f.selected=[4];let only=build(f);assert.deepEqual(only.days.map(d=>d.values[3]),[400,1000,600,0,0,0]);assert.deepEqual(only.days.map(d=>d.values[4]),[40,100,60,0,0,0]);assert.deepEqual(only.days.map(d=>d.stages),r.days.map(d=>d.stages));
f.dates=f.dates.slice(1);assert.equal(build(f).days[0].values[3],1000); // Prior-day consumption cannot reappear.
f=fixture();f.embellishment=[];f.data[0].print='No';f.sewing=[{ewo:'A',color:'White',line_no:1,input:8000,wip:0}];f.fabric[0].cutable_qty=0;r=build(f);assert.equal(r.days.reduce((s,d)=>s+d.stages[4],0),2000);
f=fixture();f.data.push({...f.data[0],color:'Navy',print:'No'});f.fabric.push({ewo:'A',color_name:'Navy',total_cut_qty:10000,cutable_qty:0});f.sewing.push({ewo:'A',color:'Navy',line_no:1,input:8000,wip:0});r=build(f);assert.equal(r.days.reduce((s,d)=>s+d.stages[4],0),4000); // Per-color process formula, then EWO pooling.
f=fixture();f.data[0].emb='Yes';r=build(f);assert.ok(r.days.every(d=>d.stages[4]===null));assert.ok(r.notes.some(n=>n.includes('Final process')));
f=fixture();f.embellishmentAvailable=false;r=build(f);assert.ok(r.days.every(d=>d.stages[4]===null));assert.equal(r.days[0].stages[3],600);
f=fixture();f.embellishment[0][' Today Print Receive Qty']=0;r=build(f);assert.equal(r.days.reduce((s,d)=>s+(d.stages[4]||0),0),0);assert.ok(r.notes.some(n=>n.includes('Negative')));
f=fixture();f.production=[];r=build(f);assert.ok(r.days.every(d=>d.values[3]===null&&d.stages[4]===null));
// Shared cutting stock follows unmet demand proportions before line filters.
f=fixture();f.data.push({...f.data[0],line:2});f.sewing.forEach(x=>x.wip=0);f.plan=[{record_id:1,line:1,ewo:'A',date:f.dates[0],value:2000},{record_id:2,line:2,ewo:'A',date:f.dates[0],value:2000}];f.selected=[4];f.lines=[1];assert.equal(build(f).days[0].values[3],1000);f.lines=[2];assert.equal(build(f).days[0].values[3],1000);f.lines=[1,2];assert.equal(build(f).days[0].values[3],2000);
// Load Analysis must use the same five-stage Gantt SAH and retain Print/EMB delay indices.
vm.runInContext(fs.readFileSync(__dirname+'/../load-analysis-loss.js','utf8'),c);
f=fixture();f.sources={fabric:[],size:[],accessories:[],embellishment:[]};f.dailyCapacity=200;f.planTotals=Object.fromEntries(f.dates.map(d=>[d,100]));f.overrides={};r=JSON.parse(JSON.stringify(c.buildLoadAnalysisLoss(f)));
assert.equal(r.days[0].ganttForecast,100);assert.equal(r.days[0].forecast,100);assert.equal(r.days[2].ganttForecast,100);assert.equal(r.days[2].printSah,40);assert.equal(r.days[2].forecast,60);
console.log('PASS fifth Cutting WIP stage: approved receipts/no-process formula, all-line/color pooling, stock conservation, carry-forward, filter invariance, per-EWO SAH, missing/ambiguous sources, shared lines and Load Analysis parity');
