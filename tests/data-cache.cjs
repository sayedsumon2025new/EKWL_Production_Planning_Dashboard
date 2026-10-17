const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const cacheSource=fs.readFileSync(__dirname+'/../data-cache.js','utf8');
const main=fs.readFileSync(__dirname+'/../dashboard-main.js','utf8');
const sourceFunction=name=>{const a=main.indexOf('async function '+name+'(');return main.slice(a,main.indexOf('\n}',a)+2);};
function setup(){
 let now=0;const calls=[],tables={},timings=[];
 const c={console,SITE_AUTH_USER:{id:'A'},SITE_SESSION_GENERATION:1,CURRENT_SLIDE:0,Date:class extends Date{static now(){return now;}},URLSearchParams,fetch:async(...args)=>args,window:{EKWL_PERF_ENABLED:true,location:{search:''}},startDashboardTiming:name=>data=>timings.push({name,...data}),SB:{from(table){let columns='*';const filters=[];const q={select(x){columns=x;return q;},eq(k,v){filters.push(r=>String(r[k])===String(v));return q;},in(k,vs){filters.push(r=>vs.includes(String(k==='row_data->>EWO'?r.row_data?.EWO:r[k])));return q;},order(){return q;},async range(from,to){calls.push({table,columns,from,to});await Promise.resolve();const rows=(tables[table]||[]).filter(r=>filters.every(f=>f(r)));return {data:rows.slice(from,to+1),error:null};}};return q;}}};
 vm.createContext(c);vm.runInContext(cacheSource,c);
 return {c,calls,tables,timings,run:s=>vm.runInContext(s,c),advance:n=>now+=n};
}
(async()=>{
 const x=setup(),c=x.c;
 for(const type of ['size','accessories','embellishment']){
  const a=c.loadActiveModuleRows(type),b=c.loadActiveModuleRows(type);assert.equal(a,b);assert.deepEqual(Array.from(await a),[]);await b;
  const n=x.calls.length;await c.loadActiveModuleRows(type);assert.equal(x.calls.length,n,'successful empty cached '+type);
  c.invalidateDataCache(['snapshot:'+type]);await c.loadActiveModuleRows(type);assert.equal(x.calls.length,n+1);
 }
 const all={upload_batch_id:7,EWO:'123',source_row_no:1,GmtColor:'Blue',OrderQty:123};
 x.tables.order_bank_latest_all=[all];
 const first=c.loadOrderBankSnapshot(),second=c.loadOrderBankSnapshot();assert.equal(first,second);await Promise.all([first,second]);
 let count=x.calls.filter(r=>r.table==='order_bank_latest_all').length;await c.loadOrderBankSnapshot();assert.equal(x.calls.filter(r=>r.table==='order_bank_latest_all').length,count);
 c.invalidateDataCache(['snapshot:orderbank']);x.tables.order_bank_latest_all=Array.from({length:1001},(_,i)=>({...all,source_row_no:i+1}));x.tables.order_bank_raw=x.tables.order_bank_latest_all;
 const pages=await c.loadOrderBankSnapshot();assert.equal(pages.length,1001);assert.deepEqual(x.calls.slice(-2).map(r=>r.table),['order_bank_latest_all','order_bank_raw']);
 // Concurrent forced opens also share the new read; no duplicate after an explicit invalidation.
 const forced=c.loadOrderBankSnapshot(true),forced2=c.loadOrderBankSnapshot(true);assert.equal(forced,forced2);await forced;
 let release;const pending=c.loadVersionedData('race',async()=>{await new Promise(r=>release=r);return ['old'];});await Promise.resolve();
 c.invalidateDataCache(['race']);const newer=c.loadVersionedData('race',async()=>['new']);release();await assert.rejects(pending,/superseded/);assert.deepEqual(Array.from(await newer),['new']);assert.equal(c.dataCacheEntry('race').value[0],'new');
 let fail=true;await assert.rejects(c.loadVersionedData('error',()=>{if(fail)throw Error('offline');}),/offline/);fail=false;await c.loadVersionedData('error',()=>[]);
 let finish;const loggedOut=c.loadVersionedData('logout',()=>new Promise(r=>finish=r));await Promise.resolve();c.SITE_SESSION_GENERATION++;c.SITE_AUTH_USER=null;finish([]);await assert.rejects(loggedOut,/superseded/);assert.equal(c.dataCacheEntry('snapshot:orderbank'),null);
 c.SITE_AUTH_USER={id:'B'};const before=x.calls.length;await c.loadActiveModuleRows('size');assert.equal(x.calls.length,before+1);
 console.log('PASS one snapshot promise including empty results; pinned Order Bank pagination; force/invalidation/error/logout/owner races');

 const e=setup();e.tables.embellishment_send_receive_rows=[{'EWO No':'123',Color:'Blue',Date:'12-Oct-26',is_active:true}];
 const em=e.c.loadEwoSource('embellishment'),em2=e.c.loadEwoSource('embellishment');assert.equal(em,em2);await Promise.all([em,em2]);assert.equal(e.calls.length,1);
 assert.equal((await e.c.loadEwoSource('embellishment',['123'])).length,1);assert.equal(e.calls.length,1);
 e.advance(59999);await e.c.loadEwoSource('embellishment');assert.equal(e.calls.length,1);e.advance(2);await e.c.loadEwoSource('embellishment');assert.equal(e.calls.length,2);
 e.c.invalidateEwoSources(['embellishment']);await e.c.loadEwoSource('embellishment');assert.equal(e.calls.length,3);
 e.tables.size_set_rows=[{row_data:{EWO:'123.0',Color:'Red'},is_active:true}];await e.c.loadActiveModuleRows('size');const n=e.calls.length;assert.equal((await e.c.loadEwoSource('size',['123'])).length,0);assert.equal((await e.c.loadEwoSource('size',['123.0'])).length,1);assert.equal(e.calls.length,n);
 e.c.invalidateEwoSources(['size']);await e.c.loadEwoSource('size');assert.equal(e.calls.length,n+1,'explicit source refresh bypasses same fresh module snapshot');
 e.c.beginDashboardSlideOpen(7);e.c.recordDataCacheHit('ewo:size:123');await e.c.dashboardTrackedFetch('fixture');assert.equal(e.c.window.EKWL_SLIDE_OPENS[0].requests,1);assert.equal(e.c.window.EKWL_SLIDE_OPENS[0].cacheHits,1);assert.ok(!JSON.stringify(e.timings).includes('123'));
 console.log('PASS shared EWO sources, superset reuse, exact EWO equality, 60-second TTL, explicit refresh, dev counters without source identifiers');

 const deps={plan:{planning:true,gantt:true,popup:true,execution:true,readiness:true,coverage:true},fabric:{reports:['fabric'],gantt:true,popup:true,readiness:true,coverage:true},sewing:{reports:['sewing'],gantt:true,popup:true,readiness:true,coverage:true},production:{reports:['production'],gantt:true,popup:true,coverage:true},orderbank:{snapshots:['orderbank'],sources:['orderbank'],popup:true,execution:true},floor:{settings:['floor']},size:{snapshots:['size'],sources:['size'],popup:true,readiness:true},accessories:{snapshots:['accessories'],sources:['accessories'],popup:true,readiness:true},embellishment:{snapshots:['embellishment'],sources:['embellishment'],popup:true,readiness:true,coverage:true}};
 for(const [type,dep] of Object.entries(deps)){
  const y=setup(),events=[];const q=y.c;
  Object.assign(q,{PLAN_VERSION_CACHE:{clear:()=>events.push('plan')},invalidateSharedReports:n=>events.push('reports:'+n.join(',')),invalidateTinySettings:n=>events.push('settings:'+n.join(',')),invalidateGanttIndex:()=>events.push('gantt'),resetGanttHoverCache:n=>{assert.equal(n.length,0);events.push('popup');},invalidateOrderExecutionData:()=>events.push('execution'),ORDER_BANK_LOAD_TOKEN:1,SS_LOAD_TOKEN:1,AC_LOAD_TOKEN:1,EM_LOAD_TOKEN:1,RD_LOAD_TOKEN:1,RD_ROWS:[1],RD_UPLOAD_ID:'A',RD_BUSY:true,RD_ERROR:'',RC_TOKEN:1,RC_ROWS:[1],RC_BUSY:true,RC_ERROR:'',RC_CUTOFF:'date',S12_EM_LOAD_TOKEN:1,S12_EM_ROWS:[1],S12_EM_LOADING:true,S12_EM_ERROR:''});
  for(const key of ['orderbank','size','accessories','embellishment']){await q.loadVersionedData('snapshot:'+key,()=>[key]);await q.loadVersionedData('ewo:'+key+':all',()=>[key]);}
  assert.deepEqual(JSON.parse(JSON.stringify(q.invalidateUploadDependencies(type))),dep);
  assert.equal(events.includes('plan'),!!dep.planning);assert.equal(events.includes('gantt'),!!dep.gantt);assert.equal(events.includes('popup'),!!dep.popup);assert.equal(events.includes('execution'),!!dep.execution);
  assert.equal(q.RD_LOAD_TOKEN,dep.readiness?2:1);assert.equal(q.RC_TOKEN,dep.coverage?2:1);
  for(const key of ['orderbank','size','accessories','embellishment']){
   assert.equal(!!q.dataCacheEntry('snapshot:'+key),!dep.snapshots?.includes(key));assert.equal(!!q.dataCacheEntry('ewo:'+key+':all'),!dep.sources?.includes(key));
  }
  let planningReads=0;Object.assign(q,{setSupabaseLiveBadge(){},clearDashboardCache:async()=>{},loadFromSupabase:async()=>{planningReads++;return true;},loadFloorAllocationAdmin:async()=>{},canAccessSlide:()=>true,sharedReportsForSlide:()=>[],ensureSharedReports:async()=>{},saveFastBootCache(){},saveDashboardCache:async()=>{}});
  // Test the real upload-refresh function: no unrelated planning load, even on Home.
  vm.runInContext(sourceFunction('refreshDashboardAfterSuccessfulUpload'),q);await q.refreshDashboardAfterSuccessfulUpload(type);assert.equal(planningReads,type==='plan'?1:0);
  let readinessReads=0,coverageReads=0;Object.assign(q,{CURRENT_SLIDE:21,loadEWOReadinessBoard:async include=>{readinessReads++;if(include)coverageReads++;},loadReadyInputCoverage:async()=>coverageReads++});
  await q.refreshDashboardAfterSuccessfulUpload(type);assert.equal(readinessReads,dep.readiness?1:0);assert.equal(coverageReads,dep.coverage?1:0);
 }
 console.log('PASS exact invalidation matrix for all 9 upload types; only planning upload reloads planning');
})().catch(error=>{console.error(error);process.exitCode=1;});
