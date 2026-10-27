/* Size Set follow-up: one entry per Line/EWO, on its first positive planned date. */
const SSA_ACTION='Next Action to Do\n(What)';
const ssaKey=v=>String(v??'').trim().toUpperCase().replace(/^(\d+)\.0+$/,'$1');
const ssaNorm=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
function ssaValidDate(value){
  const v=String(value??'').trim(),iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if(!iso)return !!ssTnaDateParts(v);
  const [,y,m,d]=iso,dt=new Date(Date.UTC(+y,+m-1,+d));
  return dt.getUTCFullYear()===+y&&dt.getUTCMonth()===+m-1&&dt.getUTCDate()===+d;
}
function ssaStatus(rows){
  if(!rows?.length)return {color:'red',label:'Report missing',events:['Report missing']};
  const open=rows.filter(r=>!['close','closed'].includes(ssaNorm(ssVal(r,SSA_ACTION))));
  if(!open.length)return {color:'green',label:'Closed',events:['Closed']};
  const dated=open.every(r=>ssaNorm(ssVal(r,SSA_ACTION))==='bulk pattern'&&ssaValidDate(ssVal(r,'When')));
  return {color:dated?'amber':'red',label:dated?'Bulk Pattern · dated':'Action required',events:[...new Set(open.map(r=>ssVal(r,SSA_ACTION).trim()||'Unknown'))]};
}
function ssaBuildPlan(rows,master){
  const daily=new Map(),seen=new Set(),dates=new Set();
  for(const r of rows){
    const line=Number(r.line),ewo=ssaKey(r.ewo),date=String(r.date||''),qty=Number(r.value);
    if(!master.has(line)||!ewo||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(qty))continue;
    const source=JSON.stringify([r.record_id,date]);
    if(r.record_id!=null){if(seen.has(source))continue;seen.add(source);}
    const k=JSON.stringify([line,ewo,date]);
    if(!daily.has(k))daily.set(k,{line,ewo,date,qty:0,buyers:new Set()});
    const cell=daily.get(k);cell.qty+=qty;const buyer=String(r.buyer||'').trim();if(buyer)cell.buyers.add(buyer);
  }
  const first=new Map();
  for(const cell of daily.values()){
    if(cell.qty<=0)continue;dates.add(cell.date);const k=JSON.stringify([cell.line,cell.ewo]),prev=first.get(k);
    if(!prev||cell.date<prev.date)first.set(k,cell);
  }
  return {entries:[...first.values()].sort((a,b)=>a.line-b.line||a.date.localeCompare(b.date)||a.ewo.localeCompare(b.ewo)),dates:[...dates].sort()};
}
let SSA_PLAN='',SSA_PENDING=false,SSA_VISIBLE=[],SSA_REPORT=new Map();
const ssaEl=id=>document.getElementById('ssa-'+id);
function ssaOptions(id,values,label){
  const el=ssaEl(id),old=el.value;
  el.innerHTML=`<option value="">${esc(label)}</option>`+values.map(v=>`<option value="${esc(v)}">${esc(id==='line'?'Line '+v:v)}</option>`).join('');
  el.value=values.map(String).includes(old)?old:'';
}
function ssaClear(allDatesOnly=false){
  if(!allDatesOnly)for(const id of ['event','buyer','line','search'])ssaEl(id).value='';
  ssaEl('from').value='';ssaEl('to').value='';renderSizeSetAndon();
}
function ssaReset(){
  SSA_PLAN='';SSA_PENDING=false;SSA_VISIBLE=[];SSA_REPORT.clear();
  ssaEl('dialog')?.close();if(ssaEl('detail'))ssaEl('detail').innerHTML='';
  if(ssaEl('table'))ssaEl('table').innerHTML='';
  for(const id of ['event','buyer','line','search','from','to']){const el=ssaEl(id);if(el)el.value='';}
  if(ssaEl('count'))ssaEl('count').textContent='';
}
function renderSizeSetAndon(){
  if(!ssaEl('table'))return;
  if(typeof canAccessSlide==='function'&&!canAccessSlide(17)){ssaReset();return;}
  const id=String(ACTIVE_PLAN_UPLOAD?.id||'');
  if(SSA_PLAN!==id){ssaReset();SSA_PLAN=id;}
  const model=ssaBuildPlan(!SSA_PENDING&&id?DAILY_PLAN:[],new Set([...getChassisMasterLines()].map(Number)));
  SSA_REPORT=new Map();for(const row of SS_ROWS){const k=ssaKey(ssVal(row,'EWO'));if(!SSA_REPORT.has(k))SSA_REPORT.set(k,[]);SSA_REPORT.get(k).push(row);}
  const statuses=new Map(model.entries.map(r=>[r.ewo,ssaStatus(SSA_REPORT.get(r.ewo))]));
  ssaOptions('event',[...new Set([...SS_TNA_STEPS.map(r=>r[0]),...Array.from(statuses.values()).flatMap(s=>s.events),'Closed','Report missing','Unknown'])],'All TNA events');
  ssaOptions('buyer',[...new Set(model.entries.flatMap(r=>[...r.buyers]))].sort(),'All Buyers');
  ssaOptions('line',[...new Set(model.entries.map(r=>r.line))].sort((a,b)=>a-b),'All Lines');
  const dates=model.dates;
  for(const name of ['from','to']){const el=ssaEl(name);el.min=dates[0]||'';el.max=dates.at(-1)||'';if(!el.value)el.value=(name==='from'?dates[0]:dates.at(-1))||'';}
  const displayDates=dates.filter(d=>(!ssaEl('from').value||d>=ssaEl('from').value)&&(!ssaEl('to').value||d<=ssaEl('to').value));
  const event=ssaNorm(ssaEl('event').value),buyer=ssaEl('buyer').value,line=Number(ssaEl('line').value),query=ssaKey(ssaEl('search').value);
  SSA_VISIBLE=model.entries.filter(r=>displayDates.includes(r.date)&&(!line||r.line===line)&&(!buyer||r.buyers.has(buyer))&&(!query||r.ewo.includes(query))&&(!event||statuses.get(r.ewo).events.some(e=>ssaNorm(e)===event)));
  const lines=[...new Set(SSA_VISIBLE.map(r=>r.line))],cells=new Map();
  SSA_VISIBLE.forEach((r,i)=>{const k=r.line+'|'+r.date;if(!cells.has(k))cells.set(k,[]);cells.get(k).push({r,i});});
  const fmt=d=>d.slice(8)+'-'+SS_TNA_MONTHS[Number(d.slice(5,7))-1]+'-'+d.slice(2,4);
  ssaEl('count').textContent=`${lines.length} Lines · ${displayDates.length} dates · ${SSA_VISIBLE.length} first-plan entries`;
  ssaEl('table').hidden=!SSA_VISIBLE.length;ssaEl('empty').hidden=!!SSA_VISIBLE.length;
  ssaEl('empty').textContent=SSA_PENDING?'Loading selected planning upload…':!id?'Select a planning upload above.':'No matching first planned dates. Use All dates or Clear.';
  ssaEl('table').style.minWidth=Math.max(600,50+displayDates.length*76)+'px';
  ssaEl('table').innerHTML='<thead><tr><th scope="col">Line</th>'+displayDates.map(d=>`<th scope="col">${fmt(d)}</th>`).join('')+'</tr></thead><tbody>'+lines.map(ln=>`<tr><th scope="row" class="ssa-line">${ln}</th>`+displayDates.map(d=>'<td><div class="ssa-stack">'+(cells.get(ln+'|'+d)||[]).map(({r,i})=>{const s=statuses.get(r.ewo);return `<button type="button" class="ssa-ewo ssa-${s.color}" data-ssa-cell="${i}" title="${esc(r.ewo+' · '+s.label+' · '+r.qty+' pcs')}" aria-label="${esc('EWO '+r.ewo+', Line '+r.line+', '+fmt(r.date)+', '+s.label)}">${esc(r.ewo)}</button>`;}).join('')+'</div></td>').join('')+'</tr>').join('')+'</tbody>';
  ssaEl('table').querySelectorAll('[data-ssa-cell]').forEach(b=>b.onclick=()=>ssaOpen(SSA_VISIBLE[Number(b.dataset.ssaCell)]));
}
function ssaOpen(r){
  const rows=SSA_REPORT.get(r.ewo)||[],s=ssaStatus(rows);
  ssaEl('detail').innerHTML=`<h2>EWO ${esc(r.ewo)}</h2><p>Line ${r.line} · First planned date: ${esc(r.date)} · ${esc([...r.buyers].join(', '))}</p><p><strong>${esc(s.label)}</strong> · ${esc(activePlanningLabel())}</p><p>Plan on first date: ${r.qty.toLocaleString('en-US')} pcs</p>`+rows.map(row=>`<div class="ssa-evidence"><div><b>Next Action to Do (What)</b><span>${esc(ssVal(row,SSA_ACTION)||'—')}</span></div><div><b>When</b><span>${esc(ssVal(row,'When')||'—')}</span></div></div>`).join('')+`<p class="ssa-hint">${rows.length?'All matching EWO report rows are checked. All closed → green; remaining open rows all Bulk Pattern + valid When → yellow; otherwise red.':'No matching EWO in the current Size Set snapshot.'}</p>`;
  ssaEl('dialog').showModal();
}
if(typeof window!=='undefined')window.addEventListener('DOMContentLoaded',()=>{
  for(const name of ['event','buyer','line','from','to'])ssaEl(name)?.addEventListener('change',renderSizeSetAndon);
  ssaEl('search')?.addEventListener('input',renderSizeSetAndon);
  ssaEl('clear')?.addEventListener('click',()=>ssaClear());ssaEl('all-dates')?.addEventListener('click',()=>ssaClear(true));
  ssaEl('search-btn')?.addEventListener('click',renderSizeSetAndon);
  ssaEl('close')?.addEventListener('click',()=>ssaEl('dialog').close());
});
