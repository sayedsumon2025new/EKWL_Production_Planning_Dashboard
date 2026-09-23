const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
// Optional pre-change HTML enables a full result-parity comparison.
const old=process.env.DASHBOARD_BASELINE?fs.readFileSync(process.env.DASHBOARD_BASELINE,'utf8'):null;
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
function fn(s,name){const start=s.search(new RegExp('^(?:async )?function '+name+'\\(','m'));assert.ok(start>=0,name);return s.slice(start,s.indexOf('\n}',start)+2);}
function fixture(){
  const tables={plan_uploads:[{id:1,status:'complete',uploaded_at:'2026-09-23',planning_month:'2026-09-01'}],plan_records:[],plan_daily:[],fabric_cutting_info:[],sewing_input_output:[],date_wise_production:[]};
  for(let i=1;i<=1005;i++)for(const [j,criteria] of ['Plan/Day','SAH/Day','Clock Hour/Day','Effi/Day'].entries()){
    const id=(i-1)*4+j+1;
    tables.plan_records.push({id,upload_id:1,source_row:id,line_no:i%7===0?50:(i%45)+1,buyer:'Buyer',product_type:'T-Shirt',ewo:i+'.0',po:'PO',col:'Blue',order_qty:100,total:300,psd:'2026-09-01',pfd:'2026-09-03',manpower:20,smv:4,criteria,is_summary_row:i%11===0});
    for(let d=1;d<=3;d++)tables.plan_daily.push({record_id:id,upload_id:1,plan_date:'2026-09-0'+d,value:10+j});
  }
  for(let i=1;i<=1001;i++){
    tables.fabric_cutting_info.push({id:i,ewo:String(i),color_name:'Blue'});
    tables.sewing_input_output.push({id:i,ewo:String(i),color:'Blue',line:'Line 1',total_input_qty:100,total_output_qty:70,total_wip_qty:30,total_reject_qty:0});
    tables.date_wise_production.push({id:i,ewo:String(i),line:'Line 1',output_date:'2026-09-01',total_qty:70});
  }
  return tables;
}
function setup(source,options={}){
  const tables=fixture(),calls=[],events=[];let active=0,maxActive=0;
  function query(table){
    const filters=[],orders=[];let columns='*';
    const q={select(c){columns=c;return q;},eq(k,v){filters.push(r=>String(r[k])===String(v));return q;},in(k,vs){filters.push(r=>vs.includes(r[k]));return q;},order(k,o={}){orders.push([k,o.ascending!==false]);return q;},range(a,b){return run(a,b);},then(a,b){return run(0,Infinity).then(a,b);}};
    async function run(from,to){
      calls.push({table,from,to});active++;maxActive=Math.max(maxActive,active);
      await new Promise(r=>setTimeout(r,1));active--;
      if(options.fail===table&&from>=1000)return {data:null,error:new Error('Page failed')};
      let rows=tables[table].filter(r=>filters.every(f=>f(r)));
      rows.sort((a,b)=>{for(const [key,asc] of orders){if(a[key]<b[key])return asc?-1:1;if(a[key]>b[key])return asc?1:-1;}return 0;});
      rows=rows.slice(from,to===Infinity?undefined:to+1);
      return {data:rows.map(r=>columns==='*'?{...r}:Object.fromEntries(columns.split(',').map(k=>[k,r[k]]))),error:null};
    }
    return q;
  }
  const el={value:'1',classList:{remove(){}}};
  const c={console:{error(){},warn(){}},setTimeout,SB:{from:query},document:{getElementById(){return el;}},DATA:[],DAILY_PLAN:[],SAH_DATA:[],SAH_DAILY:[],CLOCK_HOUR_DATA:[],CLOCK_HOUR_DAILY:[],BUYER_PLAN_DATA:[],MONTHS:[],FABRIC_CUTTING_DATA:[],SEWING_IO_DATA:[],DATE_WISE_PRODUCTION_DATA:[],PLAN_UPLOAD_CATALOG:[],ACTIVE_PLAN_UPLOAD:null,PLAN_VERSION_CACHE:new Map(),CURRENT_SLIDE:0,SUPABASE_LOAD_TOKEN:0,PLAN_FILTER_TOKEN:0,N:v=>Number.isFinite(Number(v))?Number(v):0,isChassisMasterLine:v=>Number(v)>=1&&Number(v)<=48&&Number(v)!==46,monthFromISO:v=>v?'Sep-26':'',monthTime:()=>1,lineNumber:v=>Number(String(v??'').match(/\d+/)?.[0]||0),dashboardStyle:v=>v||'Other',rebuildPlanningFilters(){},refreshPermittedSlides(){},canAccessSlide:()=>true,goSlide(){},renderAll(){},saveFastBootCache(){},saveDashboardCache:async()=>{},setStatus:(...a)=>events.push(a),setLoadProgress(){},setLoadChip(){},setSupabaseLiveBadge:(...a)=>events.push(a),activePlanningLabel:()=>'',renderSlide(){}};
  c.console={error:(...a)=>{if(!options.fail)console.error(...a);},warn(){}};
  c.resetLoadUI=()=>{};
  vm.createContext(c);
  const names=['capturePlanningState','restorePlanningState','fetchPlanningSnapshot','loadFromSupabase'];
  if(source.includes('async function sbPaged('))names.unshift('sbPaged');else names.unshift('sbAll');
  for(const name of names)vm.runInContext(fn(source,name),c);
  return {c,calls,events,tables,maxActive:()=>maxActive};
}
function state(c){return JSON.parse(JSON.stringify({planning:c.capturePlanningState(),fabric:c.FABRIC_CUTTING_DATA,sewing:c.SEWING_IO_DATA,production:c.DATE_WISE_PRODUCTION_DATA}));}
(async()=>{
  let scripts=0;
  for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(m[1].trim()){new vm.Script(m[1]);scripts++;}}
  console.log('PASS JavaScript syntax:',scripts,'inline scripts');
  const next=setup(html);
  assert.equal(await next.c.loadFromSupabase(1,false),true);
  const expectedRecords=next.tables.plan_records.filter(r=>!r.is_summary_row&&next.c.isChassisMasterLine(r.line_no));
  for(const [field,criteria] of [['DATA','Plan/Day'],['SAH_DATA','SAH/Day'],['CLOCK_HOUR_DATA','Clock Hour/Day']]){
    const records=expectedRecords.filter(r=>r.criteria===criteria);
    assert.deepEqual(Array.from(next.c[field],r=>r.record_id),records.map(r=>r.id));
  }
  assert.equal(next.c.SAH_DAILY.length,next.c.SAH_DATA.length*3);
  assert.equal(next.c.CLOCK_HOUR_DAILY.length,next.c.CLOCK_HOUR_DATA.length*3);
  assert.equal(next.c.DAILY_PLAN.length,next.c.DATA.length*3);
  const after=next.calls.filter(c=>c.table==='plan_daily').length;
  assert.equal(after,Math.floor(next.tables.plan_daily.length/1000)+1);
  assert.ok(next.maxActive()>=3);
  console.log('PASS selected-plan records, daily linkage, and one daily-data download');
  if(old){
    const baseline=setup(old);await baseline.c.loadFromSupabase(1,false);
    assert.deepEqual(state(next.c),state(baseline.c));
    const before=baseline.calls.filter(c=>c.table==='plan_daily').length;
    assert.equal(before,after*2);
    console.log('PASS full baseline parity; daily requests:',before,'->',after,'; total requests:',baseline.calls.length,'->',next.calls.length);
  }
  console.log('PASS independent datasets overlap; maximum concurrent requests:',next.maxActive());
  for(const count of [0,1000,1001,2000]){
    const x=setup(html);x.tables.fabric_cutting_info=Array.from({length:count},(_,i)=>({id:i+1}));
    const rows=await x.c.sbPaged(()=>x.c.SB.from('fabric_cutting_info').select('id').order('id'));
    assert.equal(rows.length,count);assert.equal(new Set(rows.map(r=>r.id)).size,count);
  }
  console.log('PASS pagination: empty, exact page boundaries, and trailing page');
  const failed=setup(html,{fail:'sewing_input_output'});failed.c.FABRIC_CUTTING_DATA=[{id:'previous'}];
  assert.equal(await failed.c.loadFromSupabase(1,true),false);
  assert.equal(failed.c.FABRIC_CUTTING_DATA[0].id,'previous');
  assert.ok(failed.events.some(e=>e[0]==='err'));
  console.log('PASS failure preserves complete shared reports and returns failure');
  const cached=setup(html);cached.c.FABRIC_CUTTING_DATA=[{id:'stale'}];
  assert.equal(await cached.c.loadFromSupabase(1,true),true);assert.equal(cached.c.FABRIC_CUTTING_DATA.length,1001);
  console.log('PASS reload refreshes shared reports even with cached data');
  const switching=setup(html);switching.c.FABRIC_CUTTING_DATA=[{id:'existing'}];
  assert.equal(await switching.c.loadFromSupabase(1,true,true),true);
  assert.equal(switching.calls.filter(c=>['fabric_cutting_info','sewing_input_output','date_wise_production'].includes(c.table)).length,0);
  console.log('PASS explicit planning switch reuses shared reports');
  const stale=setup(html);const pending=stale.c.loadFromSupabase(1,false);stale.c.SUPABASE_LOAD_TOKEN++;
  assert.equal(await pending,false);assert.equal(stale.c.DATA.length,0);
  console.log('PASS superseded load cannot publish data');
})().catch(e=>{console.error(e);process.exitCode=1;});
