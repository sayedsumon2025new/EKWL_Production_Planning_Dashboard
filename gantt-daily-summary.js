/* Date-aligned planning totals. Existing Gantt coverage/popup calculations stay independent. */
const GDS_STAGES=['Cutable WIP','Print WIP','Embroidery WIP','Sewing WIP','Cutting WIP'];
// Stable indices preserve Print/Embroidery delay attribution in Load Analysis.
const GDS_STAGE_ORDER=[0,4,1,2,3],GDS_PRIORITY=[3,4,2,1,0];
let GDS_STATE={hidden:true,selected:new Set(GDS_STAGES.map((_,i)=>i)),open:false,context:null,source:null,request:0};
const gdsKey=v=>String(v??'').trim().toUpperCase().replace(/\.0+$/,'');
function gdsNumber(v){if(v==null||String(v).trim()==='')return null;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:null;}
function gdsSum(rows,get){if(!rows.length)return null;const values=rows.map(get);return values.some(v=>v===null)?null:values.reduce((a,b)=>a+b,0);}
function gdsReportSum(rows,get){const values=rows.map(get).filter(v=>v!==null);return {value:values.length?values.reduce((a,b)=>a+b,0):null,partial:values.length<rows.length};}
function gdsUniqueDaily(rows){const seen=new Set();return rows.filter(row=>{if(row.record_id==null)return true;const key=row.record_id+'|'+row.date;if(seen.has(key))return false;seen.add(key);return true;});}
function gdsGroup(rows,key){const map=new Map();for(const row of rows){const k=key(row);if(!map.has(k))map.set(k,[]);map.get(k).push(row);}return map;}
// Planning KPIs reconcile to the selected CSV's own criteria rows, including
// signed corrections and source metrics on dates without positive Plan/Day.
// Inventory allocation below uses positive NET Line/EWO demand independently.
function gdsPlanningTotals(input){
 const lines=new Set(input.lines.map(Number)),dates=new Set(input.dates),search=gdsKey(input.search);
 const exact=Array.isArray(input.metrics)&&input.metrics.some(row=>['Plan/Day','SAH/Day','Clock Hour/Day'].includes(String(row.criteria||'').trim()));
 const source=criteria=>exact?input.metrics.filter(row=>String(row.criteria||'').trim()===criteria):criteria==='Plan/Day'?input.plan:criteria==='SAH/Day'?input.sah:input.clock;
 const scoped=rows=>gdsUniqueDaily(rows).filter(row=>lines.has(Number(row.line))&&dates.has(row.date));
 const plan=scoped(source('Plan/Day')).filter(row=>!search||gdsKey(row.ewo)===search);
 function metric(criteria){const rows=scoped(source(criteria));if(!search)return rows;const matches=rows.filter(row=>gdsKey(row.ewo)===search),planned=new Set(plan.map(row=>JSON.stringify([row.date,Number(row.line)]))),matched=new Set(matches.map(row=>JSON.stringify([row.date,Number(row.line)])));
  return [...matches,...rows.filter(row=>!gdsKey(row.ewo)&&planned.has(JSON.stringify([row.date,Number(row.line)]))&&!matched.has(JSON.stringify([row.date,Number(row.line)])))];
 }
 const sah=metric('SAH/Day'),clock=metric('Clock Hour/Day');
 return new Map(input.dates.map(date=>{const p=plan.filter(row=>row.date===date),a=sah.filter(row=>row.date===date),c=clock.filter(row=>row.date===date),qty=p.length?gdsSum(p,row=>gdsNumber(row.value)):0;
  let planSah=a.length?gdsSum(a,row=>gdsNumber(row.value)):qty===0?0:null,derived=false;
  if(!a.length&&p.length&&!exact){planSah=gdsSum(p,row=>gdsNumber(row.smv)>0?gdsNumber(row.value)*gdsNumber(row.smv)/60:null);derived=planSah!==null;}
  return [date,{qty,sah:planSah,clock:c.length?gdsSum(c,row=>gdsNumber(row.value)):qty===0?0:null,derived,counts:[p.length,a.length,c.length],signedPlanAdjustment:p.reduce((n,row)=>n+Math.min(0,gdsNumber(row.value)||0),0)}];
 }));
}
// Compute the received cutting stock per color, then pool by EWO for the
// approved color-independent planning allocation. Sewing input spans all lines.
function gdsCuttingReports(input,notes){
 const ids=new Set([...input.plan,...input.fabric,...input.data].map(r=>gdsKey(r.ewo)).filter(Boolean));
 const missing=reason=>new Map([...ids].map(ewo=>[ewo,{value:null,partial:false,reason}]));
 if(typeof s12CuttingWipMetric!=='function'||typeof fabricEwoColorKey!=='function'||typeof s12EmbellishmentTotals!=='function')return missing('Cutting WIP calculator unavailable.');
 const pairKeys=new Map(),cuts=new Map(),sewing=new Map(),process=new Map();
 const pair=(ewo,color)=>{const key=fabricEwoColorKey(ewo,color),id=gdsKey(ewo);if(key){if(!pairKeys.has(id))pairKeys.set(id,new Set());pairKeys.get(id).add(key);}return key;};
 const required=v=>!['','no','n','0','false','n/a','na','none','-','—'].includes(String(v??'').trim().toLowerCase());
 for(const r of input.fabric){const key=pair(r.ewo,r.color_name),qty=gdsNumber(r.total_cut_qty);if(key&&qty!==null)cuts.set(key,(cuts.get(key)||0)+qty);}
 for(const r of input.sewing){const key=pair(r.ewo,r.color);if(key)sewing.set(key,{input:(sewing.get(key)?.input||0)+(gdsNumber(r.input)||0)});}
 for(const r of input.data){if(r.is_summary_row)continue;const key=pair(r.ewo,r.color);if(!key)continue;const flags=process.get(key)||{print:false,emb:false};flags.print||=required(r.print);flags.emb||=required(r.emb);process.set(key,flags);}
 for(const r of input.embellishment||[])pair(r['EWO No'],r.Color);
 const moves=s12EmbellishmentTotals(input.embellishment||[]),reports=new Map();
 for(const ewo of ids){
  const keys=pairKeys.get(ewo)||new Set();let total=0,known=0,partial=false;
  for(const key of keys){const metric=s12CuttingWipMetric([key],cuts,sewing,process,moves,input.embellishmentAvailable!==false);
   if(metric.value===null){partial=true;if(metric.reason)notes.add('Cutting WIP: '+metric.reason);continue;}
   if(metric.value<0)notes.add('Negative report WIP is displayed as zero.');
   if(metric.reason)partial=true;
   total+=Math.max(0,metric.value);known++;
  }
  reports.set(ewo,{value:known?total:null,partial});
 }
 return reports;
}
// Allocate the full snapshot before applying display filters. Sewing is line/EWO
// stock; upstream stock is shared by EWO. Colors never participate in allocation.
function gdsAllocate(input,notes){
 const master=input.masterLines?new Set(input.masterLines.map(Number)):null;
 const sourcePlan=gdsUniqueDaily(input.plan).filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&Number(row.line)>0&&Number(row.line)!==46&&(!master||master.has(Number(row.line)))&&gdsKey(row.ewo)&&gdsNumber(row.value)!==null);
 const net=gdsGroup(sourcePlan,row=>JSON.stringify([row.date,Number(row.line),gdsKey(row.ewo)]));
 const plan=[...net.values()].map(rows=>({...rows[0],value:rows.reduce((n,row)=>n+gdsNumber(row.value),0)})).filter(row=>row.value>0);
 const cutoff=(input.production||[]).map(row=>String(row.output_date||'').slice(0,10)).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)).sort().at(-1)||'';
 const fabric=gdsGroup(input.fabric,row=>gdsKey(row.ewo)),em=gdsGroup(input.embellishment||[],row=>gdsKey(row['EWO No'])),data=gdsGroup(input.data,row=>gdsKey(row.ewo));
 const sewing=gdsGroup(input.sewing,row=>JSON.stringify([Number(row.line_no),gdsKey(row.ewo)]));
 const shared=new Map(),lineStock=new Map(),allocations=new Map(),cutting=gdsCuttingReports(input,notes);
 const clean=report=>{if(report.value<0)notes.add('Negative report WIP is displayed as zero.');return {...report,value:report.value===null?null:Math.max(0,report.value)};};
 function upstream(ewo){
  if(shared.has(ewo))return shared.get(ewo);
  const rows=em.get(ewo)||[],meta=data.get(ewo)||[];
  const notRequired=field=>meta.length>0&&meta.every(row=>['no','n','n/a','none','not applicable'].includes(String(row[field]??'').trim().toLowerCase()));
  const difference=(send,receive,flag)=>!rows.length?{value:notRequired(flag)?0:null,partial:false}:gdsReportSum(rows,row=>{const a=gdsNumber(row[send]),b=gdsNumber(row[receive]);return a===null||b===null?null:a-b;});
  const reports=[gdsReportSum(fabric.get(ewo)||[],row=>gdsNumber(row.cutable_qty)),difference('Today Print Send Qty\n',' Today Print Receive Qty','print'),difference('Today EMB Send Qty','Today EMB Receive Qty','emb'),cutting.get(ewo)||{value:null,partial:false}].map(clean);
  shared.set(ewo,reports);return reports;
 }
 const byDate=gdsGroup(plan,row=>row.date);
 for(const date of [...byDate.keys()].sort()){
  if(!cutoff||date<=cutoff)continue;
  const byEwo=gdsGroup(byDate.get(date),row=>gdsKey(row.ewo));
  for(const [ewo,rows] of byEwo){
   const reports=upstream(ewo),groups=gdsGroup(rows,row=>Number(row.line));
   const cells=[...groups].sort(([a],[b])=>a-b).map(([line,entries])=>{
    const key=JSON.stringify([line,ewo]);
    if(!lineStock.has(key))lineStock.set(key,clean(gdsReportSum(sewing.get(key)||[],row=>gdsNumber(row.wip))));
    const source=lineStock.get(key),demand=entries.reduce((n,row)=>n+gdsNumber(row.value),0);
    const used=source.value===null?null:Math.min(source.value,demand);
    if(used!==null)source.value-=used;
    const sources=[...reports.slice(0,3),source,reports[3]],meta=(data.get(ewo)||[]).filter(row=>Number(row.line)===line);
    const smvs=[...new Set(meta.map(row=>gdsNumber(row.smv)).filter(v=>v!==null&&v>0))];
    const item={line,ewo,date,qty:demand,need:demand-(used||0),stages:sources.map((report,i)=>i===3?used:report.value===null?null:0),stagePartial:sources.map((report,i)=>report.partial||GDS_PRIORITY.slice(0,GDS_PRIORITY.indexOf(i)).some(j=>sources[j].value===null||sources[j].partial)),smv:smvs.length===1?smvs[0]:null};
    allocations.set(JSON.stringify([date,line,ewo]),item);return item;
   });
   for(const stage of [4,2,1,0]){
    const report=reports[stage===4?3:stage];if(report.value===null)continue;
    const demand=cells.reduce((n,item)=>n+item.need,0),available=Math.min(report.value,demand);if(!demand)continue;
    // Same-date shared stock follows unmet demand proportions, independent of
    // selected line. Whole-piece quotas use largest remainders with line tie-break.
    const shares=cells.map(item=>({item,amount:available*item.need/demand}));
    if(Number.isInteger(available)&&cells.every(item=>Number.isInteger(item.need))){
     let remainder=available;for(const share of shares){share.fraction=share.amount-Math.floor(share.amount);share.amount=Math.floor(share.amount);remainder-=share.amount;}
     const ranked=[...shares].sort((a,b)=>b.fraction-a.fraction||a.item.line-b.item.line);for(let i=0;i<remainder;i++)ranked[i].amount++;
    }
    for(const {item,amount} of shares){item.stages[stage]=amount;item.need=Math.max(0,item.need-amount);if(amount>0&&item.stagePartial[stage])report.partial=true;}
    report.value=Math.max(0,report.value-available);
   }
  }
 }
 if(!cutoff)notes.add('Upload Date Wise Actual Production Report to establish the stock baseline; forecast coverage shows — until a production cutoff is available.');
 return {plan,cutoff,allocations};
}
function buildGanttDailySummary(input,precomputed){
 const selected=new Set(input.selected),lineSet=new Set(input.lines.map(Number)),dateSet=new Set(input.dates),search=gdsKey(input.search),notes=new Set(precomputed?.notes||[]);
 const allocation=precomputed?.allocation||gdsAllocate(input,notes),planning=gdsPlanningTotals(input);
 const plan=allocation.plan.filter(row=>dateSet.has(row.date)&&lineSet.has(Number(row.line))&&(!search||gdsKey(row.ewo)===search));
 const byDate=gdsGroup(plan,row=>row.date),dataByLine=gdsGroup(input.data,row=>Number(row.line));
 const days=input.dates.map(date=>{
  const rows=byDate.get(date)||[],activeLines=new Set(rows.map(row=>Number(row.line)));
  const source=planning.get(date),qty=source.qty,sah=source.sah,clock=source.clock;
  if(source.derived)notes.add('Some Plan SAH values are derived from Plan Pcs × SMV ÷ 60.');
  if(source.signedPlanAdjustment<0)notes.add('Planning totals include signed CSV adjustments; WIP follows positive net Line/EWO demand.');
  let manpower=0,manpowerKnown=true;
  for(const line of activeLines){
   const mps=[...new Set((dataByLine.get(line)||[]).map(row=>gdsNumber(row.manpower)).filter(v=>v!==null&&v>0))];
   if(mps.length!==1)manpowerKnown=false;else manpower+=mps[0];
  }
  if(clock===null)notes.add('Some source dates have no Clock Hour/Day.');
  if(!manpowerKnown){manpower=null;notes.add('Some scheduled lines have missing or conflicting Manpower.');}
  let forecast=0,forecastSah=0,selectedKnown=0,sahKnown=0,missingSmv=0;
  const stages=GDS_STAGES.map(()=>0),stageKnown=GDS_STAGES.map(()=>0),stagePartial=GDS_STAGES.map(()=>false),stageSah=GDS_STAGES.map(()=>0),stageSahKnown=GDS_STAGES.map(()=>0),stageSahPartial=GDS_STAGES.map(()=>false);
  let forecastPartial=false;
  const keys=new Set(rows.map(row=>JSON.stringify([date,Number(row.line),gdsKey(row.ewo)])));
  for(const key of keys){
   const item=allocation.allocations.get(key);if(!item)continue;
   let pcs=0,known=0;
   item.stages.forEach((value,i)=>{
    if(value===null){stagePartial[i]=true;if(selected.has(i))forecastPartial=true;}
    else {stages[i]+=value;stageKnown[i]++;if(item.stagePartial[i])stagePartial[i]=true;
     if(value===0||item.smv!==null){stageSah[i]+=value*(item.smv||0)/60;stageSahKnown[i]++;}else stageSahPartial[i]=true;
     if(selected.has(i)){pcs+=value;known++;selectedKnown++;if(item.stagePartial[i])forecastPartial=true;}}
   });
   forecast+=pcs;
   if(known){if(pcs>0&&item.smv===null)missingSmv++;else {forecastSah+=pcs*(item.smv||0)/60;sahKnown++;}}
  }
  const hasEwos=keys.size>0,beforeBaseline=!allocation.cutoff||date<=allocation.cutoff;
  stages.forEach((_,i)=>{if((hasEwos&&!stageKnown[i])||beforeBaseline)stages[i]=null;if((hasEwos&&!stageSahKnown[i])||beforeBaseline)stageSah[i]=null;stageSahPartial[i]||=stagePartial[i];});
  if(beforeBaseline||(selected.size&&hasEwos&&!selectedKnown))forecast=null;
  if(beforeBaseline||(selected.size&&hasEwos&&!sahKnown))forecastSah=null;
  const sahPartial=forecastPartial||missingSmv>0;
  if(forecastPartial)notes.add('* Available WIP subtotal: some report fields are missing; allocation uses known stock only and stage attribution may be incomplete. No matched data shows —.');
  if(missingSmv)notes.add('* Available SAH subtotal excludes covered pieces with missing/conflicting EWO SMV. No convertible data shows —.');
  const knownStages=stages.filter(v=>v!==null);
  return {date,sourceRecordCounts:source.counts,signedPlanAdjustment:source.signedPlanAdjustment,values:[clock,sah,qty,forecast,forecastSah,clock>0&&sah!==null?sah/clock*100:null,manpower>0&&clock!==null?clock/manpower:null,manpower],partial:[false,false,false,forecastPartial,sahPartial,false,false,false],stages,stagePartial,stageSah,stageSahPartial,total:knownStages.length?knownStages.reduce((a,b)=>a+b,0):null,totalPartial:stagePartial.some(Boolean)};
 });
 return {days,notes:[...notes],cutoff:allocation.cutoff};
}
function gdsFormat(value,index){if(value===null)return '—';const text=Number(value).toLocaleString('en-US',{maximumFractionDigits:index===2||index===3||index===7?0:1});return text+(index===5?'%':'');}
function gdsSubtotalMark(value,partial){return value!==null&&partial?' <sup class="gds-partial" title="Available data subtotal; some source values are unavailable" aria-label="Available data subtotal">*</sup>':'';}
function gdsInput(context,embellishment){return {embellishmentAvailable:!GDS_STATE.source?.loading&&!GDS_STATE.source?.error,dates:context.dates,lines:context.lines,search:context.search,selected:[...GDS_STATE.selected],data:DATA,plan:DAILY_PLAN,sah:SAH_DAILY,clock:CLOCK_HOUR_DAILY,fabric:FABRIC_CUTTING_DATA,sewing:SEWING_IO_DATA,embellishment,metrics:typeof EFF15_METRIC_DAILY==='undefined'?undefined:EFF15_METRIC_DAILY,production:DATE_WISE_PRODUCTION_DATA,masterLines:[...getChassisMasterLines()]};}
function paintGanttDailySummary(){
 const context=GDS_STATE.context,body=document.getElementById('gantt-daily-summary');if(!context||!body)return;
 const lowerDetails=document.getElementById('gds-consumable-table')?.closest('details');
 if(lowerDetails&&!lowerDetails.dataset.gdsToggleBound){lowerDetails.dataset.gdsToggleBound='1';lowerDetails.addEventListener('toggle',()=>paintGanttDailySummary());}
 if(GDS_STATE.hidden&&!lowerDetails?.open){
  body.hidden=true;body.closest('table')?.classList.remove('gds-visible');
  const note=document.getElementById('gds-note');if(note)note.hidden=true;
  const button=document.getElementById('gds-visibility');if(button){button.textContent='Show summary ▾';button.setAttribute('aria-expanded','false');}
  const head=document.querySelector('#s11-head th');if(head)head.textContent='Team';
  return;
 }
 const reportsReady=typeof sharedReportsReady!=='function'||sharedReportsReady(['fabric','sewing','production']);
 const input=gdsInput(context,GDS_STATE.source?.rows||[]);
 if(!reportsReady){input.fabric=[];input.sewing=[];input.production=[];input.embellishment=[];input.embellishmentAvailable=false;}
 const result=buildGanttDailySummary(input);
 if(!reportsReady){
  for(const day of result.days){day.values[3]=day.values[4]=day.total=null;day.stages=day.stages.map(()=>null);day.stageSah=day.stageSah.map(()=>null);day.partial[3]=day.partial[4]=false;}
  result.notes=['WIP reports are loading or unavailable. Forecast and stock values remain unavailable until verification finishes.'];
 }
 const count=GDS_STATE.selected.size,colspan=context.dates.length+1;
 const picker='<div class="gds-picker"><button type="button" id="gds-filter-button" aria-expanded="'+GDS_STATE.open+'" aria-controls="gds-filter-menu" onclick="gdsToggleMenu()">Consumable WIP · '+(count===GDS_STAGES.length?'All '+GDS_STAGES.length:count+' selected')+' ▾</button><div id="gds-filter-menu" class="gds-menu" role="group" aria-label="Select consumable WIP categories" '+(GDS_STATE.open?'':'hidden')+'>'+GDS_STAGE_ORDER.map(i=>{const name=GDS_STAGES[i];return '<label><input type="checkbox" value="'+i+'" '+(GDS_STATE.selected.has(i)?'checked':'')+' onchange="gdsSelectStage(this)">'+name+'</label>'}).join('')+'<div class="gds-menu-actions"><button type="button" onclick="gdsSelectAll(true)">Select all</button><button type="button" onclick="gdsSelectAll(false)">Clear</button></div></div></div>';
 body.innerHTML='<tr class="gds-controls"><td colspan="'+colspan+'"><div class="gds-control-row"><span>DAILY PLAN SUMMARY</span>'+picker+'</div></td></tr>';
 const labels=['Clock Hour','Plan SAH','Plan Pcs','Forecastable Pcs','Forecastable SAH','Plan Efficiency','Plan Working Hours','Plan Manpower'];
 const units=['h','h','pcs','pcs','h','%','h','people'];
 body.innerHTML+=labels.map((label,i)=>'<tr class="gds-metric '+([1,2,4].includes(i)?'gds-emphasis':'')+'"><th scope="row">'+label+'</th>'+result.days.map(day=>'<td>'+gdsFormat(day.values[i],i)+gdsSubtotalMark(day.values[i],day.partial[i])+(day.values[i]===null||i===5?'':' <small>'+units[i]+'</small>')+'</td>').join('')+'</tr>').join('');
 body.innerHTML+='<tr class="gds-divider"><th>Team / EWO</th>'+context.dates.map(date=>'<th>'+esc(date.slice(8)+'-'+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(date.slice(5,7))-1]+'-'+date.slice(2,4))+'</th>').join('')+'</tr>';
 body.hidden=GDS_STATE.hidden;
 const wrap=body.closest('.gantt-wrap'),controls=body.querySelector('.gds-control-row');
 if(wrap&&controls)controls.style.width=Math.max(270,wrap.clientWidth-24)+'px';
 if(wrap&&!wrap.dataset.gdsResizeBound&&typeof ResizeObserver!=='undefined'){wrap.dataset.gdsResizeBound='1';new ResizeObserver(()=>{const row=body.querySelector('.gds-control-row');if(row)row.style.width=Math.max(270,wrap.clientWidth-24)+'px';}).observe(wrap);}
 const table=body.closest('table');table?.classList.toggle('gds-visible',!GDS_STATE.hidden);
 const head=document.querySelector('#s11-head th');if(head)head.textContent=GDS_STATE.hidden?'Team':'Planning metric';
 const button=document.getElementById('gds-visibility');if(button){button.textContent=GDS_STATE.hidden?'Show summary ▾':'Hide summary ▴';button.setAttribute('aria-expanded',String(!GDS_STATE.hidden));}
 const note=document.getElementById('gds-note');if(note){note.hidden=GDS_STATE.hidden;note.textContent='Forecast: '+(count===GDS_STAGES.length?'All consumable WIP':count?[...GDS_STATE.selected].map(i=>GDS_STAGES[i]).join(' + '):'None selected')+' · Daily allocated plan coverage; Line + EWO, all colors. Sewing → Cutting → Embroidery → Print → Cutable; used stock is deducted before later dates. Filter sums stage contributions without reallocating stock. SAH = Σ(covered EWO pcs × EWO SMV ÷ 60).'+(result.cutoff?' Stock baseline through '+result.cutoff+'; dates through baseline show —.':'')+(GDS_STATE.source?.loading?' Loading Print/Embroidery WIP…':'')+(GDS_STATE.source?.error?' Print/Embroidery report could not load.':'')+(result.notes.length?' '+result.notes.join(' '):'');}
 const lower=document.getElementById('gds-consumable-table');if(lower){
  lower.innerHTML='<thead><tr><th>Consumable WIP</th>'+context.dates.map(date=>'<th>'+esc(date.slice(8)+'-'+date.slice(5,7)+'-'+date.slice(2,4))+'</th>').join('')+'</tr></thead><tbody>'+GDS_STAGE_ORDER.map(i=>{const label=GDS_STAGES[i];return '<tr><th scope="row">'+label+'</th>'+result.days.map(day=>'<td>'+gdsFormat(day.stages[i],3)+gdsSubtotalMark(day.stages[i],day.stagePartial[i])+'</td>').join('')+'</tr>'}).join('')+'<tr class="gds-lower-total"><th>Total → Daily cover</th>'+result.days.map(day=>'<td>'+gdsFormat(day.total,3)+gdsSubtotalMark(day.total,day.totalPartial)+'</td>').join('')+'</tr></tbody>';
 }
 const lowerNote=document.getElementById('gds-consumable-note');if(lowerNote)lowerNote.textContent=count===GDS_STAGES.length?'Total daily cover = Forecastable Pcs above. Balances carry forward; shared EWO stock is allocated once across all lines before filters.':'This table retains all stage allocations; the upper forecast sums selected contributions. Filter changes do not reassign stock or reset prior-day consumption.';
}
function renderGanttDailySummary(context){
 if(!document.getElementById('gantt-daily-summary'))return;
 GDS_STATE.context=context;const request=++GDS_STATE.request,generation=SITE_SESSION_GENERATION,owner=SITE_AUTH_USER?.id;
 GDS_STATE.source={loading:true,rows:[],error:false};paintGanttDailySummary();
 const ids=[...new Set(DAILY_PLAN.filter(row=>context.dates.includes(row.date)&&context.lines.includes(Number(row.line))&&(!context.search||gdsKey(row.ewo)===gdsKey(context.search))).map(row=>String(row.ewo)))];
 if(!ids.length){GDS_STATE.source={loading:false,rows:[],error:false};paintGanttDailySummary();return;}
 // Load the active report before local EWO normalization; exact text IN filters
 // can omit source identifiers such as a numeric EWO saved with a .0 suffix.
 loadEwoSource('embellishment').then(rows=>{
  if(request!==GDS_STATE.request||generation!==SITE_SESSION_GENERATION||owner!==SITE_AUTH_USER?.id)return;
  GDS_STATE.source={loading:false,rows,error:false};paintGanttDailySummary();
 }).catch(()=>{if(request!==GDS_STATE.request||generation!==SITE_SESSION_GENERATION||owner!==SITE_AUTH_USER?.id)return;GDS_STATE.source={loading:false,rows:[],error:true};paintGanttDailySummary();});
}
function gdsToggleVisibility(){GDS_STATE.hidden=!GDS_STATE.hidden;GDS_STATE.open=false;paintGanttDailySummary();}
function gdsToggleMenu(){GDS_STATE.open=!GDS_STATE.open;const menu=document.getElementById('gds-filter-menu'),button=document.getElementById('gds-filter-button');if(menu)menu.hidden=!GDS_STATE.open;if(button)button.setAttribute('aria-expanded',String(GDS_STATE.open));}
function gdsSelectStage(input){const value=Number(input.value);if(input.checked)GDS_STATE.selected.add(value);else GDS_STATE.selected.delete(value);const focus=input.value;paintGanttDailySummary();document.querySelector('#gds-filter-menu input[value="'+focus+'"]')?.focus();}
function gdsSelectAll(all){GDS_STATE.selected=new Set(all?GDS_STAGES.map((_,i)=>i):[]);paintGanttDailySummary();}
function resetGanttDailySummary(){++GDS_STATE.request;GDS_STATE={...GDS_STATE,hidden:true,selected:new Set(GDS_STAGES.map((_,i)=>i)),open:false,context:null,source:null};for(const id of ['gantt-daily-summary','gds-consumable-table','gds-note','gds-consumable-note']){const el=document.getElementById(id);if(el)el.textContent='';}}
if(typeof document!=='undefined'&&document.addEventListener){
 document.addEventListener('click',event=>{if(GDS_STATE.open&&!event.target.closest('.gds-picker'))gdsToggleMenu();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&GDS_STATE.open){gdsToggleMenu();document.getElementById('gds-filter-button')?.focus();}});
}
