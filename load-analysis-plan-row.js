/* Same-origin parent supplies the selected snapshot and source-backed model. */
(()=>{
 const reasons=[['planning','Planning / Loading Gap','Planning'],['sample','Sample Pending','Merchant'],['accessories','Accessories Shortage','Store / Merchant'],['gsm','Fabric low GSM issue','Textile'],['fabric','Fabric balance shortage','Textile'],['wash','Panel wash challenge','Washing'],['print','Print Delayed','Print'],['emb','Embroidery Delayed','Embroidery'],['unknown','Unassigned Loss','Review required']];
 let state={ready:false},sourceDate='',editing=null,busy=false,status='';
 const byId=id=>document.getElementById(({summary:'load-analysis-summary-table','loss-table':'load-analysis-loss-table'})[id]||id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const label=d=>Number(d.slice(8))+'-'+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(d.slice(5,7))-1];
 const number=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
 const fmt=v=>number(v)===null?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:1});
 const reasonLabel=key=>reasons.find(r=>r[0]===key)?.[1]||key;
 const aggregate=values=>{const known=values.filter(v=>v!==null);return {total:known.length?known.reduce((a,b)=>a+b,0):null,avg:known.length?known.reduce((a,b)=>a+b,0)/known.length:null,partial:known.length<values.length};};
 const mark=(v,partial)=>fmt(v)+(number(v)!==null&&partial?'<sup class="la-partial" title="Available subtotal; some source data is unavailable">*</sup>':'');
 function cells(values,partials=[],clickable=false){return values.map((v,i)=>'<td data-plan-date="'+esc(state.dates[i])+'">'+(clickable&&v>0?'<button class="n" data-date="'+esc(state.dates[i])+'" title="View report evidence">'+mark(v,partials[i])+'</button>':mark(v,partials[i]))+'</td>').join('');}
 function row(name,values,partials=[],cls='',prefix=''){
  const a=aggregate(values),partial=a.partial||partials.some(Boolean);if(name==='Day-wise plan SAH:'){const active=values.filter(v=>v!==null&&v>0).length;a.avg=active?a.total/active:null;}
  return '<tr class="'+cls+'"><td class="label-col">'+esc(name)+'</td>'+prefix+cells(values,partials,!!prefix)+'<td><strong>'+mark(a.total,partial)+'</strong></td><td>'+mark(a.avg,partial)+'</td></tr>';
 }
 function fit(){for(const id of ['summary','loss-table']){const t=byId(id),wrap=t.parentElement,w=wrap.clientWidth;if(!w)continue;t.style.transform='none';t.style.width=Math.max(w,(state.dates?.length||0)*48+(id==='summary'?320:430))+'px';const scale=Math.min(1,w/t.offsetWidth);t.style.transformOrigin='top left';t.style.transform='scale('+scale+')';wrap.style.height=Math.ceil(t.offsetHeight*scale)+'px';}}
 function render(){
  const dates=state.ready&&Array.isArray(state.dates)?state.dates:[];state.dates=dates;
  const days=dates.map(date=>state.model?.days.find(day=>day.date===date)||{date,target:number(state.dailyCapacity),plan:number(state.totals?.[date]),forecast:null,loss:null,buckets:Object.fromEntries(reasons.map(r=>[r[0],null])),partial:false});
  const partial=days.map(d=>!!d.partial),records=state.model?.records||[],modelReady=!!state.model;
  document.querySelector('.period').textContent=dates.length?label(dates[0])+' '+dates[0].slice(0,4)+' – '+label(dates.at(-1))+' '+dates.at(-1).slice(0,4)+' · '+String(state.label||'Selected plan'):'Selected plan · data unavailable or loading';

  document.querySelector('#load-analysis-summary-table thead').innerHTML='<tr class="header-row"><th class="label-col">Date</th>'+dates.map(d=>'<th>'+label(d)+'</th>').join('')+'<th>Total</th><th>Average</th></tr>';
  document.querySelector('#load-analysis-summary-table tbody').innerHTML=row('CP Avg. SAH target/day:',dates.map(()=>number(state.dailyCapacity)))+row('Day-wise plan SAH:',dates.map(d=>number(state.totals?.[d])))+row('Gantt Forecastable SAH (source):',days.map(d=>d.ganttForecast??null),partial)+row('Less: Print + Embroidery WIP SAH:',days.map(d=>d.ganttForecast==null?null:(d.printSah||0)+(d.embSah||0)),partial)+row('Forecast achievable SAH:',days.map(d=>d.forecast),partial,'source-row')+row('SAH gap (Target − Forecast):',days.map(d=>d.loss),partial);
  document.querySelector('#load-analysis-loss-table thead').innerHTML='<tr><th colspan="'+(dates.length+4)+'" class="section-header">SAH Loss Reason Details · Automatic suggestions</th></tr><tr class="loss-header"><th>Loss reason</th><th>Responsible</th>'+dates.map(d=>'<th>'+label(d)+'</th>').join('')+'<th>Total</th><th>Average</th></tr>';
  document.querySelector('#load-analysis-loss-table tbody').innerHTML=reasons.map(([key,name,team])=>row(name,days.map(d=>d.buckets[key]),partial,key==='unknown'?'unassigned':key==='planning'?'planning':'','<td>'+esc(team)+'</td>')).join('')+row('Total assigned + unassigned',days.map(d=>d.loss),partial,'total-row','<td>Reconciled</td>');
  // Keep an explicit colgroup sized for the current date range.
  byId('loss-table').querySelector('colgroup').innerHTML='<col style="width:230px"><col style="width:120px"><col span="'+(dates.length+2)+'">';
  for(const [id,values,type] of [['target-avg',dates.map(()=>number(state.dailyCapacity)),'avg'],['forecast-avg',days.map(d=>d.forecast),'avg'],['variance-avg',days.map(d=>d.loss),'avg'],['total-loss',days.map(d=>d.loss),'total']]){const a=aggregate(values),p=a.partial||(id==='target-avg'?false:partial.some(Boolean));byId(id).innerHTML=mark(a[type],p);}
  byId('status-message').textContent=state.loading?'Loading WIP reports, evidence and saved corrections…':state.error||[status,...(state.messages||[]),...(state.model?.notes||[])].filter(Boolean).join(' · ');
  byId('manual-count').textContent='· '+records.filter(r=>r.manual).length+' saved correction(s) · private to your account';
  const gap=aggregate(days.map(d=>d.loss));byId('reconcile').textContent=modelReady?'Daily gap '+fmt(gap.total)+' SAH = reasons + Planning / Loading Gap + Unassigned. * marks available/provisional values.':'Forecast and loss attribution unavailable until required reports have loaded.';
  document.querySelector('#evidence tbody').innerHTML=records.filter(r=>!sourceDate||r.date===sourceDate).map(r=>'<tr><td>'+label(r.date)+'</td><td>Line '+r.line+'<br><strong>'+esc(r.ewo)+'</strong></td><td>'+fmt(r.plan)+'</td><td>'+mark(r.forecast,r.partial)+'</td><td>'+mark(r.attributed,r.partial)+'</td><td>'+esc((r.evidence.length?r.evidence.map(e=>e.text).join(' | '):'No explicit pending/issue evidence')+' · This date allocated: Print '+fmt(r.printPcs)+' pcs / '+fmt(r.printSah)+' SAH; EMB '+fmt(r.embPcs)+' pcs / '+fmt(r.embSah)+' SAH')+'</td><td>'+esc(r.attributed>0?Object.entries(r.contributions||{}).filter(([,v])=>v>0).map(([k,v])=>reasonLabel(k)+': '+fmt(v)).join(' | '):r.attributed===null?'Unavailable':'No loss')+(r.manual?'<br><span class="manual-count">Manual: '+esc(r.manual.note)+'</span>':'')+'</td><td>'+(r.correctable>0&&state.canCorrect?'<button class="edit" data-edit="'+esc(r.key)+'">Correct reason</button>':'—')+'</td></tr>').join('');
  byId('source-filter-note').textContent=sourceDate?label(sourceDate)+' · Source evidence':'All selected-plan dates · Latest uploaded report evidence';
  byId('save-edit').disabled=busy||!modelReady||!state.canCorrect;
  byId('clear-overrides').disabled=!modelReady||!state.canCorrect||busy;
  byId('refresh-loss').disabled=busy||!!state.loading;
  document.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{sourceDate=b.dataset.date;render();byId('sources').open=true;byId('sources').scrollIntoView({behavior:'smooth'});});
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(b.dataset.edit));
  const maximum=Math.max(1,...days.map(d=>d.loss||0));byId('chart').innerHTML=days.map(d=>'<div class="bar-col"><span class="la-coverage">'+(d.target>0&&d.forecast!==null?fmt(d.forecast/d.target*100)+'%':'—')+'</span><strong>'+mark(d.loss,d.partial)+'</strong><div class="bar" style="height:'+(d.loss===null?0:d.loss/maximum*70)+'px"></div><span>'+label(d.date)+'</span></div>').join('');
  fit();
 }
 function send(data){if(parent!==window)parent.postMessage(data,location.origin);}
 function edit(key){editing=key;const r=state.model.records.find(row=>row.key===key);byId('edit-context').textContent=label(r.date)+' · Line '+r.line+' · EWO '+r.ewo;byId('edit-balance').textContent='Allocated '+fmt(r.correctable)+' SAH can be reclassified; Print/EMB quantities stay fixed · Auto suggestion: '+reasonLabel(r.auto)+' · SAH amount stays unchanged';byId('edit-reason').innerHTML=reasons.filter(x=>!['planning','print','emb'].includes(x[0])).map(x=>'<option value="'+x[0]+'" '+(x[0]===r.reason?'selected':'')+'>'+x[1]+'</option>').join('');byId('edit-note').value=r.manual?.note||'';byId('edit-note').maxLength=1000;byId('edit-error').textContent='';byId('edit-dialog').showModal();}
 byId('save-edit').onclick=()=>{if(busy||!state.model||!state.canCorrect)return;const note=byId('edit-note').value.trim();if(!note){byId('edit-error').textContent='Correction remarks are required.';return;}busy=true;byId('save-edit').disabled=true;send({type:'ekwl-load-analysis-correction',key:editing,reason:byId('edit-reason').value,note});};
 byId('cancel-edit').onclick=()=>{if(!busy)byId('edit-dialog').close();};
 byId('clear-overrides').onclick=()=>{if(busy||!state.canCorrect)return;busy=true;render();send({type:'ekwl-load-analysis-correction',action:'reset'});};
 byId('refresh-loss').onclick=()=>{status='';send({type:'ekwl-load-analysis-ready',refresh:true});};byId('show-all').onclick=()=>{sourceDate='';render();};
 window.addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin)return;
  if(event.data?.type==='ekwl-load-analysis-plan'){const changed=state.uploadId!==event.data.uploadId;state=event.data;if(!state.ready||changed){byId('edit-dialog').close();busy=false;editing=null;sourceDate='';status='';}render();}
  if(event.data?.type==='ekwl-load-analysis-correction-result'){busy=false;byId('save-edit').disabled=false;if(event.data.error){byId('edit-error').textContent=String(event.data.error);status=String(event.data.error);}else{byId('edit-dialog').close();status='Correction saved for your account and selected plan.';}render();}
 });
 new ResizeObserver(fit).observe(document.querySelector('.content'));render();send({type:'ekwl-load-analysis-ready'});
})();
