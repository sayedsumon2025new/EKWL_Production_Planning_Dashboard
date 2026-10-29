/* Only aggregate selected-plan SAH/Day values already hydrated by the dashboard. */
function buildLoadAnalysisPlanTotals(rows){
  const totals=Object.create(null);
  const seen=new Set();
  for(const row of rows||[]){
    if(String(row.criteria||'').trim()!=='SAH/Day')continue;
    const date=String(row.date||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||row.value==null||row.value==='')continue;
    const value=Number(row.value);
    if(!Number.isFinite(value))continue;
    const key=String(row.record_id)+'|'+date;
    if(row.record_id!=null && seen.has(key))continue;
    if(row.record_id!=null)seen.add(key);
    totals[date]=(totals[date]||0)+value;
  }
  return totals;
}
function loadAnalysisDailyCapacity(config){
  const metric=Array.isArray(config?.metrics)?config.metrics.find(row=>
    Array.isArray(row) && String(row[0]).trim().toLowerCase()==='daily capacity'):null;
  if(!metric || metric[1]==null)return null;
  const text=String(metric[1]).trim().replace(/\s*(?:hours?|hrs?)\s*$/i,'').replace(/,/g,'').trim();
  if(!/^\d+(?:\.\d+)?$/.test(text))return null;
  const value=Number(text);
  return Number.isFinite(value)?value:null;
}
let LOAD_ANALYSIS_REQUEST=0,LOAD_ANALYSIS_MODEL=null,LOAD_ANALYSIS_SELECTION=null;
function loadAnalysisSelected(owner,uploadId){const key=String(owner)+'|'+String(uploadId)+'|'+SITE_SESSION_GENERATION;if(LOAD_ANALYSIS_SELECTION?.key!==key)LOAD_ANALYSIS_SELECTION={key,values:[0,1,2,3,4]};return [...LOAD_ANALYSIS_SELECTION.values];}
async function refreshLoadAnalysisPlan(){
 const frame=document.getElementById('load-analysis-workspace');if(!frame?.contentWindow)return;
 const token=++LOAD_ANALYSIS_REQUEST,generation=SITE_SESSION_GENERATION,owner=SITE_AUTH_USER?.id,uploadId=String(ACTIVE_PLAN_UPLOAD?.id||'');
 const permitted=!!owner&&!document.body.classList.contains('site-locked')&&canAccessSlide(20);
 const ready=permitted&&CURRENT_SLIDE===20&&!!uploadId&&String(EFF15_METRIC_UPLOAD_ID||'')===uploadId;
 const post=payload=>frame.contentWindow.postMessage({type:'ekwl-load-analysis-plan',uploadId,selected:loadAnalysisSelected(owner,uploadId),...payload},location.origin);
 LOAD_ANALYSIS_MODEL=null;
 if(!ready){post({ready:false,dates:[],totals:{},label:'',dailyCapacity:null});return;}
 const dates=buildLoadAnalysisPlanDates(EFF15_METRIC_DAILY),totals=buildLoadAnalysisPlanTotals(EFF15_METRIC_DAILY),dailyCapacity=loadAnalysisDailyCapacity(getABPTarget()),label=activePlanningLabel();
 post({ready:true,loading:true,dates,totals,dailyCapacity,label});
 const current=()=>token===LOAD_ANALYSIS_REQUEST&&generation===SITE_SESSION_GENERATION&&owner===SITE_AUTH_USER?.id&&uploadId===String(ACTIVE_PLAN_UPLOAD?.id||'')&&CURRENT_SLIDE===20&&canAccessSlide(20);
 const result=await Promise.allSettled([ensureSharedReports(['fabric','sewing','production']),loadEwoSource('size'),loadEwoSource('accessories'),loadEwoSource('embellishment'),SB.request('load-analysis-loss',{action:'list',upload_id:uploadId})]);
 if(!current())return;
 const messages=[];for(let i=0;i<result.length;i++)if(result[i].status==='rejected')messages.push(['WIP reports','Size Set','Accessories','Embellishment','Corrections'][i]+' unavailable');
 const corrections=result[4].status==='fulfilled'?result[4].value:null;
 if(corrections?.error)messages.push('Saved corrections unavailable: '+corrections.error.message);
 if(result[0].status==='rejected'){post({ready:true,dates,totals,dailyCapacity,label,error:messages.join('. ')});return;}
 const rows=i=>result[i].status==='fulfilled'?result[i].value:[];
 const lines=[...getChassisMasterLines()].map(Number).filter(n=>n>0&&n!==46);
 const cachedNames=typeof SHARED_REPORT_LOADS==='undefined'?[]:['fabric','sewing','production'].filter(name=>SHARED_REPORT_LOADS.get(name)?.cached);
 if(cachedNames.length)messages.push('Cached report fallback: '+cachedNames.join(', ')+'. Refresh reports to verify current sources.');
 const modelInput={dates,lines,masterLines:lines,search:'',selected:loadAnalysisSelected(owner,uploadId),embellishmentAvailable:result[3].status==='fulfilled',evidenceAvailable:!cachedNames.includes('fabric')&&[1,2,3].every(i=>result[i].status==='fulfilled'),sourcePartial:cachedNames.length>0,data:DATA,plan:DAILY_PLAN,metrics:EFF15_METRIC_DAILY,sah:SAH_DAILY,clock:CLOCK_HOUR_DAILY,fabric:FABRIC_CUTTING_DATA,sewing:SEWING_IO_DATA,production:DATE_WISE_PRODUCTION_DATA,embellishment:rows(3),sources:{fabric:FABRIC_CUTTING_DATA,size:rows(1),accessories:rows(2),embellishment:rows(3)},overrides:corrections?.data?.overrides||{},dailyCapacity,planTotals:totals};
 const model=buildLoadAnalysisLoss(modelInput);
 const receipt=(name,values,loaded,cached=false)=>({name,loaded,cached,rows:values.length,file:values[0]?.file_name||null,uploadedAt:values[0]?.uploaded_at||null});
 const sourceReceipts=[{name:'ABP daily target',loaded:dailyCapacity!==null,rows:dailyCapacity===null?0:1,scope:'Configured Daily Capacity applied to each selected date'},{name:'FR SAH/Day',loaded:true,rows:EFF15_METRIC_DAILY.filter(r=>String(r.criteria).trim()==='SAH/Day').length,file:label,uploadedAt:ACTIVE_PLAN_UPLOAD.uploaded_at||null,scope:'Selected-file criterion rows; signed values retained'},receipt('Fabrics & Cutting',FABRIC_CUTTING_DATA,true,cachedNames.includes('fabric')),receipt('Sewing I/O',SEWING_IO_DATA,true,cachedNames.includes('sewing')),receipt('Actual Production',DATE_WISE_PRODUCTION_DATA,true,cachedNames.includes('production')),receipt('Size Set',rows(1),result[1].status==='fulfilled'),receipt('Accessories',rows(2),result[2].status==='fulfilled'),receipt('Embellishment',rows(3),result[3].status==='fulfilled')];
 LOAD_ANALYSIS_MODEL={uploadId,model,input:modelInput,payload:{ready:true,dates,totals,dailyCapacity,label,sourceReceipts,messages,canCorrect:!!corrections&&!corrections.error}};
 post({...LOAD_ANALYSIS_MODEL.payload,model});
}
function buildLoadAnalysisPlanDates(rows){
  const keys=Array.from(new Set((rows||[]).map(row=>String(row.date||''))
    .filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date+'T00:00:00Z'))))).sort();
  if(!keys.length)return [];
  const dates=[],end=Date.parse(keys[keys.length-1]+'T00:00:00Z');
  for(let time=Date.parse(keys[0]+'T00:00:00Z');time<=end;time+=86400000)
    dates.push(new Date(time).toISOString().slice(0,10));
  return dates;
}
window.addEventListener('message',event=>{
  const frame=document.getElementById('load-analysis-workspace');
  if(event.origin!==location.origin || event.source!==frame?.contentWindow)return;
  if(event.data?.type==='ekwl-load-analysis-ready'){if(event.data.refresh&&CURRENT_SLIDE===20&&canAccessSlide(20)){invalidateSharedReports();invalidateEwoSources(['size','accessories','embellishment']);}refreshLoadAnalysisPlan();}
  if(event.data?.type==='ekwl-load-analysis-wip'){
   if(!SITE_AUTH_USER||CURRENT_SLIDE!==20||document.body.classList.contains('site-locked')||!canAccessSlide(20))return;
   const values=event.data.selected;if(!Array.isArray(values)||values.length>5||values.some(i=>!Number.isInteger(i)||i<0||i>4))return;
   const uploadId=String(ACTIVE_PLAN_UPLOAD?.id||'');loadAnalysisSelected(SITE_AUTH_USER.id,uploadId);LOAD_ANALYSIS_SELECTION.values=[...new Set(values)];
   const state=LOAD_ANALYSIS_MODEL;if(state?.uploadId===uploadId){state.input.selected=[...LOAD_ANALYSIS_SELECTION.values];state.model=buildLoadAnalysisLoss(state.input);frame.contentWindow.postMessage({type:'ekwl-load-analysis-plan',uploadId,...state.payload,selected:[...LOAD_ANALYSIS_SELECTION.values],model:state.model},location.origin);}
  }
  if(event.data?.type==='ekwl-load-analysis-correction')void saveLoadAnalysisCorrection(event.data);
});
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('load-analysis-workspace')?.addEventListener('load',refreshLoadAnalysisPlan);
});


async function saveLoadAnalysisCorrection(message){
 const frame=document.getElementById('load-analysis-workspace'),state=LOAD_ANALYSIS_MODEL;
 if(!state||CURRENT_SLIDE!==20||!SITE_AUTH_USER||!canAccessSlide(20))return;
 const generation=SITE_SESSION_GENERATION,owner=SITE_AUTH_USER.id,uploadId=state.uploadId;
 if(uploadId!==String(ACTIVE_PLAN_UPLOAD?.id||''))return;
 const action=message.action==='reset'?'reset':'save';
 const record=state.model.records.find(row=>row.key===message.key);
 if(action==='save'&&(!record||!(record.correctable>0)||state.model.reconciliation?.ok!==true)){frame.contentWindow.postMessage({type:'ekwl-load-analysis-correction-result',error:'No reconciled editable gap is available. Refresh reports and try again.'},location.origin);return;}
 if(action==='save'&&!record.allowedReasons?.includes(message.reason)){frame.contentWindow.postMessage({type:'ekwl-load-analysis-correction-result',error:'That reason has no matching source evidence. Update the source report or choose Unassigned.'},location.origin);return;}
 const current=()=>generation===SITE_SESSION_GENERATION&&owner===SITE_AUTH_USER?.id&&uploadId===String(ACTIVE_PLAN_UPLOAD?.id||'')&&CURRENT_SLIDE===20;
 const result=await SB.request('load-analysis-loss',{action,upload_id:uploadId,key:message.key,reason:message.reason,note:message.note});
 if(!current())return;
 frame.contentWindow.postMessage({type:'ekwl-load-analysis-correction-result',error:result.error?.message||null},location.origin);
 if(!result.error)await refreshLoadAnalysisPlan();
}
