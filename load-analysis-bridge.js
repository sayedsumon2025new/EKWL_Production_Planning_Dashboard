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
let LOAD_ANALYSIS_REQUEST=0,LOAD_ANALYSIS_MODEL=null;
async function refreshLoadAnalysisPlan(){
 const frame=document.getElementById('load-analysis-workspace');if(!frame?.contentWindow)return;
 const token=++LOAD_ANALYSIS_REQUEST,generation=SITE_SESSION_GENERATION,owner=SITE_AUTH_USER?.id,uploadId=String(ACTIVE_PLAN_UPLOAD?.id||'');
 const permitted=!!owner&&!document.body.classList.contains('site-locked')&&canAccessSlide(20);
 const ready=permitted&&CURRENT_SLIDE===20&&!!uploadId&&String(EFF15_METRIC_UPLOAD_ID||'')===uploadId;
 const post=payload=>frame.contentWindow.postMessage({type:'ekwl-load-analysis-plan',uploadId,...payload},location.origin);
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
 const model=buildLoadAnalysisLoss({dates,lines,masterLines:lines,search:'',selected:[0,1,2,3],data:DATA,plan:DAILY_PLAN,sah:SAH_DAILY,clock:CLOCK_HOUR_DAILY,fabric:FABRIC_CUTTING_DATA,sewing:SEWING_IO_DATA,production:DATE_WISE_PRODUCTION_DATA,embellishment:rows(3),sources:{fabric:FABRIC_CUTTING_DATA,size:rows(1),accessories:rows(2),embellishment:rows(3)},overrides:corrections?.data?.overrides||{},dailyCapacity,planTotals:totals});
 LOAD_ANALYSIS_MODEL={uploadId,model};
 post({ready:true,dates,totals,dailyCapacity,label,model,messages,canCorrect:!!corrections&&!corrections.error});
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
 if(action==='save'&&(!record||!(record.correctable>0)))return;
 const current=()=>generation===SITE_SESSION_GENERATION&&owner===SITE_AUTH_USER?.id&&uploadId===String(ACTIVE_PLAN_UPLOAD?.id||'')&&CURRENT_SLIDE===20;
 const result=await SB.request('load-analysis-loss',{action,upload_id:uploadId,key:message.key,reason:message.reason,note:message.note});
 if(!current())return;
 frame.contentWindow.postMessage({type:'ekwl-load-analysis-correction-result',error:result.error?.message||null},location.origin);
 if(!result.error)await refreshLoadAnalysisPlan();
}
