/* Order Execution Plan: authenticated SQL data bridge for the isolated v3 view. */
let OE_LOAD_PROMISE=null;
let OE_PENDING_KEY='';
let OE_RENDERED_KEY='';
let OE_RENDERED_AT=0;
let OE_LOAD_TOKEN=0;

function invalidateOrderExecutionData(){++OE_LOAD_TOKEN;OE_PENDING_KEY='';OE_RENDERED_KEY='';OE_RENDERED_AT=0;}

function resetOrderExecutionSlide(){
  ++OE_LOAD_TOKEN;
  OE_LOAD_PROMISE=null;OE_PENDING_KEY='';OE_RENDERED_KEY='';OE_RENDERED_AT=0;
  const frame=document.getElementById('order-execution-frame');
  if(frame){frame.dataset.ready='';frame.removeAttribute('src');}
}

window.addEventListener('message',event=>{
  const frame=document.getElementById('order-execution-frame');
  if(!frame || event.source!==frame.contentWindow || !event.data || document.body.classList.contains('site-locked'))return;
  if(event.data.type==='ekwl-frontend-timing'&&(window.EKWL_PERF_ENABLED===true||new URLSearchParams(location.search).get('ekwlPerf')==='1')){
    const t=event.data.timing;
    if(t&&['library.three','filter.render'].includes(t.name)&&Number.isFinite(t.durationMs)){
      (window.EKWL_TIMINGS||(window.EKWL_TIMINGS=[])).push({name:t.name,durationMs:t.durationMs,status:t.status,requests:t.requests,renders:t.renders,frame:'execution'});
      if(Number.isInteger(t.renders))window.EKWL_FILTER_RENDER_COUNT=(window.EKWL_FILTER_RENDER_COUNT||0)+t.renders;
    }
  }
  if(event.data.type==='ekwl-execution-ready'){
    frame.dataset.ready='1';
    frame.contentWindow.postMessage({type:'ekwl-execution-visible',visible:CURRENT_SLIDE===16},'*');
    if(CURRENT_SLIDE===16)loadOrderExecutionSlide();
  }
  if(event.data.type==='ekwl-execution-rendered'){
    if(event.data.key===OE_PENDING_KEY){
      OE_RENDERED_KEY=OE_PENDING_KEY;OE_RENDERED_AT=Date.now();
      OE_PENDING_KEY='';
    }
  }
  if(event.data.type==='ekwl-execution-error'){
    OE_PENDING_KEY='';
    console.error('Order Execution Plan render failed:',event.data.message);
  }
});

async function loadOrderExecutionSlide(force=false){
  const frame=document.getElementById('order-execution-frame');
  if(!frame || frame.dataset.ready!=='1' || !SITE_AUTH_USER || !canAccessSlide(16))return;
  if(OE_LOAD_PROMISE){
    const pending=OE_LOAD_PROMISE;
    await pending;
    if(SITE_AUTH_USER && CURRENT_SLIDE===16)return loadOrderExecutionSlide(force);
    return;
  }
  const userId=String(SITE_AUTH_USER.id);
  const generation=SITE_SESSION_GENERATION;
  const uploadId=String(ACTIVE_PLAN_UPLOAD?.id||'');
  const uploadRevision=ACTIVE_PLAN_UPLOAD?.revision;
  const planningReady=!!uploadId && String(EFF15_METRIC_UPLOAD_ID||'')===uploadId;
  const key=userId+':'+uploadId+':'+String(uploadRevision??'')+':'+planningReady;
  if(!force && ((key===OE_RENDERED_KEY&&Date.now()-OE_RENDERED_AT<60000) || key===OE_PENDING_KEY))return;
  const token=++OE_LOAD_TOKEN;
  const current=()=>token===OE_LOAD_TOKEN && generation===SITE_SESSION_GENERATION &&
    SITE_AUTH_USER?.id===userId && String(ACTIVE_PLAN_UPLOAD?.id||'')===uploadId && String(ACTIVE_PLAN_UPLOAD?.revision??'')===String(uploadRevision??'') &&
    frame.dataset.ready==='1' && canAccessSlide(16);
  const send=payload=>{if(current())frame.contentWindow.postMessage(payload,'*');};
  send({type:'ekwl-execution-loading'});
  OE_LOAD_PROMISE=(async()=>{
    try{
      const all=await loadOrderBankSnapshot(force);
      if(!current())return;
      const sourceColumns=all[0]?.source_columns;
      const orders=all.map(row=>{
        if(Array.isArray(sourceColumns)&&sourceColumns.length){
          if(!row.source_data||sourceColumns.some(key=>!Object.hasOwn(row.source_data,key)))throw Error('Order Bank SQL source cells do not match their headers.');
          return row.source_data;
        }
        return row;
      });
      let records=[],daily=[],dateRange=[],planningError='';
      if(planningReady){
        try{
          if(typeof SB.reportSnapshot==='function'){
            const {data,error}=await SB.reportSnapshot('planning-records',{upload_id:uploadId,...(uploadRevision==null?{}:{revision:uploadRevision})});
            if(error)throw error;
            if(data?.format!=='report-rows-v1'||data.kind!=='planning-records'||!Array.isArray(data.rows)
                ||data.integrity?.complete!==true||data.integrity.row_count!==data.rows.length
                ||String(data.integrity.upload_id)!==uploadId
                ||(uploadRevision!=null&&String(data.integrity.revision)!==String(uploadRevision)))throw Error('Planning SQL read did not complete.');
            records=data.rows;
          }else records=await sbPaged(()=>SB.from('plan_records')
            .select('id,source_row,unit,line_no,buyer,product_type,product,ewo,stroke,po,col,print,emb,outsource,order_qty,planned_qty,pcd,psd,pfd,strip_plan_qty,delivery,manpower,smv,average,criteria,total,is_summary_row')
            .eq('upload_id',uploadId).eq('is_summary_row',false)
            .in('criteria',['Plan/Day','SAH/Day','Clock Hour/Day','Effi/Day'])
            .order('source_row',{ascending:true}).order('id',{ascending:true}));
          if(!current())return;
          const allowedIds=new Set(records.map(r=>String(r.id)));
          const days=new Set();
          for(const r of EFF15_METRIC_DAILY){
            if(!r.date || !allowedIds.has(String(r.record_id)))continue;
            days.add(r.date);
            if(Number(r.value))daily.push({record_id:r.record_id,plan_date:r.date,value:r.value});
          }
          dateRange=[...days].sort();
        }catch(e){
          planningError=String(e?.message||e);
          records=[];daily=[];dateRange=[];
        }
      }
      if(!current())return;
      OE_PENDING_KEY=key;
      send({type:'ekwl-execution-data',key,orders,records,daily,dateRange,
        planningReady:planningReady&&!planningError,
        planningLabel:ACTIVE_PLAN_UPLOAD?.planning_id||'',
        planningError});
    }catch(e){
      console.error('Order Bank SQL read failed:',e);
      send({type:'ekwl-execution-error',message:'Order Bank SQL load failed: '+String(e?.message||e)});
    }
  })();
  try{await OE_LOAD_PROMISE}finally{OE_LOAD_PROMISE=null;}
}
