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
function refreshLoadAnalysisPlan(){
  const frame=document.getElementById('load-analysis-workspace');
  if(!frame?.contentWindow)return;
  const permitted=!!SITE_AUTH_USER && !document.body.classList.contains('site-locked') && canAccessSlide(20);
  const uploadId=String(ACTIVE_PLAN_UPLOAD?.id||'');
  const ready=permitted && CURRENT_SLIDE===20 && !!uploadId && String(EFF15_METRIC_UPLOAD_ID||'')===uploadId;
  frame.contentWindow.postMessage({type:'ekwl-load-analysis-plan',ready,
    dates:ready?buildLoadAnalysisPlanDates(EFF15_METRIC_DAILY):[],
    label:ready?activePlanningLabel():'',
    totals:ready?buildLoadAnalysisPlanTotals(EFF15_METRIC_DAILY):{}},location.origin);
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
  if(event.data?.type==='ekwl-load-analysis-ready')refreshLoadAnalysisPlan();
});
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('load-analysis-workspace')?.addEventListener('load',refreshLoadAnalysisPlan);
});

