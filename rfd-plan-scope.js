/* Display scope only. Original SQL/CSV rows and report formulas remain intact. */
let RFD_PLAN_SCOPE_CACHE=null,RFD_PLAN_MODE='within',RFD_PLAN_MODE_OWNER='',RFD_PLAN_MODE_GENERATION=-1;
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
 if(RFD_PLAN_MODE_OWNER!==owner||RFD_PLAN_MODE_GENERATION!==generation){RFD_PLAN_MODE='within';RFD_PLAN_MODE_OWNER=owner;RFD_PLAN_MODE_GENERATION=generation;}
 const mode=RFD_PLAN_MODE,old=RFD_PLAN_SCOPE_CACHE;
 if(old&&old.mode===mode&&old.rows===rows&&old.length===rows?.length&&old.id===id&&old.metric===metric&&old.state===state&&old.selected===selected&&old.owner===owner&&old.generation===generation&&old.permitted===permitted)return old;
 const planReady=permitted&&!!id&&state==='ready'&&String(metric||'')===id&&String(selected)===id&&Array.isArray(rows);
 const ready=permitted&&(mode==='all'||planReady);
 const ewos=new Set();if(planReady)for(const row of rows)for(const ewo of rfdPlanKeys(row.ewo))ewos.add(ewo);
 const scope={mode,planReady,rows,length:rows?.length,id,metric,state,selected,owner,generation,permitted,ready,ewos,
  label:upload?(typeof activePlanningLabel==='function'?activePlanningLabel():upload.file_name||id):'No selected plan',
  matches(value){if(!this.ready)return false;if(this.mode==='all')return true;const keys=rfdPlanKeys(value);return keys.length>0&&keys.every(key=>this.mode==='within'?this.ewos.has(key):!this.ewos.has(key));}};
 RFD_PLAN_SCOPE_CACHE=scope;return scope;
}
function renderRfdPlanScope(){
 const node=document.getElementById('rfd-plan-scope');if(!node)return;
 const scope=getRfdPlanScope();node.dataset.scopeState=scope.ready?'ready':scope.state==='error'?'error':'waiting';
 const picker=document.getElementById('rfd-plan-mode');if(picker){picker.value=scope.mode;picker.disabled=!scope.permitted;}
 const names={within:'Within Plan EWO',without:'Without Plan EWO',all:'All EWO'};
 node.textContent=!scope.permitted?'Sign in with RFD access to view reports.':scope.mode==='all'?'All EWO · All source rows and colors, including blank or mixed identifiers.':scope.planReady?names[scope.mode]+': '+scope.label+' · '+scope.ewos.size.toLocaleString()+' plan EWOs · All colors · Mixed/blank identifiers are available in All EWO.':scope.state==='error'?'Selected plan could not be verified. Choose All EWO to view source rows, or load a valid plan.':scope.id&&scope.selected?'Verifying the selected plan… Within/Without Plan rows are hidden.':'Select a planning report for Within/Without Plan EWO, or choose All EWO.';

}
function rfdPlanRowCount(prefix){return typeof RFD_CASCADE_CACHE==='undefined'?0:RFD_CASCADE_CACHE.get(prefix)?.planCount||0;}
function rfdPlanExportAllowed(){return getRfdPlanScope().ready;}
function resetRfdPlanScope(){RFD_PLAN_MODE='within';RFD_PLAN_SCOPE_CACHE=null;renderRfdPlanScope();}
function setRfdPlanMode(mode){if(!['within','without','all'].includes(mode))return;getRfdPlanScope();RFD_PLAN_MODE=mode;refreshRfdPlanScope();}
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
