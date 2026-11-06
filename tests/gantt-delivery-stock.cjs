const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={};vm.createContext(c);for(const file of ['gantt-stock.js','gantt-daily-summary.js'])vm.runInContext(fs.readFileSync(__dirname+'/../'+file,'utf8'),c);
c.gsPair=vm.runInContext('gsPair',c);
const raw=(date,ewo,color,cut)=>{const r=Array(25).fill('');r[0]=date;r[3]=ewo;r[6]=color;r[8]=String(cut);r[9]='999999';return r;};
const meta=(id,line,delivery,color='Navy',print='No',emb='No')=>({record_id:id,line,ewo:'271080',color,deliverydate:delivery,smv:12,manpower:20,print,emb});
function fixture(){return {rfdDaily:{report:{id:'saved',file_name:'Daily.csv'},rows:[raw('2026-11-01','271080-FBR','Navy',3000),raw('2026-11-02','271080',' navy ',4000),raw('2026-11-03','271080','Navy',3000),raw('2026-11-03','271080','Red',9000)]},data:[meta(1,5,'2026-11-10'),meta(2,2,'2026-11-12'),meta(3,8,'2026-11-15')],plan:[{record_id:1,line:5,ewo:'271080',color:'Navy',date:'2026-11-06',value:1200},{record_id:2,line:2,ewo:'271080',color:'Navy',date:'2026-11-05',value:1000},{record_id:3,line:8,ewo:'271080',color:'Navy',date:'2026-11-05',value:800}],sewing:[{line_no:5,ewo:'271080',color:'Navy',input:8000,output:8000,reject:0,wip:0},{line_no:2,ewo:'271080',color:'Navy',input:0,output:0,reject:0,wip:0},{line_no:8,ewo:'271080',color:'Navy',input:0,output:0,reject:0,wip:0}],production:[{output_date:'2026-11-04'}],embellishment:[],dates:['2026-11-05','2026-11-06'],lines:[2,5,8],selected:[0,1,2,3,4],sah:[],clock:[]};}
const part=(m,line,date='2026-11-05')=>m.allocations.get(JSON.stringify([date,line,'271080']));
let f=fixture(),m=c.buildGanttStock(f),p=m.pairs.get(c.gsPair('271080','Navy'));
assert.equal(p.cut,10000);assert.equal(p.cutting,2000);assert.deepEqual(Array.from(p.cutRows),[2,3,4]);
assert.equal(part(m,5,'2026-11-06').stages[4],1200);assert.equal(part(m,2).stages[4],800);assert.equal(part(m,8).stages[4],0);
assert.equal(c.ganttAllocatedCondition(m,5,'2026-11-06','271080'),'cutting');assert.equal(c.ganttAllocatedCondition(m,2,'2026-11-05','271080'),'');
assert.equal([...m.allocations.values()].reduce((n,a)=>n+(a.stages[4]||0),0),2000);
assert.ok([...m.allocations.values()].every(a=>a.stages[0]===null));
let summary=c.buildGanttDailySummary(f);assert.equal(summary.days[0].stages[4],800);assert.equal(summary.days[1].stages[4],1200);assert.equal(summary.days[0].values[4],160);assert.equal(summary.days[1].values[4],240);
f.lines=[2];f.dates=['2026-11-05'];assert.equal(c.buildGanttDailySummary(f).days[0].values[3],800); // Filtering cannot steal the earlier delivery's reservation.
f.selected=[3];assert.equal(c.buildGanttDailySummary(f).days[0].values[3],0);
// Color stock cannot leak; aliases are not guessed. Duplicate transport identity counts once.
f=fixture();f.plan.push({...f.plan[0]});m=c.buildGanttStock(f);assert.equal(part(m,5,'2026-11-06').qty,1200);
f=fixture();f.plan[0].color='Navy Blue';m=c.buildGanttStock(f);assert.equal(part(m,5,'2026-11-06').stages[4],null);
// Print/embroidery keep their established formulas; both require a confirmed final route.
f=fixture();f.data.forEach(r=>r.print='Yes');f.sewing[0].input=4000;f.embellishment=[{'EWO No':'271080',Color:'Navy','Today Print Send Qty\n':8000,' Today Print Receive Qty':6000,'Today EMB Send Qty':0,'Today EMB Receive Qty':0}];m=c.buildGanttStock(f);p=m.pairs.get(c.gsPair('271080','Navy'));assert.equal(p.cutting,2000);assert.equal(p.printWip,2000);assert.equal(part(m,2).stages[1],200);assert.equal(part(m,8).stages[1],800);
f.data.forEach(r=>r.emb='Yes');m=c.buildGanttStock(f);assert.equal(m.pairs.get(c.gsPair('271080','Navy')).cutting,null);assert.ok(m.notes.some(n=>n.includes('Final process')));
f.data.forEach(r=>{r.print='No';r.emb='Yes';});f.embellishment=[{'EWO No':'271080',Color:'Navy','Today Print Send Qty\n':0,' Today Print Receive Qty':0,'Today EMB Send Qty':5000,'Today EMB Receive Qty':3500}];f.sewing[0].input=2000;m=c.buildGanttStock(f);p=m.pairs.get(c.gsPair('271080','Navy'));assert.equal(p.cutting,1500);assert.equal(p.embWip,1500);assert.equal(part(m,5,'2026-11-06').stages[4],1200);assert.equal(part(m,2).stages[4],300);assert.equal(part(m,2).stages[2],700);
// Missing/invalid source is unavailable, zero is real, negative stock is never allocated.
f=fixture();f.rfdDaily=null;m=c.buildGanttStock(f);assert.equal(part(m,2).stages[4],null);
f=fixture();f.rfdDaily.rows[0][8]='bad';m=c.buildGanttStock(f);assert.equal(m.pairs.get(c.gsPair('271080','Navy')).cut,null);assert.equal(part(m,2).stages[4],null);
f=fixture();f.sewing[0].input=11000;m=c.buildGanttStock(f);assert.equal(m.pairs.get(c.gsPair('271080','Navy')).cutting,-1000);assert.equal(part(m,2).stages[4],0);
f=fixture();f.production=[];assert.equal(c.buildGanttStock(f).allocations.size,0);
// Missing delivery sorts last; same delivery uses plan date then line.
f=fixture();f.data[0].deliverydate='';m=c.buildGanttStock(f);assert.equal(part(m,2).stages[4],1000);assert.equal(part(m,8).stages[4],800);assert.equal(part(m,5,'2026-11-06').stages[4],200);
f.data.forEach(r=>r.deliverydate='2026-11-12');f.plan[0].date='2026-11-05';m=c.buildGanttStock(f);assert.equal(part(m,2).stages[4],1000);assert.equal(part(m,5).stages[4],1000);assert.equal(part(m,8).stages[4],0);
// Different colors/SMVs in one cell use each allocation's own conversion, never an average.
f=fixture();f.data=[meta(1,5,'2026-11-10'),{...meta(2,5,'2026-11-10','Red'),smv:30}];f.plan=[{record_id:1,line:5,ewo:'271080',color:'Navy',date:'2026-11-05',value:100},{record_id:2,line:5,ewo:'271080',color:'Red',date:'2026-11-05',value:100}];f.lines=[5];summary=c.buildGanttDailySummary(f);assert.equal(summary.days[0].values[4],70);
assert.equal(c.gsEwo('271080-FBR'),'271080');assert.equal(c.gsEwo('271080 / 271081'),'');
console.log('PASS RFD daily sums; delivery-first reservations; color isolation; stage formulas; shared-stock conservation; filter invariance; per-color SAH; missing/invalid sources; cutoff and deterministic ties');

vm.runInContext(fs.readFileSync(__dirname+'/../load-analysis-loss.js','utf8'),c);
f.sources={fabric:[],size:[],accessories:[],embellishment:[]};f.dailyCapacity=100;f.planTotals=Object.fromEntries(f.dates.map(d=>[d,100]));f.overrides={};
const loss=c.buildLoadAnalysisLoss(f);assert.equal(loss.days[0].forecast,70);assert.equal(loss.days[0].ganttForecast,70);assert.equal(loss.days[0].wipSah[4],70);
f.data.forEach(r=>r.smv=0);summary=c.buildGanttDailySummary(f);assert.equal(summary.days[0].values[4],null);assert.ok(summary.notes.some(n=>n.includes('SMV')));
console.log('PASS Load Analysis uses identical RFD/delivery allocation with per-color SMV; missing SMV cannot become a false zero SAH');
