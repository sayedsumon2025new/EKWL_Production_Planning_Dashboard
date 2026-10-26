/* Date-aligned planning totals. Existing Gantt coverage/popup calculations stay independent. */
const GDS_STAGES=['Cutable WIP','Print WIP','Embroidery WIP','Sewing WIP'];
let GDS_STATE={hidden:true,selected:new Set([0,1,2,3]),open:false,context:null,source:null,request:0};
const gdsKey=v=>String(v??'').trim().toUpperCase().replace(/\.0+$/,'');
function gdsNumber(v){if(v==null||String(v).trim()==='')return null;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:null;}
function gdsSum(rows,get){if(!rows.length)return null;const values=rows.map(get);return values.some(v=>v===null)?null:values.reduce((a,b)=>a+b,0);}
function gdsReportSum(rows,get){const values=rows.map(get).filter(v=>v!==null);return {value:values.length?values.reduce((a,b)=>a+b,0):null,partial:values.length<rows.length};}
function gdsUniqueDaily(rows){const seen=new Set();return rows.filter(row=>{if(row.record_id==null)return true;const key=row.record_id+'|'+row.date;if(seen.has(key))return false;seen.add(key);return true;});}
function gdsGroup(rows,key){const map=new Map();for(const row of rows){const k=key(row);if(!map.has(k))map.set(k,[]);map.get(k).push(row);}return map;}
function buildGanttDailySummary(input){
 const selected=new Set(input.selected),lineSet=new Set(input.lines.map(Number)),dateSet=new Set(input.dates),search=gdsKey(input.search);
 const plan=gdsUniqueDaily(input.plan).filter(row=>dateSet.has(row.date)&&lineSet.has(Number(row.line))&&gdsNumber(row.value)>0&&(!search||gdsKey(row.ewo)===search));
 const byDate=gdsGroup(plan,row=>row.date),dataByEwo=gdsGroup(input.data,row=>gdsKey(row.ewo)),dataByLine=gdsGroup(input.data,row=>Number(row.line));
 const sahByDate=gdsGroup(gdsUniqueDaily(input.sah),row=>row.date),clockByDate=gdsGroup(gdsUniqueDaily(input.clock),row=>row.date);
 const fabricByEwo=gdsGroup(input.fabric,row=>gdsKey(row.ewo)),sewingByEwo=gdsGroup(input.sewing,row=>gdsKey(row.ewo)),emByEwo=gdsGroup(input.embellishment||[],row=>gdsKey(row['EWO No']));
 const stockCache=new Map(),notes=new Set();
 function stock(ewo,activeLines){
  const cacheKey=ewo+'|'+[...activeLines].sort((a,b)=>a-b).join(',');if(stockCache.has(cacheKey))return stockCache.get(cacheKey);
  const data=(dataByEwo.get(ewo)||[]).filter(row=>activeLines.has(Number(row.line)));
  const fabric=fabricByEwo.get(ewo)||[],sewing=(sewingByEwo.get(ewo)||[]).filter(row=>activeLines.has(Number(row.line_no))),em=emByEwo.get(ewo)||[];
  const nonnegative=v=>{if(v===null)return null;if(v<0)notes.add('Negative report WIP is displayed as zero.');return Math.max(0,v);};
  const notRequired=field=>data.length>0&&data.every(row=>['no','n','n/a','none','not applicable'].includes(String(row[field]??'').trim().toLowerCase()));
  function emWip(send,received,flag){
   if(!em.length)return {value:notRequired(flag)?0:null,partial:false};
   return gdsReportSum(em,row=>{const sent=gdsNumber(row[send]),recv=gdsNumber(row[received]);return sent===null||recv===null?null:sent-recv;});
  }
  const reports=[gdsReportSum(fabric,row=>gdsNumber(row.cutable_qty)),
   emWip('Today Print Send Qty\n',' Today Print Receive Qty','print'),
   emWip('Today EMB Send Qty','Today EMB Receive Qty','emb'),
   gdsReportSum(sewing,row=>gdsNumber(row.wip))];
  const stages=reports.map(report=>nonnegative(report.value));
  const smvs=[...new Set(data.map(row=>gdsNumber(row.smv)).filter(v=>v!==null&&v>0))];
  const result={stages,stagePartial:reports.map(report=>report.partial),smv:smvs.length===1?smvs[0]:null};stockCache.set(cacheKey,result);return result;
 }
 const days=input.dates.map(date=>{
  const rows=byDate.get(date)||[],activeLines=new Set(rows.map(row=>Number(row.line))),ewoLines=new Map();
  for(const row of rows){const ewo=gdsKey(row.ewo);if(!ewoLines.has(ewo))ewoLines.set(ewo,new Set());ewoLines.get(ewo).add(Number(row.line));}
  const qty=rows.reduce((n,row)=>n+gdsNumber(row.value),0);
  const matches=row=>activeLines.has(Number(row.line))&&(!search||!gdsKey(row.ewo)||gdsKey(row.ewo)===search);
  const sahRows=(sahByDate.get(date)||[]).filter(matches);
  let sah=gdsSum(sahRows,row=>gdsNumber(row.value));
  if(!sahRows.length&&rows.length){sah=gdsSum(rows,row=>{const smv=gdsNumber(row.smv);return smv>0?gdsNumber(row.value)*smv/60:null;});if(sah!==null)notes.add('Some Plan SAH values are derived from Plan Pcs × SMV ÷ 60.');}
  if(!rows.length)sah=0;
  let clock=0,clockKnown=true,manpower=0,manpowerKnown=true;
  for(const line of activeLines){
   const daily=(clockByDate.get(date)||[]).filter(row=>Number(row.line)===line);
   const scoped=daily.filter(row=>gdsKey(row.ewo)&&(!search||gdsKey(row.ewo)===search));
   const lineClock=gdsSum(scoped.length?scoped:daily.filter(row=>!gdsKey(row.ewo)),row=>gdsNumber(row.value));
   if(lineClock===null)clockKnown=false;else clock+=lineClock;
   const mps=[...new Set((dataByLine.get(line)||[]).map(row=>gdsNumber(row.manpower)).filter(v=>v!==null&&v>0))];
   if(mps.length!==1)manpowerKnown=false;else manpower+=mps[0];
  }
  if(!clockKnown){clock=null;notes.add('Some scheduled lines have no date-wise Clock Hour.');}
  if(!manpowerKnown){manpower=null;notes.add('Some scheduled lines have missing or conflicting Manpower.');}
  let forecast=0,forecastSah=0,selectedKnown=0,sahKnown=0,missingSmv=0;
  const stages=[0,0,0,0],stageKnown=[0,0,0,0],stagePartial=[false,false,false,false];
  let forecastPartial=false;
  for(const [ewo,lines] of ewoLines){
   const item=stock(ewo,lines);let pcs=0,known=0;
   item.stages.forEach((value,i)=>{
    if(value===null){stagePartial[i]=true;if(selected.has(i))forecastPartial=true;}
    else {stages[i]+=value;stageKnown[i]++;if(item.stagePartial[i])stagePartial[i]=true;
     if(selected.has(i)){pcs+=value;known++;selectedKnown++;if(item.stagePartial[i])forecastPartial=true;}}
   });
   forecast+=pcs;
   if(known){if(pcs>0&&item.smv===null)missingSmv++;else {forecastSah+=pcs*(item.smv||0)/60;sahKnown++;}}
  }
  const hasEwos=ewoLines.size>0;
  stages.forEach((_,i)=>{if(hasEwos&&!stageKnown[i])stages[i]=null;});
  if(selected.size&&hasEwos&&!selectedKnown)forecast=null;
  if(selected.size&&hasEwos&&!sahKnown)forecastSah=null;
  const sahPartial=forecastPartial||missingSmv>0;
  if(forecastPartial)notes.add('* Available WIP subtotal: some scheduled EWOs or report fields have no matched numeric data. No matched data shows —.');
  if(missingSmv)notes.add('* Available SAH subtotal excludes WIP with missing/conflicting EWO SMV. No convertible data shows —.');
  const knownStages=stages.filter(v=>v!==null);
  return {date,values:[clock,sah,qty,forecast,forecastSah,clock>0&&sah!==null?sah/clock*100:null,manpower>0&&clock!==null?clock/manpower:null,manpower],partial:[false,false,false,forecastPartial,sahPartial,false,false,false],stages,stagePartial,total:knownStages.length?knownStages.reduce((a,b)=>a+b,0):null,totalPartial:stagePartial.some(Boolean)};

 });
 return {days,notes:[...notes]};
}
function gdsFormat(value,index){if(value===null)return '—';const text=Number(value).toLocaleString('en-US',{maximumFractionDigits:index===2||index===3||index===7?0:1});return text+(index===5?'%':'');}
function gdsSubtotalMark(value,partial){return value!==null&&partial?' <sup class="gds-partial" title="Available data subtotal; some source values are unavailable" aria-label="Available data subtotal">*</sup>':'';}
function gdsInput(context,embellishment){return {dates:context.dates,lines:context.lines,search:context.search,selected:[...GDS_STATE.selected],data:DATA,plan:DAILY_PLAN,sah:SAH_DAILY,clock:CLOCK_HOUR_DAILY,fabric:FABRIC_CUTTING_DATA,sewing:SEWING_IO_DATA,embellishment};}
function paintGanttDailySummary(){
 const context=GDS_STATE.context,body=document.getElementById('gantt-daily-summary');if(!context||!body)return;
 const result=buildGanttDailySummary(gdsInput(context,GDS_STATE.source?.rows||[]));
 const count=GDS_STATE.selected.size,colspan=context.dates.length+1;
 const picker='<div class="gds-picker"><button type="button" id="gds-filter-button" aria-expanded="'+GDS_STATE.open+'" aria-controls="gds-filter-menu" onclick="gdsToggleMenu()">Consumable WIP · '+(count===4?'All 4':count+' selected')+' ▾</button><div id="gds-filter-menu" class="gds-menu" role="group" aria-label="Select consumable WIP categories" '+(GDS_STATE.open?'':'hidden')+'>'+GDS_STAGES.map((name,i)=>'<label><input type="checkbox" value="'+i+'" '+(GDS_STATE.selected.has(i)?'checked':'')+' onchange="gdsSelectStage(this)">'+name+'</label>').join('')+'<div class="gds-menu-actions"><button type="button" onclick="gdsSelectAll(true)">Select all</button><button type="button" onclick="gdsSelectAll(false)">Clear</button></div></div></div>';
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
 const note=document.getElementById('gds-note');if(note){note.hidden=GDS_STATE.hidden;note.textContent='Forecast: '+(count===4?'All consumable WIP':count?[...GDS_STATE.selected].map(i=>GDS_STAGES[i]).join(' + '):'None selected')+' · SAH = Σ(EWO consumable WIP × EWO SMV ÷ 60). WIP uses latest uploaded reports for the EWOs scheduled on each date; historical stock is not reconstructed.'+(GDS_STATE.source?.loading?' Loading Print/Embroidery WIP…':'')+(GDS_STATE.source?.error?' Print/Embroidery report could not load.':'')+(result.notes.length?' '+result.notes.join(' '):'');}
 const lower=document.getElementById('gds-consumable-table');if(lower){
  lower.innerHTML='<thead><tr><th>Consumable WIP</th>'+context.dates.map(date=>'<th>'+esc(date.slice(8)+'-'+date.slice(5,7)+'-'+date.slice(2,4))+'</th>').join('')+'</tr></thead><tbody>'+GDS_STAGES.map((label,i)=>'<tr><th scope="row">'+label+'</th>'+result.days.map(day=>'<td>'+gdsFormat(day.stages[i],3)+gdsSubtotalMark(day.stages[i],day.stagePartial[i])+'</td>').join('')+'</tr>').join('')+'<tr class="gds-lower-total"><th>Total Consumable WIP</th>'+result.days.map(day=>'<td>'+gdsFormat(day.total,3)+gdsSubtotalMark(day.total,day.totalPartial)+'</td>').join('')+'</tr></tbody>';
 }
 const lowerNote=document.getElementById('gds-consumable-note');if(lowerNote)lowerNote.textContent=count===4?'Total Consumable WIP = Forecastable Pcs above. Shared EWO stock is counted once per date.':'This table retains all WIP categories; the upper forecast uses only selected categories. Shared EWO stock is counted once per date.';
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
function gdsSelectAll(all){GDS_STATE.selected=new Set(all?[0,1,2,3]:[]);paintGanttDailySummary();}
function resetGanttDailySummary(){++GDS_STATE.request;GDS_STATE={...GDS_STATE,hidden:true,selected:new Set([0,1,2,3]),open:false,context:null,source:null};for(const id of ['gantt-daily-summary','gds-consumable-table','gds-note','gds-consumable-note']){const el=document.getElementById(id);if(el)el.textContent='';}}
if(typeof document!=='undefined'&&document.addEventListener){
 document.addEventListener('click',event=>{if(GDS_STATE.open&&!event.target.closest('.gds-picker'))gdsToggleMenu();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&GDS_STATE.open){gdsToggleMenu();document.getElementById('gds-filter-button')?.focus();}});
}
