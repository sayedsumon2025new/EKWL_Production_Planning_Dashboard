/* Same-origin parent supplies the selected snapshot and source-backed model. */
(()=>{
 const reasons=LA_REASONS;
 let selectedStages=new Set([0,1,2,3,4]),wipMenuOpen=false;
 let state={ready:false},sourceDate='',editing=null,busy=false,status='',departmentPinned=null;
 const byId=id=>document.getElementById(({summary:'load-analysis-summary-table','loss-table':'load-analysis-loss-table'})[id]||id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const label=d=>Number(d.slice(8))+'-'+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(d.slice(5,7))-1];
 const number=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
 const fmt=v=>number(v)===null?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:1});
 const reasonLabel=key=>reasons.find(r=>r[0]===key)?.[1]||key;
 const aggregate=values=>{const known=values.filter(v=>v!==null);return {total:known.length?known.reduce((a,b)=>a+b,0):null,avg:known.length?known.reduce((a,b)=>a+b,0)/known.length:null,partial:known.length<values.length};};
 const mark=(v,partial)=>fmt(v)+(number(v)!==null&&partial?'<sup class="la-partial" title="Available subtotal; some source data is unavailable">*</sup>':'');
 function cells(values,partials=[],clickable=false){return values.map((v,i)=>'<td data-plan-date="'+esc(state.dates[i])+'">'+(clickable&&v>0?'<button class="n" data-date="'+esc(state.dates[i])+'" title="View report evidence">'+mark(v,partials[i])+'</button>':mark(v,partials[i]))+'</td>').join('');}
 function row(name,values,partials=[],cls='',prefix=''){
  const a=aggregate(values),partial=a.partial||partials.some(Boolean);if(name==='FR Day Wise Plan SAH:'){const active=values.filter(v=>v!==null&&v>0).length;a.avg=active?a.total/active:null;}
  return '<tr class="'+cls+'"><td class="label-col">'+esc(name)+'</td>'+prefix+cells(values,partials,!!prefix)+'<td><strong>'+mark(a.total,partial)+'</strong></td><td>'+mark(a.avg,partial)+'</td></tr>';
 }
 function fit(){
  const count=state.dates?.length||0;
  for(const id of ['summary','loss-table']){
   const table=byId(id),wrap=table.parentElement,available=wrap.clientWidth;if(!available)continue;
   const leading=id==='summary'?[220]:[220,130],trailing=[100,100];
   const fixed=[...leading,...trailing].reduce((a,b)=>a+b,0),minimum=fixed+count*76,width=Math.max(available,minimum);
   const daily=count?(width-fixed)/count:0;
   let group=table.querySelector('colgroup');if(!group){group=document.createElement('colgroup');table.prepend(group);}
   group.innerHTML=[...leading,...Array(count).fill(daily),...trailing].map(value=>'<col style="width:'+value+'px">').join('');
   table.style.tableLayout='fixed';table.style.transform='none';table.style.width=width+'px';table.style.minWidth=minimum+'px';
   wrap.style.height='auto';wrap.style.overflowX='auto';wrap.style.overflowY='hidden';
  }
 }
 function renderDepartments(days){
  const report=buildLoadAnalysisDepartmentTotals(days),items=report.series.filter(item=>item.value>0),partial=report.partial;
  const percentage=value=>value>0&&value<.1?'<0.1%':value.toFixed(1)+'%';
  const suffix=partial&&report.total!==null?'*':'';let offset=0;
  const point=angle=>[180+150*Math.cos(angle),180+150*Math.sin(angle)].map(value=>value.toFixed(4)).join(' ');
  const arcs=items.map(item=>{const start=(offset/100*360-90)*Math.PI/180;offset+=item.percent;const end=(offset/100*360-90)*Math.PI/180;
   const shape=item.percent>99.999999?'<circle cx="180" cy="180" r="150"':'<path d="M 180 180 L '+point(start)+' A 150 150 0 '+(item.percent>50?1:0)+' 1 '+point(end)+' Z"';
   return shape+' data-dept-segment="'+item.id+'" fill="'+item.color+'"><title>'+esc(item.label+': '+fmt(item.value)+' SAH · '+percentage(item.percent))+'</title></'+(item.percent>99.999999?'circle':'path')+'>';
  }).join('');
  byId('la-department-chart').innerHTML='<div><svg class="la-donut" viewBox="0 0 360 360" role="img" aria-label="Department shares of '+esc(fmt(report.total))+' SAH loss"><circle cx="180" cy="180" r="150" fill="#eaf0f5"/>'+arcs+'<circle cx="180" cy="180" r="102" fill="#ffffff"/><text x="180" y="153" text-anchor="middle" class="la-donut-caption" id="la-donut-label">TOTAL LOSS</text><text x="180" y="190" text-anchor="middle" class="la-donut-total" id="la-donut-value">'+esc(fmt(report.total)+suffix)+'</text><text x="180" y="215" text-anchor="middle" class="la-donut-unit" id="la-donut-share">SAH · '+report.knownDates+' dates</text></svg><div class="la-chart-footer">Hover or select a department to inspect its share</div></div>'+(items.length?'<ul class="la-department-legend">'+items.map(item=>'<li><button type="button" data-dept="'+item.id+'" aria-pressed="false" aria-label="'+esc(item.label+': '+fmt(item.value)+' SAH, '+percentage(item.percent))+'"><span class="la-dot" style="background:'+item.color+'"></span><span>'+esc(item.label)+'</span><strong>'+esc(fmt(item.value)+suffix)+'</strong><small>'+percentage(item.percent)+'</small></button></li>').join('')+'</ul>':'<p class="la-department-empty">'+(report.total===null?'Loss data is unavailable until the source reports load.':'No SAH loss in the available dates.')+'</p>');
  const badge=byId('la-department-status');badge.textContent=report.total===null?'Awaiting data':!report.reconciled?'Reconciliation required':partial?'Available subtotal *':'Reconciled with loss table';badge.classList.toggle('la-chart-error',!report.reconciled);
  byId('la-department-note').textContent='Department SAH is summed from the Responsible column’s reason groups. Textile combines GSM and fabric balance issues; Unassigned stays visible. '+(partial?'* Available/provisional subtotal; some source values or dates are missing. ':'')+'Total: '+fmt(report.total)+' SAH · Loss table: '+fmt(report.expected)+' SAH.';
  if(!items.some(item=>item.id===departmentPinned))departmentPinned=null;
  const activate=id=>{const active=items.find(item=>item.id===id);byId('la-donut-label').textContent=active?active.label.toUpperCase():'TOTAL LOSS';byId('la-donut-value').textContent=fmt(active?active.value:report.total)+suffix;byId('la-donut-share').textContent=active?'SAH · '+percentage(active.percent):'SAH · '+report.knownDates+' dates';document.querySelectorAll('[data-dept-segment]').forEach(node=>node.style.opacity=!active||node.dataset.deptSegment===active.id?'1':'.28');document.querySelectorAll('[data-dept]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.dept===departmentPinned)));};
  document.querySelectorAll('[data-dept]').forEach(node=>{node.onmouseenter=()=>activate(node.dataset.dept);node.onmouseleave=()=>activate(departmentPinned);node.onfocus=()=>activate(node.dataset.dept);node.onblur=()=>activate(departmentPinned);node.onclick=()=>{departmentPinned=departmentPinned===node.dataset.dept?null:node.dataset.dept;activate(departmentPinned);};});activate(departmentPinned);
 }
 function render(){
  const dates=state.ready&&Array.isArray(state.dates)?state.dates:[];state.dates=dates;
  const audit=state.model?validateLoadAnalysisReconciliation(state.model):null,invalid=!!audit&&!audit.ok;
  const days=dates.map(date=>state.model?.days.find(day=>day.date===date)||{date,target:number(state.dailyCapacity),plan:number(state.totals?.[date]),forecast:null,loss:null,buckets:Object.fromEntries(reasons.map(r=>[r[0],null])),partial:false}).map(d=>({...d,buckets:{...d.buckets},wipSah:d.wipSah?[...d.wipSah]:undefined}));
  if(invalid)days.forEach(d=>{d.forecast=null;d.loss=null;d.ganttForecast=null;d.wipSah=[null,null,null,null,null];d.buckets=Object.fromEntries(reasons.map(r=>[r[0],null]));});
  const partial=days.map(d=>!!d.partial),records=state.model?.records||[],modelReady=!!state.model&&!invalid;
  document.querySelector('.period').textContent=dates.length?label(dates[0])+' '+dates[0].slice(0,4)+' – '+label(dates.at(-1))+' '+dates.at(-1).slice(0,4)+' · '+String(state.label||'Selected plan'):'Selected plan · data unavailable or loading';

  document.querySelector('#load-analysis-summary-table thead').innerHTML='<tr class="header-row"><th class="label-col" aria-label="Planning metric and consumable WIP filter"><button class="la-view-picker-button" id="la-view-wip-button" aria-controls="la-view-wip-menu" aria-expanded="'+wipMenuOpen+'"><span>Consumable WIP</span><span class="la-view-picker-count">'+(selectedStages.size===5?'All 5':selectedStages.size+' selected')+' ▾</span></button></th>'+dates.map(d=>'<th>'+label(d)+'</th>').join('')+'<th>Total</th><th>Average</th></tr>';
  const wipLabels={0:'Cut able WIP SAH:',4:'Cutting WIP SAH:',1:'Print WIP SAH:',2:'Embroidery WIP SAH:',3:'Sewing WIP SAH:'};
  document.querySelector('#load-analysis-summary-table tbody').innerHTML=
   row('ABP Day Wise Target SAH:',days.map(d=>d.target))+
   row('FR Day Wise Plan SAH:',dates.map(d=>number(state.totals?.[d])))+
   [0,4,1,2,3].filter(i=>selectedStages.has(i)).map(i=>row(wipLabels[i],days.map(d=>d.wipSah?.[i]??null),days.map(d=>!!d.wipPartial?.[i]),'la-view-wip-row '+([1,2].includes(i)?'la-view-delayed':'')).replace('<tr ','<tr data-wip-stage="'+i+'" ')).join('')+
   row('Final Forecast Achievable SAH:',days.map(d=>d.forecast),partial,'source-row')+
   row('SAH gap (Target − Forecast):',days.map(d=>d.loss),partial,'la-view-gap');
  const bridge=byId('la-view-evidence-summary');
  if(bridge){bridge.querySelector('thead').innerHTML='<tr class="header-row"><th class="label-col">Calculation evidence</th>'+dates.map(d=>'<th>'+label(d)+'</th>').join('')+'<th>Total</th><th>Average</th></tr>';
   bridge.querySelector('tbody').innerHTML=row('Selected WIP SAH subtotal:',days.map(d=>d.ganttForecast??null),partial)+row('Less: selected Print + EMB SAH:',days.map(d=>d.ganttForecast==null?null:(d.printSah||0)+(d.embSah||0)),partial)+row('Final Forecast Achievable SAH:',days.map(d=>d.forecast),partial,'source-row')+row('SAH gap (Target − Forecast):',days.map(d=>d.loss),partial);}

  document.querySelector('#load-analysis-loss-table thead').innerHTML='<tr class="loss-header"><th>Loss reason</th><th>Responsible</th>'+dates.map(d=>'<th>'+label(d)+'</th>').join('')+'<th>Total</th><th>Average</th></tr>';
  document.querySelector('#load-analysis-loss-table tbody').innerHTML=reasons.map(([key,name,team])=>row(name,days.map(d=>d.buckets[key]),partial,key==='unknown'?'unassigned':key==='planning'?'planning':'','<td>'+esc(team)+'</td>')).join('')+row('Total assigned + unassigned',days.map(d=>d.loss),partial,'total-row','<td>Reconciled</td>');
  for(const [id,values,type] of [['target-avg',dates.map(()=>number(state.dailyCapacity)),'avg'],['forecast-avg',days.map(d=>d.forecast),'avg'],['variance-avg',days.map(d=>d.loss),'avg'],['total-loss',days.map(d=>d.loss),'total']]){const a=aggregate(values),p=a.partial||(id==='target-avg'?false:partial.some(Boolean));byId(id).innerHTML=mark(a[type],p);}
  byId('status-message').textContent=state.loading?'Loading WIP reports, evidence and saved corrections…':state.error||[status,...(state.messages||[]),...(state.model?.notes||[])].filter(Boolean).join(' · ');
  byId('manual-count').textContent='· '+records.filter(r=>r.manual).length+' saved correction(s) · account-specific';
  const gap=aggregate(days.map(d=>d.loss));byId('reconcile').classList.toggle('error-reconcile',invalid);byId('reconcile').classList.toggle('la-audit-partial',!invalid&&!!audit&&(audit.partial||!audit.knownDates));byId('reconcile').textContent=invalid?'Reconciliation failed: '+audit.errors.join(' · '):modelReady&&!audit.knownDates?'No forecast dates are available to reconcile; review the source reports.':modelReady?'Arithmetic matched: '+fmt(gap.total)+' SAH gap = reasons + loading gap + Unassigned (unrounded totals). '+(audit.partial?'Available/provisional subtotal *; source completeness is separate.':'Uploaded snapshot values reconciled; source accuracy requires source verification.'):'Forecast and loss attribution unavailable until required reports have loaded.';
  document.querySelector('#evidence tbody').innerHTML=records.filter(r=>!sourceDate||r.date===sourceDate).map(r=>'<tr><td>'+label(r.date)+'</td><td>Line '+r.line+'<br><strong>'+esc(r.ewo)+'</strong></td><td>'+mark(r.plan,r.planDerived)+'</td><td>'+mark(r.forecast,r.partial)+'</td><td>'+mark(r.attributed,r.partial)+'</td><td>'+esc((r.evidence.length?r.evidence.map(e=>e.text+(e.color?' · Color '+e.color:'')+(e.line?' · Line '+e.line:'')+(e.sourceRow!=null?' · Row '+e.sourceRow:'')+(e.file?' · File '+e.file:'')+(e.uploadedAt?' · Uploaded '+e.uploadedAt:'')+' · '+(e.eligible?'Eligible rule evidence':e.scope||'Context only')).join(' | '):'No explicit pending/issue evidence')+(r.planDerived?' · Plan SAH derived from Plan Pcs × SMV ÷ 60':'')+' · This date allocated: Print '+fmt(r.printPcs)+' pcs / '+fmt(r.printSah)+' SAH; EMB '+fmt(r.embPcs)+' pcs / '+fmt(r.embSah)+' SAH')+'</td><td>'+esc(r.attributed>0?Object.entries(r.contributions||{}).filter(([,v])=>v>0).map(([k,v])=>reasonLabel(k)+': '+fmt(v)).join(' | '):r.attributed===null?'Unavailable':'No loss')+(r.manual?'<br><span class="manual-count">Saved correction'+(r.manualApplied?' (applied)':' (not applied — report evidence required)')+': '+esc(r.manual.note)+'</span>':'')+'</td><td>'+(r.correctable>0&&state.canCorrect&&!invalid?'<button class="edit" data-edit="'+esc(r.key)+'">Correct reason</button>':'—')+'</td></tr>').join('');
  byId('source-filter-note').textContent=(sourceDate?label(sourceDate):'All selected-plan dates')+' · Latest uploaded evidence; historical stock is not reconstructed. Status supports attribution, not proven causal SAH.';
  const receipts=byId('la-source-receipts');if(receipts)receipts.textContent='Planning upload: '+String(state.uploadId||'—')+' · Stock baseline: '+String(state.model?.cutoff||'—')+' · '+(state.sourceReceipts||[]).map(s=>s.name+': '+(s.cached?'cached fallback · ':'')+(s.loaded?s.rows+' rows':'unavailable')+(s.scope?' · '+s.scope:'')+(s.file?' · '+s.file:'')+(s.uploadedAt?' · uploaded '+s.uploadedAt:' · upload date not supplied')).join(' | ')+(audit?.scopeDifferences?.length?' · FR minus inventory-scope SAH: '+audit.scopeDifferences.map(d=>d.date+' '+fmt(d.delta)).join(', '):'');
  byId('save-edit').disabled=busy||!modelReady||!state.canCorrect;
  byId('clear-overrides').disabled=!modelReady||!state.canCorrect||busy;
  byId('refresh-loss').disabled=busy||!!state.loading;
  document.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{sourceDate=b.dataset.date;render();byId('sources').open=true;byId('sources').scrollIntoView({behavior:'smooth'});});
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(b.dataset.edit));
  const maximum=Math.max(1,...days.map(d=>d.loss||0));byId('chart').innerHTML=days.map(d=>'<div class="bar-col"><span class="la-coverage">'+(d.target>0&&d.forecast!==null?fmt(d.forecast/d.target*100)+'%':'—')+'</span><strong>'+mark(d.loss,d.partial)+'</strong><div class="bar" style="height:'+(d.loss===null?0:d.loss/maximum*70)+'px"></div><span>'+label(d.date)+'</span></div>').join('');
  renderDepartments(days);
  fit();renderWipPicker();
 }
 function send(data){if(parent!==window)parent.postMessage(data,location.origin);}
 function edit(key){editing=key;const r=state.model.records.find(row=>row.key===key);byId('edit-context').textContent=label(r.date)+' · Line '+r.line+' · EWO '+r.ewo;byId('edit-balance').textContent='Allocated '+fmt(r.correctable)+' SAH can be reclassified; Print/EMB quantities stay fixed · '+r.reasonBasis+' · Only report-supported reasons may be applied';byId('edit-reason').innerHTML=reasons.filter(x=>(r.allowedReasons||['unknown']).includes(x[0])).map(x=>'<option value="'+x[0]+'" '+(x[0]===r.reason?'selected':'')+'>'+x[1]+'</option>').join('');byId('edit-note').value=r.manual?.note||'';byId('edit-note').maxLength=1000;byId('edit-error').textContent='';byId('edit-dialog').showModal();}
 byId('save-edit').onclick=()=>{if(busy||!state.model||!state.canCorrect)return;const note=byId('edit-note').value.trim();if(!note){byId('edit-error').textContent='Correction remarks are required.';return;}busy=true;byId('save-edit').disabled=true;send({type:'ekwl-load-analysis-correction',key:editing,reason:byId('edit-reason').value,note});};
 byId('cancel-edit').onclick=()=>{if(!busy)byId('edit-dialog').close();};
 byId('clear-overrides').onclick=()=>{if(busy||!state.canCorrect)return;busy=true;render();send({type:'ekwl-load-analysis-correction',action:'reset'});};
 byId('refresh-loss').onclick=()=>{status='';send({type:'ekwl-load-analysis-ready',refresh:true});};byId('show-all').onclick=()=>{sourceDate='';render();};

 const wipStages=['Cutable WIP','Print WIP','Embroidery WIP','Sewing WIP','Cutting WIP'],wipOrder=[0,4,1,2,3];
 function positionWipMenu(){const button=byId('la-view-wip-button'),menu=byId('la-view-wip-menu');if(!button||!wipMenuOpen)return;const r=button.getBoundingClientRect();menu.style.left=Math.max(10,Math.min(r.left,innerWidth-246))+'px';menu.style.top=Math.max(10,r.bottom+6+menu.offsetHeight>innerHeight?r.top-menu.offsetHeight-6:r.bottom+6)+'px';}
 function changeWipSelection(){renderWipPicker();send({type:'ekwl-load-analysis-wip',selected:[...selectedStages]});}
 function renderWipPicker(){const menu=byId('la-view-wip-menu'),button=byId('la-view-wip-button');if(!menu||!button)return;menu.hidden=!wipMenuOpen;button.setAttribute('aria-expanded',String(wipMenuOpen));button.onclick=()=>{wipMenuOpen=!wipMenuOpen;renderWipPicker()};menu.innerHTML=wipOrder.map(i=>'<label><input type="checkbox" value="'+i+'" '+(selectedStages.has(i)?'checked':'')+'>'+wipStages[i]+'</label>').join('')+'<div class="la-view-menu-foot"><button id="la-view-all">Select all</button><button id="la-view-clear">Clear</button></div><div class="la-view-menu-note">Fixed daily allocation · filter does not replenish stock.</div>';menu.querySelectorAll('input').forEach(c=>c.onchange=()=>{if(c.checked)selectedStages.add(Number(c.value));else selectedStages.delete(Number(c.value));changeWipSelection()});byId('la-view-all').onclick=()=>{selectedStages=new Set([0,1,2,3,4]);changeWipSelection()};byId('la-view-clear').onclick=()=>{selectedStages.clear();changeWipSelection()};const scope=byId('la-view-scope-stages');if(scope)scope.textContent=selectedStages.size===5?'All five WIP':selectedStages.size?[...selectedStages].map(i=>wipStages[i]).join(' + '):'No WIP selected';positionWipMenu();}
 document.addEventListener('click',e=>{if(wipMenuOpen&&!e.composedPath().some(n=>n.id==='la-view-wip-menu'||n.id==='la-view-wip-button')){wipMenuOpen=false;renderWipPicker()}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&wipMenuOpen){wipMenuOpen=false;renderWipPicker();byId('la-view-wip-button')?.focus()}});
 window.addEventListener('resize',positionWipMenu);document.addEventListener('scroll',e=>{if(wipMenuOpen&&!e.target.closest?.('#la-view-wip-menu')){wipMenuOpen=false;renderWipPicker()}},true);
 window.addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin)return;
  if(event.data?.type==='ekwl-load-analysis-plan'){if(Array.isArray(event.data.selected))selectedStages=new Set(event.data.selected.filter(i=>Number.isInteger(i)&&i>=0&&i<5));const changed=state.uploadId!==event.data.uploadId;state=event.data;if(!state.ready||changed){wipMenuOpen=false;departmentPinned=null;byId('edit-dialog').close();busy=false;editing=null;sourceDate='';status='';}render();}
  if(event.data?.type==='ekwl-load-analysis-correction-result'){busy=false;byId('save-edit').disabled=false;if(event.data.error){byId('edit-error').textContent=String(event.data.error);status=String(event.data.error);}else{byId('edit-dialog').close();status='Correction saved. Source report evidence is unchanged.';}render();}
 });
 new ResizeObserver(fit).observe(document.querySelector('.content'));render();send({type:'ekwl-load-analysis-ready'});
})();
