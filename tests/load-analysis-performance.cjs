const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
function engine(file){const c={};vm.createContext(c);for(const p of ['gantt-daily-summary.js',file])vm.runInContext(fs.readFileSync(p,'utf8'),c);return c;}
const before=engine('tests/fixtures/load-analysis-before-performance.js'),after=engine('load-analysis-loss.js');
function fixture(ewos,days){
 const dates=Array.from({length:days},(_,i)=>new Date(Date.UTC(2026,10,1+i)).toISOString().slice(0,10));
 const f={dates,lines:[1,2,3,4,5],masterLines:[1,2,3,4,5],selected:[0,1,2,3,4],search:'',production:[{output_date:'2026-10-31'}],data:[],plan:[],sah:[],clock:[],sewing:[],fabric:[],embellishment:[],sources:{size:[],accessories:[],fabric:[],embellishment:[]},overrides:{},dailyCapacity:10000,planTotals:Object.fromEntries(dates.map(d=>[d,ewos*20]))};
 for(let e=0;e<ewos;e++){
  const ewo=String(10000+e),line=e%5+1;
  for(let c=0;c<2;c++){
   const record_id=e*2+c+1,color=c?'Black':'White';f.data.push({record_id,line,ewo,color,smv:c&&e%7===0?8:6,manpower:20,print:'No',emb:'No'});
   dates.forEach((date,i)=>{f.plan.push({record_id,line,ewo,date,color,value:c&&i%4===0?-5:100,smv:6});f.sah.push({record_id:record_id+100000,line,ewo,date,value:c&&i%4===0?-.5:10});});
  }
  f.sewing.push({line_no:line,ewo,wip:250});f.fabric.push({ewo,cutable_qty:1000});
  f.sources.fabric.push({ewo,status:e%2?'Low GSM issue':'Closed',fabric_balance:e%2?-20:0});
  f.sources.accessories.push({row_data:{EWO:ewo,Color:e%3?'White':'','Sewing Trims Pending Stts':e%4?'Closed':'Zipper pending'}});
 }
 f.sah.push({...f.sah[0],value:99999}); // Preserve first-record duplicate semantics.
 return f;
}
const plain=x=>JSON.parse(JSON.stringify(x));
for(const selected of [[0,1,2,3,4],[],[1,2],[0,3],[4]]){
 const f=fixture(12,8);f.selected=selected;f.overrides['["2026-11-01",1,"10000"]']={reason:'unknown',note:'Retain original evidence'};
 assert.deepEqual(plain(after.buildLoadAnalysisLoss(f)),plain(before.buildLoadAnalysisLoss(f)));
}
const f=fixture(100,60);let inspections=0;
for(const row of f.sah){const id=row.record_id;Object.defineProperty(row,'record_id',{enumerable:true,get(){inspections++;return id;}});}
const start=performance.now(),model=after.buildLoadAnalysisLoss(f),ms=performance.now()-start;
assert.equal(model.records.length,6000);assert.ok(model.reconciliation.ok);
assert.ok(inspections<f.sah.length*20,`SAH source rescanned excessively: ${inspections}`);
assert.ok(ms<15000,`Large synthetic model stalled: ${ms} ms`);
assert.strictEqual(model.records[0].evidence,model.records.find(r=>r.date!==model.records[0].date&&r.line===model.records[0].line&&r.ewo===model.records[0].ewo&&JSON.stringify(r.colors)===JSON.stringify(model.records[0].colors)).evidence);
console.log('PASS full before/after model parity across WIP selections, mixed colors/SMVs, signed rows, duplicate SAH and corrections; bounded source inspections and shared scope evidence',JSON.stringify({records:model.records.length,sahRows:f.sah.length,sahInspections:inspections,localMs:Math.round(ms)}));
