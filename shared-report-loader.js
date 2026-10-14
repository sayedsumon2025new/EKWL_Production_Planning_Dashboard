/* Shared report lifecycle only. Queries and source-row transformations are unchanged. */
const SHARED_REPORT_LOADS=new Map();
const SHARED_REPORT_VIEWS=new Map();
const SHARED_REPORT_FALLBACKS=new Map();
let HOME_FIRST_DATA_TIMING=null;

// Opt in with ?ekwlPerf=1 or window.EKWL_PERF_ENABLED=true before loading.
// No report data, credentials, or user identifiers are recorded.
function startDashboardTiming(name){
  if(typeof window==='undefined'||typeof performance==='undefined')return ()=>{};
  const enabled=window.EKWL_PERF_ENABLED===true||new URLSearchParams(window.location.search).get('ekwlPerf')==='1';
  if(!enabled||typeof performance.mark!=='function'||typeof performance.measure!=='function')return ()=>{};
  const id=(startDashboardTiming.sequence=(startDashboardTiming.sequence||0)+1);
  const start='ekwl:'+name+':'+id+':start',end='ekwl:'+name+':'+id+':end';
  performance.mark(start);let finished=false;
  return (details={})=>{
    if(finished)return;finished=true;
    performance.mark(end);
    const measurement=performance.measure('ekwl:'+name,start,end);
    (window.EKWL_TIMINGS||(window.EKWL_TIMINGS=[])).push({name,durationMs:measurement.duration,...details});
    performance.clearMarks(start);performance.clearMarks(end);
  };
}

function finishHomeFirstDataTiming(){
  if(HOME_FIRST_DATA_TIMING){HOME_FIRST_DATA_TIMING({status:'rendered'});HOME_FIRST_DATA_TIMING=null;}
}

function sharedReportsForSlide(n){
  // Slide 21's invoker view/RPC read their evidence in SQL, not from these arrays.
  // No standalone Sewing/Production slide exists in the current slide registry.
  return Number(n)===7?['fabric','sewing','production']:Number(n)===11?['fabric','sewing']:[];
}

function sharedReportsReady(names){
  return names.every(name=>{
    const entry=SHARED_REPORT_LOADS.get(name);
    return entry?.loaded&&entry.generation===SITE_SESSION_GENERATION&&entry.userId===SITE_AUTH_USER?.id;
  });
}

// Called only after the existing persistent-cache owner checks succeed.
// Legacy v3 snapshots predate the flags and were written after all reports completed.
function registerSharedReportCache(availability,rows){
  for(const name of ['fabric','sewing','production']){
    if(Array.isArray(rows[name])&&(availability===undefined||availability[name]===true)){
      SHARED_REPORT_FALLBACKS.set(name,{rows:rows[name],generation:SITE_SESSION_GENERATION,userId:SITE_AUTH_USER?.id});
    }
  }
}

function sharedReportCacheAvailability(){
  return Object.fromEntries(['fabric','sewing','production'].map(name=>{
    const fallback=SHARED_REPORT_FALLBACKS.get(name);
    return [name,sharedReportsReady([name])||!!(fallback&&fallback.generation===SITE_SESSION_GENERATION&&fallback.userId===SITE_AUTH_USER?.id)];
  }));
}

function invalidateSharedReports(names=['fabric','sewing','production']){
  for(const name of names){SHARED_REPORT_LOADS.delete(name);SHARED_REPORT_FALLBACKS.delete(name);}
  SHARED_REPORT_VIEWS.clear();
}

function loadSharedReport(name){
  const generation=SITE_SESSION_GENERATION,userId=SITE_AUTH_USER?.id;
  if(!userId)return Promise.reject(Error('Sign in before loading reports.'));
  const existing=SHARED_REPORT_LOADS.get(name);
  if(existing?.generation===generation&&existing.userId===userId)return existing.promise;
  const entry={generation,userId,loaded:false,promise:null};
  SHARED_REPORT_LOADS.set(name,entry);
  const current=()=>generation===SITE_SESSION_GENERATION&&userId===SITE_AUTH_USER?.id&&SHARED_REPORT_LOADS.get(name)===entry;
  const label={fabric:'Fabrics & Cutting',sewing:'Sewing I/O',production:'Date Wise Production'}[name];
  const finish=startDashboardTiming('report.'+name);let requests=0;
  setLoadChip('load-'+name,'loading',label);
  entry.promise=(async()=>{
    try{
      const paged=build=>sbPaged(()=>{requests++;return build();});
      let rows;
      if(name==='fabric'){
        rows=await paged(()=>SB.from('fabric_cutting_info')
          .select('id,buyer,ewo,color_name,item_product_type,style_embellishment_type,pattern_update,color_order_qty,fabric_booking_qty,total_fabric_received,fabric_balance,fabric_stock_after_cut,cutable_qty,total_cut_qty,cutting_balance,cutting_percent,status,cutting_difficulties,pattern_received_date,replacement_receive_commitment_date')
          .order('id',{ascending:true}));
      }else if(name==='sewing'){
        const source=await paged(()=>SB.from('sewing_input_output')
          .select('id,ewo,color,line,line_no,total_input_qty,total_output_qty,total_wip_qty,total_reject_qty')
          .order('id',{ascending:true}));
        rows=source.map(r=>({
          ewo:r.ewo==null?'':String(r.ewo).replace(/\.0$/,'').trim(),
          color:r.color||'',line_no:Number(r.line_no)||lineNumber(r.line),
          input:N(r.total_input_qty),output:N(r.total_output_qty),
          wip:N(r.total_wip_qty),reject:N(r.total_reject_qty)
        }));
      }else if(name==='production'){
        const source=await paged(()=>SB.from('date_wise_production')
          .select('id,code,buyer,ewo,po_no,color,line,line_no,output_date,total_qty')
          .order('output_date',{ascending:true}).order('id',{ascending:true}));
        rows=source.map(r=>({
          id:r.id,code:r.code||'',buyer:r.buyer||'',
          ewo:r.ewo==null?'':String(r.ewo).replace(/\.0$/,'').trim(),
          po_no:r.po_no||'',color:r.color||'',line:r.line||'',
          line_no:Number(r.line_no)||lineNumber(r.line),output_date:r.output_date,total_qty:N(r.total_qty)
        }));
      }else throw Error('Unknown shared report: '+name);
      if(!current())throw Error('Shared report load superseded.');
      if(name==='fabric')FABRIC_CUTTING_DATA=rows;
      if(name==='sewing')SEWING_IO_DATA=rows;
      if(name==='production')DATE_WISE_PRODUCTION_DATA=rows;
      entry.loaded=true;
      setLoadChip('load-'+name,'ok',label+' ('+rows.length.toLocaleString()+')');
      finish({status:'loaded',requests,rows:rows.length});
      return rows;
    }catch(error){
      const wasCurrent=current();
      const fallback=SHARED_REPORT_FALLBACKS.get(name);
      if(wasCurrent&&fallback?.generation===generation&&fallback.userId===userId){
        // Preserve the previous cache fallback on a failed live read, never partial rows.
        entry.loaded=true;
        setLoadChip('load-'+name,'err',label+' · cached data');
        setSupabaseLiveBadge('err','Supabase check failed · cached '+label);
        finish({status:'cached',requests,rows:fallback.rows.length});
        return fallback.rows;
      }
      if(wasCurrent){
        SHARED_REPORT_LOADS.delete(name);
        setLoadChip('load-'+name,'err',label+' · load failed');
      }
      finish({status:wasCurrent?'failed':'discarded',requests});
      throw error;
    }
  })();
  return entry.promise;
}

async function ensureSharedReports(names){
  await Promise.all(names.map(loadSharedReport));
}

function prepareSharedReportView(n){
  const names=sharedReportsForSlide(n);
  if(!names.length||sharedReportsReady(names))return true;
  if(!SITE_AUTH_USER||!canAccessSlide(n)||CURRENT_SLIDE!==n)return false;
  if(SHARED_REPORT_VIEWS.has(n))return false;
  const generation=SITE_SESSION_GENERATION,userId=SITE_AUTH_USER.id;
  const entry={};SHARED_REPORT_VIEWS.set(n,entry);
  const current=()=>SHARED_REPORT_VIEWS.get(n)===entry&&generation===SITE_SESSION_GENERATION&&userId===SITE_AUTH_USER?.id&&CURRENT_SLIDE===n&&canAccessSlide(n);
  const body=document.getElementById(n===7?'s11-body':'s12-body');
  const columns=document.getElementById(n===7?'s11-head':'s12-tbl')?.querySelectorAll?.('th')?.length||1;
  const loading=n===7?'Loading Gantt reports…':'Loading Fabrics & Cutting reports…';
  if(body)body.innerHTML=`<tr><td colspan="${columns}" class="cen">${loading}</td></tr>`;
  ensureSharedReports(names).then(()=>{
    if(current()&&sharedReportsReady(names)){
      renderSlide(n);
      saveFastBootCache();
      void saveDashboardCache();
    }
  }).catch(error=>{
    if(!current())return;
    if(body)body.innerHTML=`<tr><td colspan="${columns}" class="cen">Report load failed. Reopen this slide or refresh to retry.</td></tr>`;
    setStatus(false,'Report load failed: '+(error?.message||error));
  }).finally(()=>{
    if(SHARED_REPORT_VIEWS.get(n)===entry)SHARED_REPORT_VIEWS.delete(n);
  });
  return false;
}

function fetchABPTargetFromSQL(){
  return Promise.resolve(SB.from('abp_target').select('parameter_name,config')
    .eq('parameter_name','ABP_MATRIX_2026_27').maybeSingle());
}
