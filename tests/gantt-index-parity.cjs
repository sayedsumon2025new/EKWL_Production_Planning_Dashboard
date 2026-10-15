const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const main=fs.readFileSync(__dirname+'/../dashboard-main.js','utf8');
const updated=main.slice(main.indexOf("let GANTT_EWO_SEARCH='';"),main.indexOf('\nfunction renderS7(data){'));
const previous=fs.readFileSync(__dirname+'/fixtures/gantt-before-step3.js','utf8');
function setup(source){
 const elements=new Map(),marks=[];
 const c={console,prepareSharedReportView:()=>true,document:{getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',checked:id==='gantt-color-condition'});return elements.get(id);}},getChassisMasterLines:()=>new Set([11,12]),ACTIVE_PLAN_UPLOAD:{id:'P04'},SITE_AUTH_USER:{id:'A'},SITE_SESSION_GENERATION:0,activePlanningLabel:()=> 'P04',monthFromISO:d=>d.startsWith('2026-09')?'Sep-26':'Oct-26',N:v=>Number.isFinite(Number(v))?Number(v):0,esc:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),CLOCK_HOUR_DATA:[],SAH_DATA:[],FABRIC_CUTTING_DATA:[],SEWING_IO_DATA:[],DATE_WISE_PRODUCTION_DATA:[],DAILY_PLAN:[],startDashboardTiming:name=>{const start=performance.now();return info=>marks.push({name,...info,durationMs:performance.now()-start});}};
 vm.createContext(c);vm.runInContext(source,c);
 return {c,elements,marks,run:s=>vm.runInContext(s,c),render(){c.renderS11([]);return Object.fromEntries([...elements].map(([key,e])=>[key,{innerHTML:e.innerHTML,textContent:e.textContent,value:e.value,disabled:e.disabled,min:e.min,max:e.max}]))}};
}
const old=setup(previous),next=setup(updated);
const plan=(record_id,date,ewo,value,color='Off White',line=11,smv=20)=>({record_id,date,ewo,value,color,line,smv,buyer:'Tommy',style:'Dress'});
const fixtures={
 DAILY_PLAN:[plan(1,'2026-10-04','271709',999,'Rapid Red'),plan(2,'2026-10-11','271709',100,'Rapid Red'),plan(3,'2026-10-11','271738',400),plan(4,'2026-10-12','271738',317),plan(4,'2026-10-12','271738',317),plan(5,'2026-10-12','271709',118,'Rapid Red'),plan(6,'2026-10-12','271709',0),plan(7,'2026-10-13','271709',50,'Rapid Red'),plan(8,'2026-10-14','271709',100,'Rapid Red'),plan(9,'2026-10-12','271738',20,'Blue'),plan(null,'2026-10-12','271738',5,'Blue'),plan(null,'2026-10-12','271738',5,'Blue'),plan(10,'2026-09-30','271709',3.14,'Rapid Red'),plan(11,'2026-10-12','271800',15,'',12,0),plan(12,'2026-10-12','271800',15,'',12,18),plan(13,'2026-10-12','271800',15,'',12,15),plan(14,'','271709',400,'Invalid date color')],
 CLOCK_HOUR_DATA:[{line:11,ewo:'271709',month:'Oct-26',total:1.1},{line:11,ewo:'271709',month:'Oct-26',total:2.2},{line:11,ewo:'271709.0',month:'Oct-26',total:900},{line:11,ewo:'271709',month:'Sep-26',total:10}],
 SAH_DATA:[{line:12,ewo:'271800',month:'Oct-26',color:'Fallback'}],
 SEWING_IO_DATA:[{line_no:11,ewo:'271709',color:'Rapid Red',input:0,wip:150},{line_no:11,ewo:'271738.0',color:'Off White',input:0,wip:800},{line_no:12,ewo:'271709',color:'Green',input:10,wip:900},{line_no:11,ewo:'271709',color:'Blue',input:0,wip:0}],
 FABRIC_CUTTING_DATA:[{ewo:'271709.00',color_name:'Rapid Red',total_cut_qty:60,cutable_qty:20,status:'Running',cutting_difficulties:'A'},{ewo:'271709',color_name:'Rapid Red',total_cut_qty:50,cutable_qty:30,status:'Running',style_embellishment_type:'Print'},{ewo:'271709',color_name:'Green',total_cut_qty:0,cutable_qty:0,status:'Other'}],
 DATE_WISE_PRODUCTION_DATA:[{line_no:11,ewo:'271709',output_date:'2026-10-04',total_qty:0},{line_no:12,ewo:'other',output_date:'2026-10-10',total_qty:0},{line_no:11,ewo:'271738',output_date:'2026-10-09',color:'Yellow',total_qty:1.1},{line_no:11,ewo:'271738.0',output_date:'2026-10-09',color:'Blue',total_qty:2.2}]
};
function assign(data){for(const c of [old.c,next.c])for(const [key,value]of Object.entries(data))c[key]=structuredClone(value);}
let cases=0;function parity(label,script=''){for(const x of [old,next])if(script)x.run(script);assert.deepEqual(next.render(),old.render(),label);cases++;}
assign(fixtures);parity('existing stacked-EWO fixture, PO/color sums, global zero-quantity cutoff, all-line cutting input, duplicate/missing record ids and SMV fallback');
const html=next.elements.get('s11-body').innerHTML;
for(const color of ['g-wip-covered','g-cutting-covered','g-cutable-covered','g-material-short'])assert.ok(html.includes(color),color);
const index=next.run('GANTT_INDEX_CACHE.value');parity('cache reuse');assert.equal(next.run('GANTT_INDEX_CACHE.value'),index);
parity('hidden-EWO search',"GANTT_EWO_SEARCH='271709'");
parity('earlier dates retained when narrowing',"GANTT_EWO_SEARCH='';S11_RANGE_FROM='2026-10-14';S11_RANGE_TO='2026-10-14'");
for(const filter of ['wip','cutting','cutable','short']){for(const x of [old,next])x.elements.get('gantt-condition-filter').value=filter;parity('priority '+filter,'S11_RANGE_PLAN_ID=null');}
for(const x of [old,next]){x.elements.get('gantt-condition-filter').value='';x.elements.get('gantt-color-condition').checked=false;}parity('color disabled');
parity('line filter',"GANTT_LINE_FILTER='12'");
for(const x of [old,next])x.elements.get('gantt-color-condition').checked=true;
// Same references/length remain a version until explicitly invalidated; uploads must invalidate.
next.c.SEWING_IO_DATA[0].wip=1;old.c.SEWING_IO_DATA[0].wip=1;next.c.invalidateGanttIndex();parity('explicit version invalidation',"GANTT_LINE_FILTER=''");
for(const x of [old,next])x.c.DAILY_PLAN.push(plan(99,'2026-10-12','271999',100,'Blue'));parity('append invalidates by length');
next.c.SITE_SESSION_GENERATION++;next.c.SITE_AUTH_USER={id:'B'};const before=next.run('GANTT_INDEX_CACHE.value');parity('owner generation rebuild');assert.notEqual(next.run('GANTT_INDEX_CACHE.value'),before);
// Deterministic generated fixtures vary source order, monthly matches, decimal accumulation and ties.
let seed=17;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
for(let trial=0;trial<20;trial++){
 const rows=[];for(let i=0;i<90;i++)rows.push(plan(i,`2026-10-${String(5+i%15).padStart(2,'0')}`,String(100+Math.floor(random()*8)),Math.round(random()*1000)/10,['Blue','White',''][i%3],i%2?11:12,i%4?20:0));
 const ewos=Array.from({length:8},(_,i)=>String(100+i));
 assign({DAILY_PLAN:rows,CLOCK_HOUR_DATA:ewos.map(ewo=>({line:11,ewo,month:'Oct-26',total:17})),SAH_DATA:[],SEWING_IO_DATA:ewos.map(ewo=>({line_no:11,ewo,input:8,wip:200})),FABRIC_CUTTING_DATA:ewos.map(ewo=>({ewo,color_name:'Blue',total_cut_qty:180,cutable_qty:230})),DATE_WISE_PRODUCTION_DATA:[{line_no:12,ewo:'other',output_date:'2026-10-07',total_qty:0}]});
 parity('generated identical data '+trial,"GANTT_LINE_FILTER='';GANTT_EWO_SEARCH='';S11_RANGE_PLAN_ID=null");
}
assign({DAILY_PLAN:[plan(1,'2026-10-12','A|B',20,'X'),plan(2,'2026-10-12','A',10,'B|X')],FABRIC_CUTTING_DATA:[{ewo:'A|B',color_name:'X',status:'First'},{ewo:'A',color_name:'B|X',status:'Second'}]});parity('literal separator in EWO/color cannot change exact-match comments','S11_RANGE_PLAN_ID=null');
// Timings are a synthetic VM workload, not live browser or network measurements.
const large=Array.from({length:2500},(_,i)=>plan(i,`2026-10-${String(1+i%28).padStart(2,'0')}`,String(100+i%100),10+i%9,'Blue',i%2?11:12));
assign({DAILY_PLAN:large});for(const x of [old,next])x.run("S11_RANGE_PLAN_ID=null");
const measure=x=>{const t=performance.now();x.render();return performance.now()-t;};
const coldOld=measure(old),coldNew=measure(next),warmOld=measure(old),warmNew=measure(next);
assert.deepEqual(next.render(),old.render(),'large fixture parity');
console.log('PASS Gantt old/new complete DOM+payload parity:',cases+1,'cases; cache identity, invalidation and owner guards');
console.log('SYNTHETIC Gantt VM ms',JSON.stringify({coldOld,coldNew,warmOld,warmNew,build:next.marks.filter(t=>t.name==='gantt.build').at(-1)?.durationMs}));
