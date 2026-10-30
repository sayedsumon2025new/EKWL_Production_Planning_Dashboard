const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
// Optional pre-change HTML enables a full result-parity comparison.
const old=process.env.DASHBOARD_BASELINE?fs.readFileSync(process.env.DASHBOARD_BASELINE,'utf8'):null;
const html=require('./dashboard-source.js').readDashboardHTML();
function fn(s,name){const start=s.search(new RegExp('^(?:async )?function '+name+'\\(','m'));assert.ok(start>=0,name);return s.slice(start,s.indexOf('\n}',start)+2);}
function fixture(){
  const tables={abp_target:[{parameter_name:'ABP_MATRIX_2026_27',config:{metrics:[['Efficiency','65%']]}}],plan_uploads:[{id:1,status:'complete',uploaded_at:'2026-09-23',planning_month:'2026-09-01'}],plan_records:[],plan_daily:[],fabric_cutting_info:[],sewing_input_output:[],date_wise_production:[]};
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
    const q={select(c){columns=c;return q;},eq(k,v){filters.push(r=>String(r[k])===String(v));return q;},in(k,vs){filters.push(r=>vs.includes(r[k]));return q;},order(k,o={}){orders.push([k,o.ascending!==false]);return q;},range(a,b){return run(a,b);},maybeSingle(){return run(0,0).then(r=>({...r,data:r.data?.[0]||null}));},then(a,b){return run(0,Infinity).then(a,b);}};
    async function run(from,to){
      calls.push({table,from,to});active++;maxActive=Math.max(maxActive,active);
      await new Promise(r=>setTimeout(r,options.delay||1));active--;
      if(options.fail===table&&from>=1000)return {data:null,error:new Error('Page failed')};
      let rows=tables[table].filter(r=>filters.every(f=>f(r)));
      rows.sort((a,b)=>{for(const [key,asc] of orders){if(a[key]<b[key])return asc?-1:1;if(a[key]>b[key])return asc?1:-1;}return 0;});
      rows=rows.slice(from,to===Infinity?undefined:to+1);
      return {data:rows.map(r=>columns==='*'?{...r}:Object.fromEntries(columns.split(',').map(k=>[k,r[k]]))),error:null};
    }
    return q;
  }
  const el={value:'1',classList:{remove(){}}};
  const c={console:{error(){},warn(){}},setTimeout,SB:{from:query},document:{getElementById(){return el;}},DATA:[],DAILY_PLAN:[],SAH_DATA:[],SAH_DAILY:[],CLOCK_HOUR_DATA:[],CLOCK_HOUR_DAILY:[],BUYER_PLAN_DATA:[],MONTHS:[],FABRIC_CUTTING_DATA:[],SEWING_IO_DATA:[],DATE_WISE_PRODUCTION_DATA:[],PLAN_UPLOAD_CATALOG:[],ACTIVE_PLAN_UPLOAD:null,PLAN_VERSION_CACHE:new Map(),CURRENT_SLIDE:0,SUPABASE_LOAD_TOKEN:0,PLAN_FILTER_TOKEN:0,N:v=>Number.isFinite(Number(v))?Number(v):0,isChassisMasterLine:v=>Number(v)>=1&&Number(v)<=48&&Number(v)!==46,monthFromISO:v=>v?'Sep-26':'',monthTime:()=>1,lineNumber:v=>Number(String(v??'').match(/\d+/)?.[0]||0),dashboardStyle:v=>v||'Other',rebuildPlanningFilters(){},refreshPermittedSlides(){},canAccessSlide:()=>true,goSlide(){},renderAll(){if(source.includes('shared-report-loader.js'))c.finishHomeFirstDataTiming();},saveFastBootCache(){},saveDashboardCache:async()=>{},setStatus:(...a)=>events.push(a),setLoadProgress(){},setLoadChip(){},setSupabaseLiveBadge:(...a)=>events.push(a),activePlanningLabel:()=>'',renderSlide(){}};
  c.console={error:(...a)=>{if(!options.fail)console.error(...a);},warn(){}};
  c.resetLoadUI=()=>{};
  Object.assign(c,{EFF15_METRIC_DAILY:[],EFF15_METRIC_UPLOAD_ID:null,SITE_SESSION_GENERATION:0,SITE_AUTH_USER:{id:'test-admin'}});
  vm.createContext(c);
  c.PLANNING_CACHE_VALIDATION=null;c.getChassisMasterLines=()=>new Set([1,2,3]);
  const names=['planningSnapshotVersion','canReusePlanningSnapshot','capturePlanningState','restorePlanningState','fetchPlanningSnapshot','loadFromSupabase'];
  if(source.includes('async function sbPaged('))names.unshift('sbPaged');else names.unshift('sbAll');
  vm.runInContext(fs.readFileSync(__dirname+'/../frontend-runtime.js','utf8'),c);
  vm.runInContext(fs.readFileSync(__dirname+'/../shared-report-loader.js','utf8'),c);
  for(const name of names)vm.runInContext(fn(source,name),c);
  return {c,calls,events,tables,maxActive:()=>maxActive};
}
function state(c){return JSON.parse(JSON.stringify({planning:c.capturePlanningState(),fabric:c.FABRIC_CUTTING_DATA,sewing:c.SEWING_IO_DATA,production:c.DATE_WISE_PRODUCTION_DATA}));}
(async()=>{
  let scripts=0;
  for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(m[1].trim()){new vm.Script(m[1]);scripts++;}}
  console.log('PASS JavaScript syntax:',scripts,'application scripts');
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
  assert.equal(after,Math.floor(next.tables.plan_daily.length/10000)+1);
  assert.ok(next.maxActive()>=2);
  assert.equal(next.calls.filter(q=>['fabric_cutting_info','sewing_input_output','date_wise_production'].includes(q.table)).length,0);
  console.log('PASS Home boot performs zero raw shared-report reads');
  // A page refresh restores a serialized, owner-scoped complete snapshot.
  const saved=JSON.parse(JSON.stringify(next.c.capturePlanningState()));
  const refresh=setup(html);
  refresh.c.restorePlanningState(saved);
  refresh.c.PLAN_VERSION_CACHE.set('1',saved);
  assert.equal(await refresh.c.loadFromSupabase(1,true,true),true);
  assert.equal(refresh.calls.length,1);
  assert.equal(refresh.calls[0].table,'plan_uploads');
  assert.deepEqual(state(refresh.c).planning,state(next.c).planning);
  assert.ok(refresh.events.some(e=>String(e[1]).includes('Planning unchanged')));
  console.log('PASS unchanged refresh: one metadata request, zero planning-detail requests, full result parity');
  const reuseCase=()=>{const x=setup(html);x.c.PLAN_VERSION_CACHE.set('1',JSON.parse(JSON.stringify(saved)));return x;};
  async function expectDetails(x,reuse=true){
    assert.equal(await x.c.loadFromSupabase(1,true,reuse),true);
    assert.ok(x.calls.some(q=>q.table==='plan_records'));
    assert.ok(x.calls.some(q=>q.table==='plan_daily'));
  }
  const changed=reuseCase();changed.tables.plan_uploads[0].row_count=999;await expectDetails(changed);
  const expired=reuseCase();expired.c.PLAN_VERSION_CACHE.get('1').cacheValidation.fetchedAt=Date.now()-16*60*1000;await expectDetails(expired);
  const differentOwner=reuseCase();differentOwner.c.SITE_AUTH_USER={id:'another-user'};await expectDetails(differentOwner);
  const lines=reuseCase();lines.c.getChassisMasterLines=()=>new Set([1,2]);await expectDetails(lines);
  const legacy=reuseCase();delete legacy.c.PLAN_VERSION_CACHE.get('1').cacheValidation;await expectDetails(legacy);
  const corrupt=reuseCase();delete corrupt.c.PLAN_VERSION_CACHE.get('1').EFF15_METRIC_DAILY;await expectDetails(corrupt);
  await expectDetails(reuseCase(),false); // Explicit reload remains a full fetch.
  const newPlan=reuseCase();
  newPlan.tables.plan_uploads.push({...newPlan.tables.plan_uploads[0],id:2});
  newPlan.tables.plan_records.push(...newPlan.tables.plan_records.map(r=>({...r,upload_id:2})));
  newPlan.tables.plan_daily.push(...newPlan.tables.plan_daily.map(r=>({...r,upload_id:2})));
  assert.equal(await newPlan.c.loadFromSupabase(2,true,true),true);
  assert.equal(newPlan.c.EFF15_METRIC_UPLOAD_ID,'2');
  assert.ok(newPlan.calls.some(q=>q.table==='plan_daily'));
  const revoked=reuseCase();const pendingRefresh=revoked.c.loadFromSupabase(1,true,true);
  revoked.c.SITE_SESSION_GENERATION++;revoked.c.SITE_AUTH_USER=null;
  assert.equal(await pendingRefresh,false);
  assert.equal(revoked.c.DATA.length,0);
  console.log('PASS new/changed uploads, expiry, owner/line changes, legacy/corrupt caches and explicit reload fetch fresh data; logout blocks publication');

  const homeRequests=next.calls.length;
  await next.c.ensureSharedReports(next.c.sharedReportsForSlide(7));
  assert.ok(next.maxActive()>=3);
  console.log('PASS selected-plan records, daily linkage, and one daily-data download');
  if(old){
    const baseline=setup(old);await baseline.c.loadFromSupabase(1,false);
    const baselineState={planning:state(baseline.c).planning},newState={planning:state(next.c).planning};
    delete baselineState.planning.cacheValidation;delete newState.planning.cacheValidation;
    assert.deepEqual(newState,baselineState);
    const before=baseline.calls.filter(c=>c.table==='plan_daily').length;
    assert.ok(after<before);

    console.log('PASS full baseline parity; Home data requests:',baseline.calls.length,'->',homeRequests,'; shared dependencies on first Gantt open:',next.calls.length-homeRequests);
  }
  console.log('PASS independent datasets overlap; maximum concurrent requests:',next.maxActive());
  for(const count of [0,1000,1001,2000]){
    const x=setup(html);x.tables.fabric_cutting_info=Array.from({length:count},(_,i)=>({id:i+1}));
    const rows=await x.c.sbPaged(()=>x.c.SB.from('fabric_cutting_info').select('id').order('id'));
    assert.equal(rows.length,count);assert.equal(new Set(rows.map(r=>r.id)).size,count);
  }
  console.log('PASS pagination: empty, exact page boundaries, and trailing page');
  for(const count of [0,10000,10001,30000,90537]){
    const x=setup(html),progress=[];
    x.tables.plan_daily=Array.from({length:count},(_,i)=>({record_id:i+1,plan_date:'2026-11-01',value:String(i)}));
    const rows=await x.c.sbPaged(()=>x.c.SB.from('plan_daily').select('record_id,plan_date,value'),{size:10000,onPage:n=>progress.push(n)});
    assert.equal(rows.length,count);assert.deepEqual(Array.from(rows,r=>Number(r.value)),Array.from({length:count},(_,i)=>i));
    assert.equal(x.calls.length,Math.floor(count/10000)+1);assert.equal(progress.at(-1),count);
  }
  const dailyFailure=setup(html,{fail:'plan_daily'});
  await assert.rejects(dailyFailure.c.fetchPlanningSnapshot({id:1}),/Page failed/);
  assert.equal(dailyFailure.c.DATA.length,0,'partial daily download must not publish');
  console.log('PASS large plan pages preserve all rows/order/values; 90,537 values use 10 requests instead of 91; failure blocks partial publication');

  const failed=setup(html,{fail:'sewing_input_output'});
  failed.c.SEWING_IO_DATA=[{ewo:'previous',input:99}];
  assert.equal(await failed.c.loadFromSupabase(1,true),true);
  await assert.rejects(failed.c.ensureSharedReports(['sewing']),/Page failed/);
  assert.equal(failed.c.SEWING_IO_DATA[0].ewo,'previous');
  assert.equal(failed.c.sharedReportsReady(['sewing']),false);
  failed.tables.sewing_input_output=[];
  await failed.c.ensureSharedReports(['sewing']);
  assert.equal(failed.c.SEWING_IO_DATA.length,0);
  assert.equal(failed.c.sharedReportsReady(['sewing']),true);
  const emptyRequests=failed.calls.length;
  await failed.c.ensureSharedReports(['sewing']);assert.equal(failed.calls.length,emptyRequests);
  console.log('PASS failed page preserves previous complete report; retry and empty-result cache');
  const fallback=setup(html,{fail:'sewing_input_output'});
  fallback.c.SEWING_IO_DATA=[{ewo:'cached',input:99}];
  fallback.c.registerSharedReportCache(undefined,{sewing:fallback.c.SEWING_IO_DATA});
  await fallback.c.ensureSharedReports(['sewing']);
  assert.equal(fallback.c.SEWING_IO_DATA[0].ewo,'cached');assert.equal(fallback.c.sharedReportsReady(['sewing']),true);
  fallback.c.invalidateSharedReports(['sewing']);
  await assert.rejects(fallback.c.ensureSharedReports(['sewing']),/Page failed/);
  const incomplete=setup(html,{fail:'sewing_input_output'});
  incomplete.c.registerSharedReportCache({sewing:false},{sewing:[]});
  await assert.rejects(incomplete.c.ensureSharedReports(['sewing']),/Page failed/);
  console.log('PASS validated persisted cache survives failed live read; invalidation removes stale fallback; unloaded arrays are not valid caches');


  const concurrent=setup(html);
  await Promise.all([concurrent.c.ensureSharedReports(['fabric','sewing']),concurrent.c.ensureSharedReports(['fabric','sewing','production'])]);
  for(const table of ['fabric_cutting_info','sewing_input_output','date_wise_production'])assert.equal(concurrent.calls.filter(q=>q.table===table).length,2);
  const cachedCalls=concurrent.calls.length;
  await concurrent.c.ensureSharedReports(['fabric','sewing','production']);assert.equal(concurrent.calls.length,cachedCalls);
  concurrent.tables.fabric_cutting_info=[{id:'new'}];
  concurrent.c.invalidateSharedReports(['fabric']);
  await concurrent.c.ensureSharedReports(['fabric','sewing','production']);
  assert.equal(concurrent.c.FABRIC_CUTTING_DATA[0].id,'new');
  assert.equal(concurrent.calls.length,cachedCalls+1);
  console.log('PASS simultaneous openers share promises; successful reports cache; invalidation refreshes only requested sources');

  const fabric=setup(html);fabric.c.CURRENT_SLIDE=11;
  await fabric.c.ensureSharedReports(fabric.c.sharedReportsForSlide(11));
  assert.equal(fabric.calls.some(q=>q.table==='date_wise_production'),false);
  for(const slide of [0,1,3,5,6,8,10,12,13,14,15,16,17,18,19,20,21])assert.equal(fabric.c.sharedReportsForSlide(slide).length,0);
  console.log('PASS Fabrics reads only fabric/sewing; SQL readiness and other slides need no raw shared reports');

  const switching=setup(html);await switching.c.ensureSharedReports(['fabric']);
  const reportCalls=switching.calls.filter(q=>q.table==='fabric_cutting_info').length;
  assert.equal(await switching.c.loadFromSupabase(1,true),true);
  assert.equal(switching.calls.filter(q=>q.table==='fabric_cutting_info').length,reportCalls);
  console.log('PASS planning switch keeps complete shared-report cache');

  const superseded=setup(html);superseded.c.FABRIC_CUTTING_DATA=[{id:'previous'}];
  const obsolete=superseded.c.loadSharedReport('fabric');
  superseded.c.invalidateSharedReports(['fabric']);superseded.tables.fabric_cutting_info=[{id:'current'}];
  const replacement=superseded.c.loadSharedReport('fabric');
  await assert.rejects(obsolete,/superseded/);await replacement;
  assert.equal(superseded.c.FABRIC_CUTTING_DATA[0].id,'current');
  assert.equal(superseded.c.sharedReportsReady(['fabric']),true);
  const logout=setup(html);const pendingReport=logout.c.loadSharedReport('fabric');
  logout.c.SITE_SESSION_GENERATION++;logout.c.SITE_AUTH_USER=null;logout.c.invalidateSharedReports();
  await assert.rejects(pendingReport,/superseded/);assert.equal(logout.c.FABRIC_CUTTING_DATA.length,0);
  console.log('PASS invalidation/logout prevent old requests from publishing or evicting newer data');

  const view=setup(html);view.c.CURRENT_SLIDE=7;let renderCount=0;
  view.c.renderSlide=()=>{assert.equal(view.c.sharedReportsReady(['fabric','sewing','production']),true);renderCount++;};
  assert.equal(view.c.prepareSharedReportView(7),false);assert.equal(view.c.prepareSharedReportView(7),false);
  await view.c.ensureSharedReports(['fabric','sewing','production']);
  await new Promise(r=>setTimeout(r,0));assert.equal(renderCount,1);
  assert.equal(view.c.prepareSharedReportView(7),true);
  const hidden=setup(html);hidden.c.CURRENT_SLIDE=7;
  hidden.c.renderSlide=()=>{throw Error('Hidden slide rendered');};hidden.c.prepareSharedReportView(7);hidden.c.CURRENT_SLIDE=0;
  await hidden.c.ensureSharedReports(['fabric','sewing','production']);await new Promise(r=>setTimeout(r,0));
  const denied=setup(html);denied.c.CURRENT_SLIDE=7;denied.c.canAccessSlide=()=>false;
  assert.equal(denied.c.prepareSharedReportView(7),false);assert.equal(denied.calls.length,0);
  console.log('PASS render waits for all dependencies once; hidden/forbidden views do not render/fetch');

  // Actual boot/control-flow and ABP readers, with offline settings and a delayed master-line configuration.
  function bootSetup(source){
    const x=setup(source,{delay:25}),c=x.c;let masterReady=false;
    c.loadChassisPriorityFromSQL=async()=>{await new Promise(r=>setTimeout(r,3));masterReady=true;};
    c.isChassisMasterLine=v=>{assert.equal(masterReady,true,'Master configuration must precede filtering');return Number(v)>=1&&Number(v)<=48&&Number(v)!==46;};
    c.loadEfficiencyLadderFromSQL=async()=>{};c.loadS4StrengthsFromSQL=async()=>{};
    c.loadDashboardMasterSettingsFromSQL=async()=>{};c.restoreFastBootCache=()=>false;c.restoreDashboardFromCache=async()=>false;
    c.LIVE_ABP_TARGET_EFF=60;c.ABP_TARGET_CACHE=null;c.DEFAULT_ABP_TARGET={metrics:[]};c.getABPTarget=()=>c.ABP_TARGET_CACHE||c.DEFAULT_ABP_TARGET;c.parsePercentNumber=v=>Number(String(v).replace('%',''));
    c.performance=require('node:perf_hooks').performance;c.URLSearchParams=URLSearchParams;
    c.window={location:{search:'?ekwlPerf=1'}};
    for(const name of ['loadABPTargetFromSQL','loadABPTargetEfficiencyLive','loadCentralAdminSettingsBeforeData','bootLiveSupabaseData'])vm.runInContext(fn(source,name),c);
    return x;
  }
  const boot=bootSetup(html);await boot.c.bootLiveSupabaseData();
  assert.equal(boot.calls.filter(q=>q.table==='abp_target').length,1);
  assert.equal(boot.c.LIVE_ABP_TARGET_EFF,65);assert.equal(boot.c.ABP_TARGET_CACHE.metrics[0][1],'65%');
  assert.equal(boot.calls.some(q=>['fabric_cutting_info','sewing_input_output','date_wise_production'].includes(q.table)),false);
  assert.ok(boot.c.window.EKWL_TIMINGS.some(t=>t.name==='boot'));
  assert.ok(boot.c.window.EKWL_TIMINGS.some(t=>t.name==='home.first-data'&&t.status==='rendered'));
  await boot.c.ensureSharedReports(['fabric','sewing','production']);
  for(const name of ['fabric','sewing','production'])assert.ok(boot.c.window.EKWL_TIMINGS.some(t=>t.name==='report.'+name&&t.requests===2&&t.rows===1001));
  console.log('PASS shared ABP promise, master-before-filter ordering, and opt-in boot/Home/report measures');
  console.log('OFFLINE DEV TIMINGS (synthetic 25 ms/page, not live):',JSON.stringify(boot.c.window.EKWL_TIMINGS));
  if(old){
    const baseline=bootSetup(old);
    const finish=baseline.c.startDashboardTiming('baseline.boot');
    vm.runInContext("HOME_FIRST_DATA_TIMING=startDashboardTiming('baseline.home.first-data')",baseline.c);
    const previousRender=baseline.c.renderAll;baseline.c.renderAll=()=>{previousRender();baseline.c.finishHomeFirstDataTiming();};
    await baseline.c.bootLiveSupabaseData();finish();
    assert.ok(baseline.calls.filter(q=>q.table==='abp_target').length>=1);
    assert.equal(baseline.c.LIVE_ABP_TARGET_EFF,boot.c.LIVE_ABP_TARGET_EFF);
    const before=state(baseline.c).planning,after=state(boot.c).planning;
    delete before.cacheValidation;delete after.cacheValidation;assert.deepEqual(after,before);
    console.log('OFFLINE BASELINE TIMINGS:',JSON.stringify(baseline.c.window.EKWL_TIMINGS));
  }
  const stale=setup(html);const pending=stale.c.loadFromSupabase(1,false);stale.c.SUPABASE_LOAD_TOKEN++;
  assert.equal(await pending,false);assert.equal(stale.c.DATA.length,0);
  console.log('PASS superseded load cannot publish data');
})().catch(e=>{console.error(e);process.exitCode=1;});
