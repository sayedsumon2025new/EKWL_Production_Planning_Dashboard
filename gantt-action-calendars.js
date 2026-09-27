/* Slide 07 calendars. Every event is derived from the current Planning snapshot or active SQL reports. */
const GANTT_ACTION_NAMES={pcd:'PCD',psd:'PSD',size:'Size Set',accessories:'Accessories',print:'Print',embroidery:'Embroidery',cutting:'Cutting'};
const GANTT_ACTION_MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const GANTT_ACTION_CACHE=new Map();
let GANTT_ACTION_TAB='gantt',GANTT_ACTION_MONTH='',GANTT_ACTION_DAY=0,GANTT_ACTION_REQUEST=0;
let GANTT_ACTION_VISIBLE=[],GANTT_ACTION_NOTICE='';
function resetGanttActionCache(){GANTT_ACTION_CACHE.clear();++GANTT_ACTION_REQUEST;if(GANTT_ACTION_TAB!=='gantt')renderGanttActionCalendar();}
function ganttActionRefresh(){GANTT_ACTION_CACHE.delete(GANTT_ACTION_TAB);GANTT_ACTION_NOTICE='Reloaded active SQL report.';renderGanttActionCalendar();}
function ganttActionToday(){
  const now=new Date(),key=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const select=document.getElementById('action-month-select');
  if(![...select.options].some(option=>option.value===key)){
    GANTT_ACTION_NOTICE='No dated records for the current month in this selected plan.';renderGanttActionCalendar();return;
  }
  GANTT_ACTION_MONTH=key;GANTT_ACTION_DAY=now.getDate();GANTT_ACTION_NOTICE='';renderGanttActionCalendar();
}
function ganttActionExport(){
  const fields=['Date','EWO','Line','Color','Event','Details','Source'];
  const safe=value=>{
    let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  };
  const csv=[fields,...GANTT_ACTION_VISIBLE.map(e=>[e.date.label,e.ewo,e.line,e.color,e.action,e.detail,e.source])]
    .map(row=>row.map(safe).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`EKWL_${GANTT_ACTION_TAB}_${GANTT_ACTION_MONTH||'empty'}_actions.csv`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function ganttActionDate(raw){
  const value=String(raw??'').trim();if(!value)return null;
  let y,m,d,match;
  if((match=/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/.exec(value))){[,y,m,d]=match.map(Number);}
  else if((match=/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(value))){
    d=Number(match[1]);m=GANTT_ACTION_MONTHS.findIndex(x=>x.toLowerCase()===match[2].toLowerCase())+1;
    y=Number(match[3]);if(y<100)y+=y>=70?1900:2000;
  }else if((match=/^(\d{1,2})-([A-Za-z]{3})$/.exec(value))){
    d=Number(match[1]);m=GANTT_ACTION_MONTHS.findIndex(x=>x.toLowerCase()===match[2].toLowerCase())+1;y=0;
  }else return null;
  if(!m||d<1||d>new Date(y||2000,m,0).getDate())return null;
  return {year:y,month:m,day:d,key:(y||'undated')+'-'+String(m).padStart(2,'0'),label:d+' '+GANTT_ACTION_MONTHS[m-1]+(y?' '+y:' (year not supplied)')};
}
async function ganttActionSqlRows(table,select){
  const result=[],size=500;
  for(let from=0;;from+=size){
    const {data,error}=await SB.from(table).select(select).eq('is_active',true).order('source_row_no',{ascending:true}).range(from,from+size-1);
    if(error)throw error;
    result.push(...(data||[]));if(!data||data.length<size)break;
  }
  return result;
}
function ganttActionAdd(events,raw,ewo,line,color,action,detail,source){
  const date=ganttActionDate(raw);if(!date||!String(ewo??'').trim())return;
  events.push({date,ewo:String(ewo).trim(),line:String(line??'').trim(),color:String(color??'').trim(),action:String(action??'').trim(),detail:String(detail??'').trim(),source});
}
async function ganttActionEvents(tab){
  if(tab==='pcd'||tab==='psd'){
    const events=[];
    for(const r of DATA){ganttActionAdd(events,tab==='pcd'?r.pcddate:r.startdate,r.ewo,r.line,r.color,
      tab==='pcd'?'PCD milestone':'PSD / production start',`Buyer: ${r.buyer||'—'} · PO: ${r.po||'—'}`,'Planning SQL · selected version');}
    return events;
  }
  if(tab==='cutting'){
    const events=[];
    let cutting=FABRIC_CUTTING_DATA;
    if(cutting.length&&!Object.prototype.hasOwnProperty.call(cutting[0],'pattern_received_date')){
      cutting=[];
      for(let from=0;;from+=500){
        const {data,error}=await SB.from('fabric_cutting_info').select('ewo,color_name,pattern_received_date,replacement_receive_commitment_date,status').order('id',{ascending:true}).range(from,from+499);
        if(error)throw error;cutting.push(...(data||[]));if(!data||data.length<500)break;
      }
    }
    for(const r of cutting){
      ganttActionAdd(events,r.pattern_received_date,r.ewo,'',r.color_name,'Pattern received',r.status||'','Fabric & Cutting SQL');
      ganttActionAdd(events,r.replacement_receive_commitment_date,r.ewo,'',r.color_name,'Replacement receive commitment',r.status||'','Fabric & Cutting SQL');
    }
    return events;
  }
  const saved=GANTT_ACTION_CACHE.get(tab);
  if(saved&&Date.now()-saved.at<60000)return saved.promise;
  const promise=(async()=>{
    const events=[];
    if(tab==='size'){
      for(const {row_data:r} of await ganttActionSqlRows('size_set_rows','row_data')){
        const action=String(r?.['Next Action to Do\n(What)']||'').trim();
        if(action)ganttActionAdd(events,r.When,r.EWO,r.Line,r.Color,action,`Owner: ${r.Who||'—'}`,'Size Set SQL · When');
        ganttActionAdd(events,r['S/S Cut Date Plan'],r.EWO,r.Line,r.Color,'Size Set cut plan','Planned date','Size Set SQL · S/S Cut Date Plan');
      }
    }else if(tab==='accessories'){
      for(const {row_data:r} of await ganttActionSqlRows('accessories_rows','row_data')){
        ganttActionAdd(events,r.PSD,r.EWO,r['Line No'],'',`Sewing trims: ${r['Sewing Trims Pending Stts']||'—'}`,
          `Final status: ${r['Final Status']||'—'}`,'Accessories SQL · PSD status');
      }
    }else if(tab==='print'||tab==='embroidery'){
      const print=tab==='print';
      const send=print?'Today Print Send Qty\n':'Today EMB Send Qty';
      const receive=print?' Today Print Receive Qty':'Today EMB Receive Qty';
      for(const r of await ganttActionSqlRows('embellishment_send_receive_rows','"Date","EWO No","Color","Today Print Send Qty\n"," Today Print Receive Qty","Today EMB Send Qty","Today EMB Receive Qty"')){
        const sent=Number(String(r[send]||'0').replace(/,/g,''))||0,received=Number(String(r[receive]||'0').replace(/,/g,''))||0;
        if(!sent&&!received)continue;
        ganttActionAdd(events,r.Date,r['EWO No'],'',r.Color,`${print?'Print':'Embroidery'} activity`,
          `Sent: ${sent.toLocaleString('en-US')} · Received: ${received.toLocaleString('en-US')}`,
          'Embellishment SQL · report Date');
      }
    }
    return events;
  })();
  GANTT_ACTION_CACHE.set(tab,{promise,at:Date.now()});
  try{return await promise;}catch(error){GANTT_ACTION_CACHE.delete(tab);throw error;}
}
function showGanttActionTab(tab){
  if(tab!=='gantt'&&!GANTT_ACTION_NAMES[tab])return;
  GANTT_ACTION_TAB=tab;GANTT_ACTION_MONTH='';GANTT_ACTION_DAY=0;GANTT_ACTION_NOTICE='';++GANTT_ACTION_REQUEST;
  for(const name of ['gantt',...Object.keys(GANTT_ACTION_NAMES)]){
    const el=document.getElementById('gantt-tab-'+name);if(el)el.setAttribute('aria-selected',String(name===tab));
  }
  const gantt=document.getElementById('gantt-main-view'),view=document.getElementById('gantt-action-view');
  if(gantt)gantt.hidden=tab!=='gantt';if(view)view.hidden=tab==='gantt';
  if(tab!=='gantt')renderGanttActionCalendar();
}
function ganttActionPickMonth(month){GANTT_ACTION_MONTH=month;GANTT_ACTION_DAY=0;renderGanttActionCalendar();}
function ganttActionPickDay(day){GANTT_ACTION_DAY=Number(day);renderGanttActionCalendar();}
function ganttActionMoveMonth(delta){
  const months=[...document.getElementById('action-month-select').options].map(x=>x.value);
  const next=months[months.indexOf(GANTT_ACTION_MONTH)+delta];if(next)ganttActionPickMonth(next);
}
async function renderGanttActionCalendar(){
  const tab=GANTT_ACTION_TAB,token=++GANTT_ACTION_REQUEST,body=document.getElementById('gantt-action-body');
  if(!body||tab==='gantt')return;
  body.innerHTML='<p class="action-note">Loading '+esc(GANTT_ACTION_NAMES[tab])+' dates…</p>';
  try{
    let events=await ganttActionEvents(tab);if(token!==GANTT_ACTION_REQUEST)return;
    const planByEwo=new Map();
    for(const row of DATA){
      const ewo=ganttKey(row.ewo),color=ganttColorKey(row.color);
      if(!ewo)continue;
      if(!planByEwo.has(ewo))planByEwo.set(ewo,{colors:new Set(),lines:new Set(),colorLines:new Map()});
      const record=planByEwo.get(ewo);record.colors.add(color);
      const line=Number(String(row.line||'').match(/\d+/)?.[0]);
      if(line){record.lines.add(line);if(!record.colorLines.has(color))record.colorLines.set(color,new Set());record.colorLines.get(color).add(line);}
    }
    // All report calendars inherit the selected Planning version's EWO, color and line scope.
    events=events.filter(event=>{
      const plan=planByEwo.get(ganttKey(event.ewo));if(!plan)return false;
      const color=ganttColorKey(event.color);
      if(color&&!plan.colors.has(color))return false;
      const line=Number(String(event.line||'').match(/\d+/)?.[0]);
      const lines=color?(plan.colorLines.get(color)||plan.lines):plan.lines;
      if(line&&lines.size&&!lines.has(line)){
        // Accessories status is EWO-scoped; its report line can differ from the selected plan line.
        if(tab!=='accessories')return false;
        event.detail+=' · Report line: '+event.line;
        event.line=[...lines].sort((a,b)=>a-b).map(x=>String(x).padStart(2,'0')).join(' / ');
      }
      if(!line)event.line=[...lines].sort((a,b)=>a-b).map(x=>String(x).padStart(2,'0')).join(' / ');
      return true;
    });
    const ewo=document.getElementById('action-ewo')?.value.trim().toUpperCase()||'';
    const line=document.getElementById('action-line')?.value.trim().toUpperCase()||'';
    const color=document.getElementById('action-color')?.value.trim().toUpperCase()||'';
    events=events.filter(e=>(!ewo||e.ewo.toUpperCase().includes(ewo))&&(!line||e.line.toUpperCase().includes(line))&&(!color||e.color.toUpperCase().includes(color)));
    const types=[...new Set(events.map(e=>e.source.split(' · ').at(-1)))].sort();
    const typeSelect=document.getElementById('action-type');const selectedType=typeSelect?.value||'';
    if(typeSelect){typeSelect.innerHTML='<option value="">All event types</option>'+types.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');typeSelect.value=types.includes(selectedType)?selectedType:'';}
    if(typeSelect?.value)events=events.filter(e=>e.source.split(' · ').at(-1)===typeSelect.value);
    // Duplicate planning records do not create duplicate calendar entries.
    const unique=new Map();for(const e of events){const key=[e.date.label,e.ewo,e.line,e.color,e.action,e.detail].join('|');if(!unique.has(key))unique.set(key,e);}
    events=[...unique.values()];
    const months=[...new Set(events.map(e=>e.date.key))].sort((a,b)=>a.localeCompare(b));
    const select=document.getElementById('action-month-select');
    if(!months.includes(GANTT_ACTION_MONTH))GANTT_ACTION_MONTH=months.find(x=>x.startsWith(new Date().getUTCFullYear()+'-'))||months[0]||'';
    select.innerHTML=months.map(key=>{
      const [year,month]=key.split('-');return `<option value="${esc(key)}" ${key===GANTT_ACTION_MONTH?'selected':''}>${GANTT_ACTION_MONTHS[Number(month)-1]} ${year==='undated'?'· year not supplied':year}</option>`;
    }).join('');
    const planLabel=typeof activePlanningLabel==='function'?activePlanningLabel():String(ACTIVE_PLAN_UPLOAD?.planning_id||ACTIVE_PLAN_UPLOAD?.file_name||'Selected Plan');
    const banner=`<div class="action-plan-banner">Selected Plan: ${esc(planLabel)} · ${planByEwo.size.toLocaleString('en-US')} planned EWOs · Active SQL report${tab==='pcd'||tab==='psd'?' (Planning)':''}</div>`;
    if(!months.length){GANTT_ACTION_VISIBLE=[];body.innerHTML=banner+'<p class="action-note">No dated records in the selected Plan match these filters.</p>';return;}
    const [yearText,monthText]=GANTT_ACTION_MONTH.split('-'),year=yearText==='undated'?0:Number(yearText),month=Number(monthText);
    const monthEvents=events.filter(e=>e.date.key===GANTT_ACTION_MONTH);
    GANTT_ACTION_VISIBLE=monthEvents;
    const groups=new Map();for(const event of monthEvents){const day=event.date.day;groups.set(day,[...(groups.get(day)||[]),event]);}
    const days=new Date(year||2000,month,0).getDate();
    const offset=year?new Date(year,month-1,1).getDay():0;
    if(!GANTT_ACTION_DAY||GANTT_ACTION_DAY>days)GANTT_ACTION_DAY=[...groups.keys()].sort((a,b)=>a-b)[0]||1;
    const weekday=year?['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div class="action-weekday">${x}</div>`).join(''):'';
    const cells=Array(offset).fill('<div></div>').concat(Array.from({length:days},(_,i)=>{
      const day=i+1,count=groups.get(day)?.length||0;
      return `<button class="action-day ${count?'has-events':''}" type="button" aria-pressed="${GANTT_ACTION_DAY===day}" onclick="ganttActionPickDay(${day})"><b>${day}</b>${count?`<small>${count.toLocaleString('en-US')} event${count===1?'':'s'}</small>`:''}</button>`;
    })).join('');
    const dayEvents=groups.get(GANTT_ACTION_DAY)||[];
    const details=dayEvents.slice(0,300).map(e=>`<div class="action-event"><strong>EWO ${esc(e.ewo)} · ${esc(e.action)}</strong><div>${e.line?'Line '+esc(e.line)+' · ':''}${e.color?'Color '+esc(e.color)+' · ':''}${esc(e.detail)}</div><small>${esc(e.source)}</small></div>`).join('');
    const idx=months.indexOf(GANTT_ACTION_MONTH);
    const counts=[['Events',monthEvents.length],['EWOs',new Set(monthEvents.map(e=>ganttKey(e.ewo))).size],['Active dates',groups.size],['Colors',new Set(monthEvents.map(e=>ganttColorKey(e.color)).filter(Boolean)).size]];
    body.innerHTML=banner+(GANTT_ACTION_NOTICE?`<p class="action-note">${esc(GANTT_ACTION_NOTICE)}</p>`:'')+
      '<div class="action-kpis">'+counts.map(([name,value])=>`<div class="action-kpi">${esc(name)}<strong>${value.toLocaleString('en-US')}</strong></div>`).join('')+'</div>'+
      `<div class="action-month"><button type="button" onclick="ganttActionMoveMonth(-1)" ${idx===0?'disabled':''} aria-label="Previous month">←</button><span>${GANTT_ACTION_MONTHS[month-1]} ${year||'· year not supplied'}</span><button type="button" onclick="ganttActionMoveMonth(1)" ${idx===months.length-1?'disabled':''} aria-label="Next month">→</button><span>${monthEvents.length.toLocaleString('en-US')} events</span></div>`+
      (year?'':'<p class="action-note">Source dates have no year; weekday and overdue status are not inferred.</p>')+
      `<div class="action-grid">${weekday}${cells}</div><h3>${GANTT_ACTION_DAY} ${GANTT_ACTION_MONTHS[month-1]} · ${dayEvents.length.toLocaleString('en-US')} events</h3>`+
      `<div class="action-events">${details||'<p class="action-note">No events for this day.</p>'}</div>`+
      (dayEvents.length>300?'<p class="action-note">Showing first 300 events. Filter by EWO or line for the rest.</p>':'');
  }catch(error){if(token!==GANTT_ACTION_REQUEST)return;console.warn('Action calendar source unavailable',error);
    body.innerHTML='<p class="action-note">This calendar could not read its SQL source. Check report access and try again.</p>';}
}
