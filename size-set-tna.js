/* Source-backed Size Set TNA KPI workspace. No sample data or direct SQL reads. */
const TNA_STEPS=[['PP Comment','PP comment Plan','PP comment Actual'],['SS Fabric','SS Fabric Plan','SS Fabric Actual'],['SS Pattern','SS Pattern Plan','SS Pattern Actual'],['S/S Cut Date','S/S Cut Date Plan','S/S Cut Date Actual'],['EBM Send','EBM Send Plan','EBM Send Actual'],['Trims','Trims Plan','Trims Actual'],['SS Set Trims Card','SS Set Trims card Plan','SS Set Trims Card Actual'],['EBM Receive','EBM Rcv Plan','EBM Rcv Actual'],['S/S Input','S/S Input Plan','S/S Input Actual'],['S/S Sew Finish','S/S Sew Finish Plan','S/S Sew Finish Actual'],['PP Meeting','PP Meeting Plan','PP Meeting Actual'],['Bulk Pattern','Bulk Pattern Plan','Bulk Pattern Actual']];
function dhakaDate(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');}
function parseTnaDate(value,anchor='',policy='nearest'){
 const z=String(value??'').trim();if(!z||/^(n\/?a|-|0)$/i.test(z))return '';
 const valid=(y,m,d)=>{const x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d?x.toISOString().slice(0,10):'';};
 let m=/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(z);if(m)return valid(+m[1],+m[2],+m[3]);
 m=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/.exec(z);if(m)return valid(+m[3]<100?2000+(+m[3]):+m[3],+m[2],+m[1]);
 m=/^(\d{1,2})[- ]([A-Za-z]{3})(?:[- ,]+(\d{2}|\d{4}))?$/.exec(z);if(!m)return '';
 const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase())+1;if(!month)return '';
 if(m[3])return valid(+m[3]<100?2000+(+m[3]):+m[3],month,+m[1]);
 if(policy==='explicit'||!anchor)return '';
 const year=+anchor.slice(0,4);return [-1,0,1].map(n=>valid(year+n,month,+m[1])).filter(Boolean).sort((a,b)=>Math.abs(Date.parse(a)-Date.parse(anchor))-Math.abs(Date.parse(b)-Date.parse(anchor)))[0]||'';
}
function normalizeTnaRows(rows,policy){
 const counts={inferred:0,excluded:0};
 const inferred=raw=>/^\d{1,2}[- ][A-Za-z]{3}$/.test(String(raw??'').trim());
 const orders=rows.filter(r=>String(r.Buyer??'').trim()).map(r=>{
  const efd=parseTnaDate(r.EFD,'','explicit'),events=[];
  for(const [event,pk,ak] of TNA_STEPS){
   const plan=parseTnaDate(r[pk],efd,policy),actual=parseTnaDate(r[ak],plan||efd,policy);
   for(const [raw,date] of [[r[pk],plan],[r[ak],actual]])if(date&&inferred(raw))counts.inferred++;
   events.push({event,plan,actual,owner:String(r.Who||'').trim()||(['SS Pattern','Bulk Pattern'].includes(event)?String(r['Pattern Master Name']||'').trim():'')||'—'});
   if(!plan&&String(r[pk]??'').trim()&&!/^(n\/?a|-|0)$/i.test(String(r[pk]).trim()))counts.excluded++;
  }
  return {line:String(r.Line??'').trim()||'—',buyer:String(r.Buyer??'').trim(),ewo:String(r.EWO??'').trim(),color:String(r.Color??'').trim()||'Color missing',qty:Number(String(r['GMT Qty']??'').replace(/,/g,''))||0,bulkActual:events.find(e=>e.event==='Bulk Pattern')?.actual||'',efd,pcd:parseTnaDate(r.PCD,efd,policy),events,next:String(r['Next Action to Do\n(What)']??''),when:['close','closed'].includes(String(r['Next Action to Do\n(What)']||'').trim().toLowerCase())?String(r['Bulk Pattern Actual']||''):String(r.When||''),who:String(r.Who||''),remarks:String(r.Remarks||'')};
 });return {orders,counts};
}
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=n=>Number(n).toLocaleString('en-US'),pct=(a,b)=>b?100*a/b:null,percent=n=>n==null?'—':n.toFixed(1)+'%',short=d=>d?d.slice(8)+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+d.slice(5,7)-1]:'—',days=(a,b)=>Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/864e5);
const colors={on:'#168566',late:'#c58b27',over:'#c64754',pending:'#6689ab'};
let TNA_ORDERS=[],TNA_LABEL='',TNA_PLAN_ID='',TNA_RAW=[],DATE_COUNTS={inferred:0,excluded:0},TNA_LOADING=false;
let VIEW='overview',STATUS='All',PAGE=0,ORDERS=[],EVENTS=[],METRIC={},ACTION_ROWS=[];
const opt=(v,t)=>'<option value="'+esc(v)+'">'+esc(t??v)+'</option>';
function classify(x,cutoff){if(!x.plan)return x.actual&&x.actual<=cutoff?'Completed':'No plan';if(x.actual&&x.actual<=cutoff)return x.actual<=x.plan?'On time':'Late';if(x.plan<cutoff)return 'Overdue';if(x.plan===cutoff)return 'Due today';return 'Upcoming';}
function aggregate(events,cutoff){const m={plan:events.length,actual:0,on:0,late:0,over:0,pending:0,today:0};for(const x of events){const s=classify(x,cutoff);if(s==='On time'){m.on++;m.actual++;}else if(s==='Late'){m.late++;m.actual++;}else if(s==='Overdue')m.over++;else{m.pending++;if(s==='Due today')m.today++;}}m.due=m.actual+m.over;m.otd=pct(m.on,m.due);return m;}
function bar(m){const w=n=>m.plan?100*n/m.plan:0;return '<div class="status-bar" aria-label="'+esc(m.on+' on time, '+m.late+' late completed, '+m.over+' overdue, '+m.pending+' upcoming or due today')+'">'+[['on',m.on],['late',m.late],['over',m.over],['pending',m.pending]].map(([k,v])=>'<i style="width:'+w(v)+'%;background:'+colors[k]+'"></i>').join('')+'</div>';}
function setView(view,status){VIEW=view;if(status)STATUS=status;PAGE=0;render();}
function render(){
 const buyer=$('buyer').value,line=+$('line').value,event=$('event').value,q=$('search').value.trim().toLowerCase(),cutoff=$('asof').value||dhakaDate();
 ORDERS=TNA_ORDERS.map((r,id)=>({...r,id})).filter(r=>(!buyer||r.buyer===buyer)&&(!line||r.line===line)&&(!q||(r.ewo+' '+r.color).toLowerCase().includes(q)));
 EVENTS=ORDERS.flatMap(r=>r.events.filter(x=>x.plan&&(!event||x.event===event)).map(x=>({...x,order:r,status:classify(x,cutoff)})));
 METRIC=aggregate(EVENTS,cutoff);const m=METRIC,complete=ORDERS.filter(r=>r.bulkActual&&r.bulkActual<=cutoff).length;
 $('otd').textContent=percent(m.otd);$('otd-foot').innerHTML='<b>'+fmt(m.on)+'</b> on time / '+fmt(m.due)+' due';$('otd-track').style.width=(m.otd||0)+'%';
 $('due').textContent=fmt(m.due);$('due-foot').innerHTML='<b>'+fmt(m.actual)+'</b> completed · '+fmt(m.plan)+' planned';$('due-track').style.width=(pct(m.actual,m.plan)||0)+'%';
 const overdueOrders=new Set(EVENTS.filter(e=>e.status==='Overdue').map(e=>e.order.id)).size;
 $('overdue').textContent=fmt(m.over);$('overdue-foot').innerHTML='<b>'+fmt(overdueOrders)+'</b> report records affected';$('overdue-track').style.width=(pct(m.over,m.plan)||0)+'%';
 $('complete').textContent=fmt(complete)+' / '+fmt(ORDERS.length);$('complete-foot').innerHTML='<b>'+percent(pct(complete,ORDERS.length))+'</b> bulk pattern actual recorded';$('complete-track').style.width=(pct(complete,ORDERS.length)||0)+'%';
 $('scope').textContent=fmt(ORDERS.length)+' report rows · As of '+short(cutoff)+' '+cutoff.slice(0,4);
 $('overview').hidden=VIEW!=='overview';$('tracker').hidden=VIEW!=='tracker';
 for(const [id,on] of [['overview-tab',VIEW==='overview'],['tracker-tab',VIEW==='tracker']]){$(id).classList.toggle('on',on);$(id).setAttribute('aria-pressed',String(on));}
 const selectedSteps=event?[event]:TNA_STEPS.map(s=>s[0]);
 $('events').innerHTML='<thead><tr><th>Milestone</th><th>Planned</th><th>Completed</th><th>Open late</th><th>OTD</th><th style="text-align:left">Delivery mix</th></tr></thead><tbody>'+selectedSteps.map(name=>{const a=aggregate(EVENTS.filter(e=>e.event===name),cutoff);return '<tr class="event-row" data-event="'+esc(name)+'"><td><button class="event-name"><span class="event-no">'+String(TNA_STEPS.map(s=>s[0]).indexOf(name)+1).padStart(2,'0')+'</span>'+esc(name)+'</button></td><td>'+fmt(a.plan)+'</td><td class="num-green">'+fmt(a.actual)+'</td><td class="'+(a.over?'num-red':'')+'">'+fmt(a.over)+'</td><td>'+percent(a.otd)+'</td><td>'+bar(a)+'</td></tr>';}).join('')+'</tbody>';
 const parts=[['on',m.on,'On time'],['late',m.late,'Late completed'],['over',m.over,'Overdue open'],['pending',m.pending,'Upcoming / today']];let offset=0;const circum=2*Math.PI*51;
 $('donut').innerHTML='<svg viewBox="0 0 138 138" role="img" aria-label="Milestone delivery mix"><circle cx="69" cy="69" r="51" stroke="var(--line)"/>'+parts.map(([k,n])=>{const length=m.plan?circum*n/m.plan:0;const tag='<circle cx="69" cy="69" r="51" stroke="'+colors[k]+'" stroke-dasharray="'+length+' '+(circum-length)+'" stroke-dashoffset="'+(-offset)+'"/>';offset+=length;return tag;}).join('')+'</svg><div class="centre"><b>'+fmt(m.plan)+'</b><small>PLANNED EVENTS</small></div>';
 $('mix-list').innerHTML=parts.map(([k,n,label])=>'<div class="mix-item"><span><i style="background:'+colors[k]+'"></i>'+label+'</span><b>'+fmt(n)+'</b></div>').join('');
 const oldest=new Map();for(const e of EVENTS.filter(x=>x.status==='Overdue')){const old=oldest.get(JSON.stringify([e.order.line,e.order.ewo,e.order.color.toUpperCase()]));if(!old||e.plan<old.plan)oldest.set(JSON.stringify([e.order.line,e.order.ewo,e.order.color.toUpperCase()]),e);}
 const priorities=[...oldest.values()].sort((a,b)=>a.plan.localeCompare(b.plan)||a.order.ewo.localeCompare(b.order.ewo)).slice(0,4);
 $('risk-count').textContent=fmt(oldest.size)+' at risk';
 $('priorities').innerHTML=priorities.map(e=>'<div class="priority"><div><div class="name">'+esc(e.order.ewo)+' <span style="font-weight:500;color:var(--muted)">· '+esc(e.order.color)+'</span></div><div class="meta">'+esc(e.event)+' · '+esc(e.owner)+' · Line '+e.order.line+'</div></div><div style="display:flex;align-items:center;gap:8px"><span class="late-days">'+days(cutoff,e.plan)+'d late</span><button data-order="'+e.order.id+'" aria-label="Open '+esc(e.order.ewo+' '+e.order.color)+' timeline"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8"/></svg></button></div></div>').join('')||'<div class="empty">No overdue actions in this scope.</div>';
 document.querySelectorAll('[data-event]').forEach(r=>r.onclick=()=>{$('event').value=r.dataset.event;PAGE=0;render();});
 document.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>openOrder(+b.dataset.order));
 renderTracker();
}
function renderTracker(){
 const labels=['All','Overdue','Due today','Upcoming','Completed','On time','Late','Due'];
 $('status-chips').innerHTML=labels.slice(0,5).concat(STATUS&&!labels.slice(0,5).includes(STATUS)?[STATUS]:[]).map(s=>'<button data-status="'+s+'" class="'+(s===STATUS?'on':'')+'" aria-pressed="'+(s===STATUS)+'">'+s+'</button>').join('');
 const matches=e=>STATUS==='All'||e.status===STATUS||(STATUS==='Completed'&&['On time','Late'].includes(e.status))||(STATUS==='Due'&&['On time','Late','Overdue'].includes(e.status));
 const rank={Overdue:0,'Due today':1,Upcoming:2,Late:3,'On time':4,Completed:5};
 const completedRows=ORDERS.filter(r=>r.bulkActual&&r.bulkActual<=($('asof').value||dhakaDate())).map(r=>({...r.events.find(e=>e.event==='Bulk Pattern'),actual:r.bulkActual,order:r,status:'Completed'}));
 ACTION_ROWS=(STATUS==='Size sets complete'?completedRows:EVENTS.filter(matches)).sort((a,b)=>rank[a.status]-rank[b.status]||a.plan.localeCompare(b.plan)||a.order.ewo.localeCompare(b.order.ewo));
 const size=12,max=Math.max(0,Math.ceil(ACTION_ROWS.length/size)-1);PAGE=Math.max(0,Math.min(PAGE,max));const rows=ACTION_ROWS.slice(PAGE*size,(PAGE+1)*size),cutoff=$('asof').value||dhakaDate();
 $('tracker-count').textContent=fmt(ACTION_ROWS.length)+' milestones';
 $('actions').innerHTML='<thead><tr><th>EWO / Color</th><th>Buyer / Line</th><th>TNA milestone</th><th>Planned</th><th>Actual</th><th>Current owner</th><th>Status</th></tr></thead><tbody>'+rows.map(e=>'<tr><td><button class="row-open" data-detail="'+e.order.id+'"><span class="order">'+esc(e.order.ewo)+'</span><small>'+esc(e.order.color)+'</small></button></td><td>'+esc(e.order.buyer)+'<small>Line '+e.order.line+'</small></td><td>'+esc(e.event)+'</td><td>'+short(e.plan)+'</td><td>'+(e.actual&&e.actual<=cutoff?short(e.actual):'—')+'</td><td>'+esc(e.owner)+'</td><td><span class="pill '+(['On time','Completed'].includes(e.status)?'on-time':e.status==='Overdue'?'overdue':e.status==='Late'?'late':e.status==='Due today'?'today':'pending')+'">'+esc(e.status)+(e.status==='Overdue'?' · '+days(cutoff,e.plan)+'d':'')+'</span></td></tr>').join('')+'</tbody>';
 if(!rows.length)$('actions').innerHTML='<tbody><tr><td colspan="7" class="empty">No matching milestones.</td></tr></tbody>';
 $('page-count').textContent=ACTION_ROWS.length?(PAGE*size+1)+'–'+Math.min((PAGE+1)*size,ACTION_ROWS.length)+' of '+fmt(ACTION_ROWS.length):'0 milestones';$('prev').disabled=PAGE===0;$('next').disabled=PAGE>=max;
 document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{STATUS=b.dataset.status;PAGE=0;renderTracker();});document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>openOrder(+b.dataset.detail));
}
function openOrder(id){const r=TNA_ORDERS[id],cutoff=$('asof').value||dhakaDate();
 $('detail-content').innerHTML='<div class="dialog-head"><span class="eyebrow">EWO / Color · Milestone timeline</span><h2>'+esc(r.ewo)+' <span style="font-weight:500;font-size:14px">'+esc(r.color)+'</span></h2><p>'+esc(r.buyer)+' · Line '+r.line+' · PCD '+short(r.pcd)+' · EFD '+short(r.efd)+' · '+fmt(r.qty)+' garment pcs</p></div><div class="timeline-scroll"><div class="timeline">'+r.events.map((e,i)=>{const s=classify(e,cutoff);return '<div class="timeline-item"><span class="step">'+String(i+1).padStart(2,'0')+'</span><div><b>'+esc(e.event)+'</b><small>'+esc(e.owner)+'</small></div><div><small>PLAN</small>'+short(e.plan)+'</div><div><small>ACTUAL</small>'+(e.actual&&e.actual<=cutoff?short(e.actual):'—')+'</div><span class="pill '+(['On time','Completed'].includes(s)?'on-time':s==='Late'?'late':s==='Overdue'?'overdue':s==='Due today'?'today':'pending')+'">'+s+'</span></div>';}).join('')+'</div></div><div class="timeline-note"><b>Next action:</b> '+esc(r.next||'—')+'<br><b>When:</b> '+esc(r.when||'—')+'<br><b>Who:</b> '+esc(r.who||'—')+'<br><b>Remarks:</b> '+esc(r.remarks||'—')+'</div>';
 $('detail').showModal();
}
for(const id of ['buyer','line','event','asof'])$(id).onchange=()=>{PAGE=0;render();};$('search').oninput=()=>{PAGE=0;render();};
$('clear').onclick=()=>{for(const id of ['buyer','line','event','search'])$(id).value='';$('asof').value=dhakaDate();STATUS='All';PAGE=0;render();};
$('overview-tab').onclick=()=>setView('overview');$('tracker-tab').onclick=()=>setView('tracker');
$('kpi-otd').onclick=()=>setView('tracker','On time');$('kpi-due').onclick=()=>setView('tracker','Due');$('kpi-overdue').onclick=()=>setView('tracker','Overdue');$('all-actions').onclick=()=>setView('tracker','Overdue');
$('kpi-complete').onclick=()=>{$('event').value='Bulk Pattern';setView('tracker','Size sets complete');};
$('prev').onclick=()=>{PAGE--;renderTracker();};$('next').onclick=()=>{PAGE++;renderTracker();};$('detail-close').onclick=()=>$('detail').close();

function fillTnaFilters(reset=false){
 for(const [id,values,label] of [['buyer',[...new Set(TNA_ORDERS.map(r=>r.buyer))].sort(),'All Buyers'],['line',[...new Set(TNA_ORDERS.map(r=>r.line))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),'All Lines'],['event',TNA_STEPS.map(s=>s[0]),'All milestones']]){
  const el=$(id),old=reset?'':el.value;el.innerHTML=opt('',label)+values.map(v=>opt(v,id==='line'?'Line '+v:v)).join('');el.value=values.includes(old)?old:'';
 }
}
function receiveTnaSnapshot(rows,label,planId){
 const reset=TNA_PLAN_ID!==String(planId||'');TNA_PLAN_ID=String(planId||'');TNA_LABEL=String(label||'Size Set report');TNA_RAW=rows;
 const parsed=normalizeTnaRows(rows,$('date-policy').value);TNA_ORDERS=parsed.orders;DATE_COUNTS=parsed.counts;fillTnaFilters(reset);
 if(reset){$('search').value='';STATUS='All';PAGE=0;$('detail').close();}
 else if($('detail').open)$('detail').close();
 $('source-label').textContent=TNA_LABEL;TNA_LOADING=false;$('refresh').disabled=false;$('refresh').textContent='Refresh';
 $('source-note').textContent=TNA_ORDERS.length.toLocaleString()+' selected-plan Size Set report rows · Source: '+TNA_LABEL;
 $('date-checks').textContent=DATE_COUNTS.inferred+' yearless dates inferred · '+DATE_COUNTS.excluded+' invalid / unanchored planned dates excluded';
 render();
}
$('date-policy').onchange=()=>receiveTnaSnapshot(TNA_RAW,TNA_LABEL,TNA_PLAN_ID);
$('refresh').onclick=()=>{if(parent===window)return;TNA_LOADING=true;$('refresh').disabled=true;$('refresh').textContent='Refreshing…';parent.postMessage({type:'ekwl:size-tna-refresh'},location.origin);};
window.addEventListener('message',event=>{
 if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='ekwl:size-tna')return;
 document.documentElement.dataset.theme=event.data.theme==='dark'?'dark':'light';
 if(Array.isArray(event.data.rows))receiveTnaSnapshot(event.data.rows,event.data.label,event.data.planId);
 if(event.data.error){$('refresh').disabled=false;$('refresh').textContent='Refresh';$('source-label').textContent='Refresh failed; showing last complete report.';}
});
$('asof').value=dhakaDate();fillTnaFilters();render();
if(parent!==window)parent.postMessage({type:'ekwl:size-tna-ready'},location.origin);
