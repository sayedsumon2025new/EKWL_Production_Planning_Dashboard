/* Frontend lifecycle helpers. No query projections, business formulas or CSS. */
const TINY_SETTING_READS=new Map();
const DASHBOARD_INPUT_TIMERS=new Map();
let DASHBOARD_FILTER_CONTEXT=null;

function readTinySetting(key,build){
  const generation=SITE_SESSION_GENERATION,userId=SITE_AUTH_USER?.id;
  const existing=TINY_SETTING_READS.get(key);
  if(existing?.generation===generation&&existing.userId===userId&&(!existing.loaded||Date.now()-existing.at<60000))return existing.promise;
  const entry={generation,userId,promise:null};TINY_SETTING_READS.set(key,entry);
  entry.promise=Promise.resolve().then(build).then(result=>{
    if(generation!==SITE_SESSION_GENERATION||userId!==SITE_AUTH_USER?.id||TINY_SETTING_READS.get(key)!==entry)throw Error('Settings read superseded.');
    if(result.error)throw result.error;
    entry.loaded=true;entry.at=Date.now();return result;
  }).catch(error=>{if(TINY_SETTING_READS.get(key)===entry)TINY_SETTING_READS.delete(key);throw error;});
  return entry.promise;
}

function invalidateTinySettings(keys=[...TINY_SETTING_READS.keys()]){
  keys.forEach(key=>TINY_SETTING_READS.delete(key));
}

// Standalone/opaque execution frames cannot call the parent's timing helper.
function startFrontendTiming(name){
  if(typeof startDashboardTiming==='function')return startDashboardTiming(name);
  if(typeof window==='undefined'||typeof performance==='undefined')return ()=>{};
  if(window.EKWL_PERF_ENABLED!==true&&new URLSearchParams(window.location.search).get('ekwlPerf')!=='1')return ()=>{};
  const id=(startFrontendTiming.sequence=(startFrontendTiming.sequence||0)+1),start='ekwl:'+name+':'+id;
  performance.mark(start);let ended=false;
  return (details={})=>{
    if(ended)return;ended=true;
    const end=start+':end';performance.mark(end);
    const measure=performance.measure('ekwl:'+name,start,end);
    const timing={name,durationMs:measure.duration,...details};
    (window.EKWL_TIMINGS||(window.EKWL_TIMINGS=[])).push(timing);
    if(window.parent!==window)window.parent.postMessage({type:'ekwl-frontend-timing',timing},'*');
    performance.clearMarks(start);performance.clearMarks(end);
  };
}

function trackDashboardFilter(id,callback){
  const previous=DASHBOARD_FILTER_CONTEXT,context={id,renders:0};
  DASHBOARD_FILTER_CONTEXT=context;
  const finish=startFrontendTiming('filter.render');
  try{return callback();}finally{
    finish({filter:id,renders:context.renders});DASHBOARD_FILTER_CONTEXT=previous;
  }
}

function recordDashboardRender(slide){
  if(!DASHBOARD_FILTER_CONTEXT)return;
  DASHBOARD_FILTER_CONTEXT.renders++;
  if(typeof window==='undefined')return;
  const enabled=window.EKWL_PERF_ENABLED===true||new URLSearchParams(window.location.search).get('ekwlPerf')==='1';
  if(enabled){
    window.EKWL_FILTER_RENDER_COUNT=(window.EKWL_FILTER_RENDER_COUNT||0)+1;
    (window.EKWL_FILTER_RENDERS||(window.EKWL_FILTER_RENDERS=[])).push({filter:DASHBOARD_FILTER_CONTEXT.id,slide});
  }
}

function debounceDashboardInput(element,callback){
  const key=element||callback;
  clearTimeout(DASHBOARD_INPUT_TIMERS.get(key));
  const generation=typeof SITE_SESSION_GENERATION==='undefined'?0:SITE_SESSION_GENERATION;
  const timer=setTimeout(()=>{
    DASHBOARD_INPUT_TIMERS.delete(key);
    if(typeof SITE_SESSION_GENERATION!=='undefined'&&generation!==SITE_SESSION_GENERATION)return;
    if(element?.isConnected===false)return;
    trackDashboardFilter(element?.id||'text',callback);
  },275);
  DASHBOARD_INPUT_TIMERS.set(key,timer);
}

function cancelDashboardDebounces(){
  DASHBOARD_INPUT_TIMERS.forEach(clearTimeout);DASHBOARD_INPUT_TIMERS.clear();
}

function flushDashboardInput(element,callback){
  clearTimeout(DASHBOARD_INPUT_TIMERS.get(element));DASHBOARD_INPUT_TIMERS.delete(element);
  return trackDashboardFilter(element?.id||'search',callback);
}

// Bind filter inputs once; module previews/edit/save handlers keep their immediate state updates.
if(typeof document!=='undefined'&&typeof document.addEventListener==='function'){
  document.addEventListener('change',event=>{
    const element=event.target;
    if(!element?.matches?.('select,input[type="date"],input[type="checkbox"]'))return;
    const previous=DASHBOARD_FILTER_CONTEXT,context={id:element.id||'filter',renders:0};
    const finish=startFrontendTiming('filter.render');
    DASHBOARD_FILTER_CONTEXT=context;
    queueMicrotask(()=>{finish({filter:context.id,renders:context.renders});if(DASHBOARD_FILTER_CONTEXT===context)DASHBOARD_FILTER_CONTEXT=previous;});
  },true);
  document.addEventListener('input',event=>{
    const el=event.target;
    const actions={
      'fs':()=>gf(),
      's1-ewo-search':()=>renderS1(getFiltered()),'action-ewo':()=>renderGanttActionCalendar(),
      's12-search':()=>renderS12('search'),'s12-detail-ewo':()=>renderS12(),
      'rd-search':()=>renderEWOReadinessBoard(),'rc-search':()=>renderReadyInputCoverage(),
      'ss-search':()=>{SS_PAGE=1;renderSizeSetModule();},
      'ac-search':()=>{AC_PAGE=1;renderAccessoriesModule();},
      'em-search':()=>embellishmentFiltersChanged(),
      'gantt-ewo-search':()=>{GANTT_EWO_SEARCH=String(el.value||'').trim();renderS11(getFiltered());},
      'order-bank-ewo-search':()=>{ORDER_BANK_EWO_SEARCH=String(el.value||'').trim();ORDER_BANK_PAGE=1;renderOrderBankView(true);}
    };
    if(el?.id&&actions[el.id]&&!el.disabled)debounceDashboardInput(el,actions[el.id]);
  });
}

/* Each screenshot shares the same library promise, including same-origin Load Analysis. */
(() => {
  if(typeof window==='undefined')return;
  const promises=new Map();
  function load(name,globalName,cdn,local){
    if(promises.has(name))return promises.get(name);
    const finish=startFrontendTiming('library.'+name);
    let attempts=0;
    const script=url=>new Promise((resolve,reject)=>{
      attempts++;
      const node=document.createElement('script');node.src=url;node.async=true;
      const timer=setTimeout(()=>{node.remove();reject(Error(name+' load timed out'));},8000);
      node.onload=()=>{clearTimeout(timer);if(window[globalName])resolve(window[globalName]);else{node.remove();reject(Error(name+' unavailable'));}};
      node.onerror=()=>{clearTimeout(timer);node.remove();reject(Error(name+' load failed'));};
      document.head.appendChild(node);
    });
    const promise=(window[globalName]?Promise.resolve(window[globalName]):script(cdn).catch(()=>script(local)))
      .then(library=>{finish({status:'loaded',requests:attempts});return library;})
      .catch(error=>{promises.delete(name);finish({status:'failed',requests:attempts});throw error;});
    promises.set(name,promise);return promise;
  }
  window.EKWLLibraries={
    html2canvas:()=>load('html2canvas','html2canvas','https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js','html2canvas.min.js'),
    three:()=>load('three','THREE','https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js','three.min.js')
  };
})();

function ensureHtml2Canvas(){
  try{
    if(window.parent!==window&&window.parent.location.origin===location.origin&&window.parent.EKWLLibraries)return window.parent.EKWLLibraries.html2canvas();
  }catch(_){/* Standalone/sandboxed frame uses its local loader. */}
  return window.EKWLLibraries.html2canvas();
}
function ensureThreeJS(){return window.EKWLLibraries.three();}
