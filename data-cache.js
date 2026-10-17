/* Frontend data versions: scoped to the signed-in owner/session, never persisted. */
const VERSIONED_DATA_CACHE=new Map();
const DATA_CACHE_VERSIONS=new Map();
function dataCacheOwner(){return {userId:SITE_AUTH_USER?.id,generation:SITE_SESSION_GENERATION};}
function dataCacheEntry(key,ttl=Infinity){
  const entry=VERSIONED_DATA_CACHE.get(key),owner=dataCacheOwner();
  return entry&&entry.userId===owner.userId&&entry.generation===owner.generation&&(!entry.loaded||Date.now()-entry.at<ttl)?entry:null;
}
function recordDataCacheHit(key){
  if(typeof startDashboardTiming!=='function')return;
  if(dashboardPerfEnabled()&&window.EKWL_ACTIVE_SLIDE_OPEN)window.EKWL_ACTIVE_SLIDE_OPEN.cacheHits++;
  startDashboardTiming('cache.hit')({cache:/^(?:snapshot|ewo):/.test(key)?key.split(':').slice(0,2).join(':'):key.split(':')[0],slide:typeof CURRENT_SLIDE==='undefined'?null:CURRENT_SLIDE});
}
function invalidateDataCache(keys=[...VERSIONED_DATA_CACHE.keys()]){
  for(const key of keys){VERSIONED_DATA_CACHE.delete(key);DATA_CACHE_VERSIONS.set(key,(DATA_CACHE_VERSIONS.get(key)||0)+1);}
}
function loadVersionedData(key,build,{ttl=Infinity,force=false}={}){
  const saved=dataCacheEntry(key,ttl);
  // Concurrent explicit refreshes still share their entire in-flight operation.
  if(saved&&(!force||!saved.loaded)){recordDataCacheHit(key);return saved.promise;}
  if(force)invalidateDataCache([key]);
  const owner=dataCacheOwner();
  if(!owner.userId)return Promise.reject(Error('Sign in before loading data.'));
  const entry={...owner,loaded:false,at:Date.now(),version:DATA_CACHE_VERSIONS.get(key)||0,promise:null};
  VERSIONED_DATA_CACHE.set(key,entry);
  const current=()=>VERSIONED_DATA_CACHE.get(key)===entry&&dataCacheOwner().userId===owner.userId&&SITE_SESSION_GENERATION===owner.generation;
  entry.promise=Promise.resolve().then(()=>build(current)).then(value=>{
    if(!current())throw Error('Data load superseded.');entry.loaded=true;entry.at=Date.now();entry.value=value;return value;
  }).catch(error=>{if(VERSIONED_DATA_CACHE.get(key)===entry)VERSIONED_DATA_CACHE.delete(key);throw error;});
  return entry.promise;
}
async function cachedPagedRows(build,current,size=1000){
  const rows=[];
  for(let from=0;;from+=size){
    const {data,error}=await build().range(from,from+size-1);
    if(error)throw error;if(!current())throw Error('Data load superseded.');
    rows.push(...(data||[]));if((data||[]).length<size)break;
  }
  return rows;
}
function loadActiveModuleRows(type,force=false){
  const table={size:'size_set_rows',accessories:'accessories_rows',embellishment:'embellishment_send_receive_rows'}[type];
  const columns=type==='embellishment'?'*':'source_row_no,row_data,file_name,uploaded_at';
  return loadVersionedData('snapshot:'+type,current=>cachedPagedRows(()=>SB.from(table).select(columns).eq('is_active',true).order('source_row_no',{ascending:true}),current),{force});
}
function loadOrderBankSnapshot(force=false){
  return loadVersionedData('snapshot:orderbank',async current=>{
    const all=[];let snapshotId=null;
    for(let from=0;;from+=1000){
      let query=SB.from(snapshotId===null?'order_bank_latest_all':'order_bank_raw').select('*');
      if(snapshotId!==null)query=query.eq('upload_batch_id',snapshotId);
      const {data,error}=await query.order('source_row_no',{ascending:true}).range(from,from+999);
      if(error)throw error;if(!current())throw Error('Order Bank read superseded.');
      const page=data||[];all.push(...page);
      if(snapshotId===null&&page.length)snapshotId=page[0].upload_batch_id;
      if(page.length<1000)break;
    }
    if(all.some(r=>r.upload_batch_id!==all[0].upload_batch_id))throw Error('Order Bank changed during loading. Refresh to load the complete latest snapshot.');
    return all;
  },{force});
}
const EWO_SOURCE_TTL=60000;
const EWO_SOURCE_SNAPSHOT_FENCES=new Map();
const EWO_EM_COLUMNS='"Date","EWO No","Color","Today Print Send Qty\n"," Today Print Receive Qty","Today EMB Send Qty","Today EMB Receive Qty"';
function invalidateEwoSources(types=['size','accessories','embellishment','orderbank']){
  // Explicit source refresh must not immediately reuse the same fresh module snapshot.
  for(const type of types){const entry=dataCacheEntry('snapshot:'+type);if(entry)EWO_SOURCE_SNAPSHOT_FENCES.set(type,{userId:entry.userId,generation:entry.generation,version:entry.version});else EWO_SOURCE_SNAPSHOT_FENCES.delete(type);}
  invalidateDataCache([...VERSIONED_DATA_CACHE.keys()].filter(key=>types.some(type=>key.startsWith('ewo:'+type+':'))));
}
function loadEwoSource(type,ids=null){
  // Preserve exact SQL text equality: different EWO spellings are not interchangeable.
  const values=ids===null?null:[...new Set(ids.map(String))].sort(),scope=values===null?'all':JSON.stringify(values);
  let snapshot=dataCacheEntry('snapshot:'+type,EWO_SOURCE_TTL);
  const fence=EWO_SOURCE_SNAPSHOT_FENCES.get(type);
  if(snapshot&&fence&&snapshot.userId===fence.userId&&snapshot.generation===fence.generation&&snapshot.version===fence.version)snapshot=null;
  const full=dataCacheEntry('ewo:'+type+':all',EWO_SOURCE_TTL)||snapshot;
  const filter=rows=>values===null?rows:rows.filter(row=>{const value=type==='size'||type==='accessories'?row.row_data?.EWO:type==='embellishment'?row['EWO No']:row.EWO;return value!=null&&values.includes(String(value));});
  if(full){recordDataCacheHit('ewo:'+type);return values===null?full.promise:full.promise.then(filter);}
  const table={size:'size_set_rows',accessories:'accessories_rows',embellishment:'embellishment_send_receive_rows',orderbank:'order_bank_latest_all'}[type];
  const columns=type==='size'||type==='accessories'?'row_data':type==='embellishment'?EWO_EM_COLUMNS:'EWO,GmtColor,OrderQty';
  return loadVersionedData('ewo:'+type+':'+scope,current=>cachedPagedRows(()=>{
    let query=SB.from(table).select(columns);
    if(type!=='orderbank')query=query.eq('is_active',true).order('source_row_no',{ascending:true});
    if(values!==null){const field=type==='size'||type==='accessories'?'row_data->>EWO':type==='embellishment'?'EWO No':'EWO';query=query.in(field,values);}
    return query;
  },current,500),{ttl:EWO_SOURCE_TTL});
}

// Network counters count requests issued while a slide is visible, including paging/RPC.
function dashboardPerfEnabled(){return typeof window!=='undefined'&&(window.EKWL_PERF_ENABLED===true||new URLSearchParams(window.location.search).get('ekwlPerf')==='1');}
function beginDashboardSlideOpen(slide){
  if(!dashboardPerfEnabled())return;
  const opens=window.EKWL_SLIDE_OPENS||(window.EKWL_SLIDE_OPENS=[]);
  const entry={open:opens.length+1,slide:Number(slide),requests:0,cacheHits:0};opens.push(entry);window.EKWL_ACTIVE_SLIDE_OPEN=entry;
  startDashboardTiming('slide.open')({slide:entry.slide,open:entry.open});
}
function dashboardTrackedFetch(...args){
  if(dashboardPerfEnabled()){
    const open=window.EKWL_ACTIVE_SLIDE_OPEN;
    if(open)open.requests++;
    window.EKWL_DATA_REQUEST_COUNT=(window.EKWL_DATA_REQUEST_COUNT||0)+1;
  }
  return fetch(...args);
}
// Only dependencies evidenced by current front-end/SQL definitions are invalidated.
const UPLOAD_CACHE_DEPENDENCIES={
  plan:{planning:true,gantt:true,popup:true,execution:true,readiness:true,coverage:true},
  fabric:{reports:['fabric'],gantt:true,popup:true,readiness:true,coverage:true},
  sewing:{reports:['sewing'],gantt:true,popup:true,readiness:true,coverage:true},
  production:{reports:['production'],gantt:true,popup:true,coverage:true},
  orderbank:{snapshots:['orderbank'],sources:['orderbank'],popup:true,execution:true},
  floor:{settings:['floor']},
  size:{snapshots:['size'],sources:['size'],popup:true,readiness:true},
  accessories:{snapshots:['accessories'],sources:['accessories'],popup:true,readiness:true},
  embellishment:{snapshots:['embellishment'],sources:['embellishment'],popup:true,readiness:true,coverage:true}
};
function invalidateUploadDependencies(source){
  const dep=UPLOAD_CACHE_DEPENDENCIES[source];if(!dep)throw Error('Unknown upload source: '+source);
  if(dep.snapshots){
    invalidateDataCache(dep.snapshots.map(type=>'snapshot:'+type));
    if(dep.snapshots.includes('orderbank'))++ORDER_BANK_LOAD_TOKEN;
    if(dep.snapshots.includes('size'))++SS_LOAD_TOKEN;
    if(dep.snapshots.includes('accessories'))++AC_LOAD_TOKEN;
    if(dep.snapshots.includes('embellishment'))++EM_LOAD_TOKEN;
  }
  if(dep.sources)invalidateEwoSources(dep.sources);
  if(dep.reports)invalidateSharedReports(dep.reports);
  if(dep.settings)invalidateTinySettings(dep.settings);
  if(dep.planning)PLAN_VERSION_CACHE.clear();
  if(dep.gantt)invalidateGanttIndex();
  if(dep.popup)resetGanttHoverCache([]); // Derived popup/calendar data only; source tables remain independently versioned.
  if(dep.execution&&typeof invalidateOrderExecutionData==='function')invalidateOrderExecutionData();
  if(dep.readiness){++RD_LOAD_TOKEN;RD_ROWS=[];RD_UPLOAD_ID='';RD_BUSY=false;RD_ERROR='';}
  if(dep.coverage){++RC_TOKEN;RC_ROWS=[];RC_BUSY=false;RC_ERROR='';RC_CUTOFF='';}
  if(dep.snapshots?.includes('embellishment')){++S12_EM_LOAD_TOKEN;S12_EM_ROWS=null;S12_EM_LOADING=false;S12_EM_ERROR='';}
  return dep;
}
