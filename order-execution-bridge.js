/* Order Execution Plan: authenticated SQL data bridge for the isolated v3 view. */
let OE_LOAD_PROMISE=null;
let OE_PENDING_KEY='';
let OE_RENDERED_KEY='';
let OE_LOAD_TOKEN=0;

function resetOrderExecutionSlide(){
  ++OE_LOAD_TOKEN;
  OE_LOAD_PROMISE=null;OE_PENDING_KEY='';OE_RENDERED_KEY='';
  const frame=document.getElementById('order-execution-frame');
  if(frame){frame.dataset.ready='';frame.removeAttribute('src');}
}

window.addEventListener('message',event=>{
  const frame=document.getElementById('order-execution-frame');
  if(!frame || event.source!==frame.contentWindow || !event.data || document.body.classList.contains('site-locked'))return;
  if(event.data.type==='ekwl-execution-ready'){
    frame.dataset.ready='1';
    if(CURRENT_SLIDE===16)loadOrderExecutionSlide();
  }
  if(event.data.type==='ekwl-execution-rendered'){
    if(event.data.key===OE_PENDING_KEY){
      OE_RENDERED_KEY=OE_PENDING_KEY;
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
  const planningReady=!!uploadId && String(EFF15_METRIC_UPLOAD_ID||'')===uploadId;
  const key=userId+':'+uploadId+':'+planningReady;
  if(!force && (key===OE_RENDERED_KEY || key===OE_PENDING_KEY))return;
  const token=++OE_LOAD_TOKEN;
  const current=()=>token===OE_LOAD_TOKEN && generation===SITE_SESSION_GENERATION &&
    SITE_AUTH_USER?.id===userId && String(ACTIVE_PLAN_UPLOAD?.id||'')===uploadId &&
    frame.dataset.ready==='1' && canAccessSlide(16);
  const send=payload=>{if(current())frame.contentWindow.postMessage(payload,'*');};
  send({type:'ekwl-execution-loading'});
  OE_LOAD_PROMISE=(async()=>{
    try{
      let orders=(!force && ORDER_BANK_RAW_ROWS.length)?ORDER_BANK_RAW_ROWS:null;
      if(!orders){
        orders=[];
        for(let from=0;;from+=1000){
          const {data,error}=await SB.from('order_bank_latest_all').select('*')
            .order('source_row_no',{ascending:true}).order('id',{ascending:true})
            .range(from,from+999);
          if(error)throw error;
          if(!current())return;
          orders.push(...(data||[]));
          if((data||[]).length<1000)break;
        }
        ORDER_BANK_RAW_ROWS=orders;
      }
      let records=[],daily=[],dateRange=[],planningError='';
      if(planningReady){
        try{
          records=await sbPaged(()=>SB.from('plan_records')
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
