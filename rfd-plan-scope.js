/* Display scope only. Original SQL/CSV rows and report formulas remain intact. */
let RFD_PLAN_SCOPE_CACHE=null;
function rfdPlanKeys(value){
 const raw=String(value??'').trim(),codes=[...new Set(raw.match(/(?<!\d)\d{6}(?!\d)/g)||[])];
 return codes.length?codes:raw?[raw.replace(/\s+/gu,' ').toUpperCase()]:[];
}
function getRfdPlanScope(){
 const upload=typeof ACTIVE_PLAN_UPLOAD==='undefined'?null:ACTIVE_PLAN_UPLOAD,rows=typeof DATA==='undefined'?null:DATA;
 const metric=typeof EFF15_METRIC_UPLOAD_ID==='undefined'?null:EFF15_METRIC_UPLOAD_ID;
 const owner=typeof SITE_AUTH_USER==='undefined'?null:SITE_AUTH_USER?.id,generation=typeof SITE_SESSION_GENERATION==='undefined'?-1:SITE_SESSION_GENERATION;
 const state=document.body?.dataset?.planningState||'',selected=document.getElementById('planning-sequence-filter')?.value||'',id=String(upload?.id||'');
 const permitted=!!owner&&typeof canAccessSlide==='function'&&canAccessSlide(22);
 const old=RFD_PLAN_SCOPE_CACHE;
 if(old&&old.rows===rows&&old.length===rows?.length&&old.id===id&&old.metric===metric&&old.state===state&&old.selected===selected&&old.owner===owner&&old.generation===generation&&old.permitted===permitted)return old;
 const ready=permitted&&!!id&&state==='ready'&&String(metric||'')===id&&String(selected)===id&&Array.isArray(rows);
 const ewos=new Set();if(ready)for(const row of rows)for(const ewo of rfdPlanKeys(row.ewo))ewos.add(ewo);
 const scope={rows,length:rows?.length,id,metric,state,selected,owner,generation,permitted,ready,ewos,
  label:upload?(typeof activePlanningLabel==='function'?activePlanningLabel():upload.file_name||id):'No selected plan',
  matches(value){const keys=rfdPlanKeys(value);return this.ready&&keys.length>0&&keys.every(key=>this.ewos.has(key));}};
 RFD_PLAN_SCOPE_CACHE=scope;return scope;
}
function renderRfdPlanScope(){
 const node=document.getElementById('rfd-plan-scope');if(!node)return;
 const scope=getRfdPlanScope();node.dataset.scopeState=scope.ready?'ready':scope.state==='error'?'error':'waiting';
 node.textContent=scope.ready?'Selected plan: '+scope.label+' · '+scope.ewos.size.toLocaleString()+' EWOs · All colors of these EWOs only':scope.state==='error'?'Selected plan could not be verified. Report rows are hidden until a valid plan is loaded.':scope.id&&scope.selected?'Loading and verifying the selected plan… Report rows are hidden.':'Select a planning report to view its available RFD data.';
}
function rfdPlanRowCount(prefix){return typeof RFD_CASCADE_CACHE==='undefined'?0:RFD_CASCADE_CACHE.get(prefix)?.planCount||0;}
function rfdPlanExportAllowed(){return getRfdPlanScope().ready;}
function resetRfdPlanScope(){RFD_PLAN_SCOPE_CACHE=null;renderRfdPlanScope();}
function refreshRfdPlanScope(){
 RFD_PLAN_SCOPE_CACHE=null;renderRfdPlanScope();
 for(const prefix of ['rfd','booking','dcs','fdr'])if(typeof rfdResetTableTools==='function')rfdResetTableTools(prefix);
 for(const fn of [typeof clearRfdExport==='function'?clearRfdExport:null,typeof clearBookingExport==='function'?clearBookingExport:null,typeof clearDcsExport==='function'?clearDcsExport:null,typeof clearFdrExport==='function'?clearFdrExport:null])fn?.();
 if(typeof RFD_PAGE!=='undefined')RFD_PAGE=1;if(typeof BOOKING_PAGE!=='undefined')BOOKING_PAGE=1;if(typeof DCS_PAGE!=='undefined')DCS_PAGE=1;if(typeof FDR_PAGE!=='undefined')FDR_PAGE=1;if(typeof RCON_PAGE!=='undefined')RCON_PAGE=1;
 if(typeof rcCloseReview==='function')rcCloseReview();document.getElementById('fdr-evidence')?.close();
 if(typeof CURRENT_SLIDE==='undefined'||CURRENT_SLIDE!==22)return;
 const tab=typeof RFD_ACTIVE_TAB==='undefined'?'rfd':RFD_ACTIVE_TAB;
 const renderers={rfd:typeof renderRfdModule==='function'?renderRfdModule:null,booking:typeof renderBookingModule==='function'?renderBookingModule:null,dcs:typeof renderDcsModule==='function'?renderDcsModule:null,fdr:typeof renderFdrModule==='function'?renderFdrModule:null,converter:typeof renderRfdConverter==='function'?renderRfdConverter:null};renderers[tab]?.();
}

if(typeof document.addEventListener==='function')document.addEventListener('change',event=>{if(['month-filter','planning-sequence-filter'].includes(event.target?.id))refreshRfdPlanScope();});
