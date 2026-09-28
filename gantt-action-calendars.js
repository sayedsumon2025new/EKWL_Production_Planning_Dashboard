/* Slide 07 calendars. Every event is derived from the current Planning snapshot or active SQL reports. */
const GANTT_ACTION_NAMES={pcd:'PCD',psd:'PSD',size:'Size Set',accessories:'Accessories',print:'Print',embroidery:'Embroidery',cutting:'Cutting'};
const GANTT_ACTION_MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const GANTT_ACTION_CACHE=new Map();
const GANTT_PSD_SOURCE_CACHE=new Map();
let GANTT_ACTION_TAB='gantt',GANTT_ACTION_MONTH='',GANTT_ACTION_DAY=0,GANTT_ACTION_REQUEST=0;
let GANTT_ACTION_VISIBLE=[],GANTT_ACTION_NOTICE='';
function resetGanttActionCache(){GANTT_ACTION_CACHE.clear();GANTT_PSD_SOURCE_CACHE.clear();++GANTT_ACTION_REQUEST;if(GANTT_ACTION_TAB!=='gantt')renderGanttActionCalendar();}
function ganttActionRefresh(){GANTT_ACTION_CACHE.delete(GANTT_ACTION_TAB);GANTT_PSD_SOURCE_CACHE.clear();GANTT_ACTION_NOTICE='Reloaded active SQL report.';renderGanttActionCalendar();}
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
function ganttPsdKey(line,ewo,color){return [Number(line)||0,ganttKey(ewo),ganttColorKey(color)].join('|');}
function ganttPsdGroups(){
  const groups=new Map();
  for(const row of DATA){
    const date=ganttActionDate(row.startdate),key=ganttPsdKey(row.line,row.ewo,row.color);
    if(!date?.year||!ganttKey(row.ewo)||!Number(row.line))continue;
    if(!groups.has(key))groups.set(key,{key,line:row.line,ewo:row.ewo,color:row.color,date,recordIds:new Set(),printFlags:new Set(),embFlags:new Set(),outsourceValues:new Set(),products:new Set()});
    const group=groups.get(key);
    if(row.record_id!=null)group.recordIds.add(String(row.record_id));
    if(ganttPsdDateKey(date)<ganttPsdDateKey(group.date))group.date=date;
    if(String(row.print||'').trim())group.printFlags.add(String(row.print).trim().toLowerCase());
    if(String(row.emb||'').trim())group.embFlags.add(String(row.emb).trim().toLowerCase());
    if(String(row.outsource||'').trim())group.outsourceValues.add(String(row.outsource).trim());
    if(String(row.productName||'').trim())group.products.add(String(row.productName).trim());
  }
  return groups;
}
function ganttPsdPlanTotals(groups){
  const byId=new Map(),seen=new Set(),totals=new Map();
  for(const group of groups.values())for(const id of group.recordIds)byId.set(id,group.key);
  for(const daily of DAILY_PLAN){
    const id=String(daily.record_id),key=byId.get(id),date=String(daily.date||'');
    if(!key||!date||seen.has(id+'|'+date))continue;
    seen.add(id+'|'+date);totals.set(key,(totals.get(key)||0)+(Number(daily.value)||0));
  }
  return totals;
}
function ganttPsdNumber(value){const n=Number(String(value??'').replace(/,/g,'').trim());return Number.isFinite(n)?n:0;}
async function ganttPsdPaged(build){
  const all=[];for(let from=0;;from+=500){const {data,error}=await build().range(from,from+499);if(error)throw error;
    all.push(...(data||[]));if(!data||data.length<500)break;}return all;
}
async function ganttPsdSources(ewos){
  const ids=[...new Set(ewos.map(ganttKey))].filter(Boolean).sort(),key=ids.join('|');
  const saved=GANTT_PSD_SOURCE_CACHE.get(key);if(saved&&Date.now()-saved.at<60000)return saved.promise;
  const promise=Promise.allSettled([
    ganttPsdPaged(()=>SB.from('order_bank_latest_all').select('EWO,GmtColor,OrderQty').in('EWO',ids)),
    ganttActionSqlRows('size_set_rows','row_data'),
    ganttPsdPaged(()=>SB.from('embellishment_send_receive_rows').select('"Date","EWO No","Color","Today Print Send Qty\n"," Today Print Receive Qty","Today EMB Send Qty","Today EMB Receive Qty"').eq('is_active',true).in('EWO No',ids).order('source_row_no',{ascending:true}))
  ]);
  GANTT_PSD_SOURCE_CACHE.set(key,{at:Date.now(),promise});
  return promise;
}
function ganttPsdDateKey(date){return date?.year?`${date.year}-${String(date.month).padStart(2,'0')}-${String(date.day).padStart(2,'0')}`:'';}
function ganttPsdStatus(rows,field){return [...new Set(rows.map(r=>String(r.row_data?.[field]||'').trim()).filter(Boolean))].join(' · ')||'—';}
function ganttPsdFlag(flags){return flags?.has('yes')?'Yes':flags?.has('no')?'No':'—';}
function ganttPsdSummary(dayEvents,results){
  const groups=ganttPsdGroups(),plan=ganttPsdPlanTotals(groups),lines=new Map();
  const orders=results[0]?.status==='fulfilled'?results[0].value:null;
  const byOrder=new Map();
  for(const row of orders||[]){const key=ganttKey(row.EWO)+'|'+ganttColorKey(row.GmtColor);
    byOrder.set(key,(byOrder.get(key)||0)+ganttPsdNumber(row.OrderQty));}
  for(const event of dayEvents){
    const group=groups.get(ganttPsdKey(event.line,event.ewo,event.color));if(!group)continue;
    const line=Number(group.line),ewo=ganttKey(group.ewo);
    if(!lines.has(line))lines.set(line,{ewos:new Set(),products:new Set(),colors:new Set(),order:0,orderKnown:!!orders,plan:0});
    const item=lines.get(line);item.ewos.add(ewo);
    for(const product of group.products)item.products.add(product);
    const colorKey=ewo+'|'+ganttColorKey(group.color);
    if(!item.colors.has(colorKey)){
      item.colors.add(colorKey);
      if(byOrder.has(colorKey))item.order+=byOrder.get(colorKey);
      else item.orderKnown=false;
    }
    item.plan+=plan.get(group.key)||0;
  }
  const fmt=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
  const counts=[...lines.values()],totalPairs=counts.reduce((n,x)=>n+x.ewos.size,0);
  const totalPlan=counts.reduce((n,x)=>n+x.plan,0),allOrdersKnown=counts.every(x=>x.orderKnown);
  const totalOrder=counts.reduce((n,x)=>n+x.order,0);
  const rows=[...lines.entries()].sort((a,b)=>a[0]-b[0]).map(([line,item])=>`<tr><td class="psd-summary-line">${esc(String(line).padStart(2,'0'))}</td>`+
    `<td>${item.ewos.size}</td><td class="psd-summary-products">${item.products.size?esc([...item.products].sort().join(' · ')):'—'}</td><td class="psd-summary-ewos">${esc([...item.ewos].sort().join(', '))}</td><td>${item.ewos.size}</td>`+
    `<td>${item.orderKnown?fmt(item.order):'—'}</td><td>${fmt(item.plan)}</td><td>${fmt(Math.round(item.plan/item.ewos.size))}</td></tr>`).join('');
  return `<div class="psd-summary-head"><span>${esc(GANTT_ACTION_MONTHS[Number(GANTT_ACTION_MONTH.slice(-2))-1]||'')} ${esc(GANTT_ACTION_MONTH.slice(0,4))}</span><strong>PSD Summary · ${esc(dayEvents[0]?.date.label||'Selected date')}</strong></div>`+
    '<div class="psd-summary-scroll"><table class="psd-summary-table"><thead><tr><th>Line</th><th>Total PSD</th><th>Plan Product Name</th><th>EWO</th><th>Total EWO</th><th>Total Order Qty · pcs</th><th>Total Plan Qty · pcs</th><th>AVG Plan Qty / EWO</th></tr></thead><tbody>'+
    (rows||'<tr><td colspan="8">No PSD for this date.</td></tr>')+'</tbody><tfoot><tr><td class="psd-summary-line">G.Total</td>'+
    `<td>${totalPairs}</td><td>—</td><td>—</td><td>${totalPairs}</td><td>${allOrdersKnown?fmt(totalOrder):'—'}</td><td>${fmt(totalPlan)}</td><td>${totalPairs?fmt(Math.round(totalPlan/totalPairs)):'—'}</td></tr></tfoot></table></div>`+
    '<p class="psd-summary-note">Selected Plan · one PSD per Line and EWO, regardless of color. Order Qty follows Order Bank by EWO and color.</p>';
}
function ganttPsdTable(dayEvents,results){
  const groups=ganttPsdGroups(),plan=ganttPsdPlanTotals(groups);
  const available=i=>results[i]?.status==='fulfilled';
  const source=i=>available(i)?results[i].value:[];
  const byKey=(rows,ewoField,colorField)=>{
    const map=new Map();for(const row of rows){const key=ganttKey(ewoField(row))+'|'+ganttColorKey(colorField(row));
      if(!map.has(key))map.set(key,[]);map.get(key).push(row);}return map;
  };
  const orders=byKey(source(0),r=>r.EWO,r=>r.GmtColor);
  const sizes=byKey(source(1),r=>r.row_data?.EWO,r=>r.row_data?.Color);
  const embellishments=byKey(source(2),r=>r['EWO No'],r=>r.Color);
  const cutting=byKey(FABRIC_CUTTING_DATA||[],r=>r.ewo,r=>r.color_name);
  const fmt=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
  const cell=n=>n==null?'—':fmt(n);
  const sum=(rows,field)=>rows.length?rows.reduce((total,r)=>total+ganttPsdNumber(r[field]),0):null;
  const metric=(send,received)=>send==null?'—':`Sent ${fmt(send)} · Received ${fmt(received)}<br><small>Balance ${fmt(send-received)} pcs</small>`;
  const rows=dayEvents.map(event=>{
    const group=groups.get(ganttPsdKey(event.line,event.ewo,event.color));if(!group)return '';
    const match=ganttKey(group.ewo)+'|'+ganttColorKey(group.color),fabric=cutting.get(match)||[];
    const size=sizes.get(match)||[],order=orders.get(match)||[];
    const emb=(embellishments.get(match)||[]).filter(r=>{
      const date=ganttActionDate(r.Date);return date?.year&&ganttPsdDateKey(date)<=ganttPsdDateKey(group.date);
    });
    const cuttingStatus=fabric.length?`${esc([...new Set(fabric.map(r=>String(r.status||'').trim()).filter(Boolean))].join(' · ')||'Cutting report')}<br><small>Cut ${cell(sum(fabric,'total_cut_qty'))} · Balance ${cell(sum(fabric,'cutting_balance'))} pcs</small>`:'—';
    const sizeStatus=available(1)&&size.length?`${esc(ganttPsdStatus(size,'Next Action to Do\n(What)'))}<br><small>When: ${esc(ganttPsdStatus(size,'When'))}</small>`:'—';
    const activity=(send,receive,flag)=>{
      if(!available(2))return '—';
      const sent=sum(emb,send)||0,received=sum(emb,receive)||0;
      return sent||received?metric(sent,received):`<strong class="psd-flag ${flag==='Yes'?'yes':'no'}">${esc(flag)}</strong>`;
    };
    const outsource=group.outsourceValues.size?`<strong class="psd-flag yes">Yes</strong><br><small>${esc([...group.outsourceValues].join(' · '))}</small>`:'<strong class="psd-flag no">No</strong>';
    return `<tr><td><strong>${esc(String(group.line).padStart(2,'0'))}</strong></td><td><strong>${esc(group.ewo)}</strong></td><td>${esc(group.color)}</td>`+
      `<td class="psd-num">${available(0)?cell(sum(order,'OrderQty')):'—'}</td><td class="psd-num">${fmt(plan.get(group.key)||0)}</td><td>${esc(group.date.label)}</td>`+
      `<td class="psd-num">${cell(sum(fabric,'fabric_booking_qty'))}</td><td class="psd-num">${cell(sum(fabric,'total_fabric_received'))}</td><td class="psd-num">${cell(sum(fabric,'fabric_balance'))}</td>`+
      `<td>${sizeStatus}</td><td>${cuttingStatus}</td><td>${activity('Today EMB Send Qty','Today EMB Receive Qty',ganttPsdFlag(group.embFlags))}</td><td>${activity('Today Print Send Qty\n',' Today Print Receive Qty',ganttPsdFlag(group.printFlags))}</td><td>${outsource}</td></tr>`;
  }).join('');
  const missing=['Order Bank','Size Set','Embellishment'].filter((_,i)=>!available(i));
  const columns=['Line','EWO','Color','Order Qty · pcs','Cumulative Plan Qty · pcs','First PSD','Fabrics Booking · kg','Fabrics Received · kg','Fabrics Balance · kg','Size Set status','Cutting status','Embroidery status','Print status','Outsource status'];
  return `<div class="psd-table-title"><strong>Line-wise PSD & prior activity</strong><span>${dayEvents.length} Line–EWO–Color rows</span></div>`+
    '<div class="psd-table-scroll"><table class="psd-table"><thead><tr>'+columns.map(label=>`<th scope="col">${esc(label)}</th>`).join('')+'</tr></thead><tbody>'+
    (rows||'<tr><td colspan="14">No Line–EWO–Color starts on this date.</td></tr>')+'</tbody></table></div>'+
    '<p class="psd-table-note">First PSD across POs for each Line–EWO–Color in the selected Plan. Plan Qty covers all Plan/Day dates. Embroidery and Print include dated activity through PSD; without activity they show the selected Plan’s Yes/No flag. Outsource follows the selected Plan. Fabric/Cutting and Size Set are current report snapshots.'+
    (missing.length?' Unavailable report access: '+esc(missing.join(', '))+'.':'')+'</p>';
}
async function renderGanttPsdTable(dayEvents,token){
  const slot=document.getElementById('gantt-psd-table'),summary=document.getElementById('gantt-psd-summary');if(!slot)return;
  if(!dayEvents.length){slot.innerHTML=ganttPsdTable([],[]);if(summary)summary.innerHTML=ganttPsdSummary([],[]);return;}
  const result=await ganttPsdSources(dayEvents.map(e=>e.ewo));
  if(token!==GANTT_ACTION_REQUEST||GANTT_ACTION_TAB!=='psd')return;
  if(summary)summary.innerHTML=ganttPsdSummary(dayEvents,result);
  slot.innerHTML=ganttPsdTable(dayEvents,result);
}
document.head.insertAdjacentHTML('beforeend',`<style>
#gantt-psd-table{margin-top:18px;color:#17263d}.psd-table-title{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:17px 19px;background:#fff;border:1px solid #e0e7ef;border-bottom:0;border-radius:14px 14px 0 0}.psd-table-title strong{font-size:16px}.psd-table-title span{font-size:13px;color:#496684}.psd-table-scroll{overflow:auto;background:#fff;border:1px solid #e0e7ef;border-radius:0 0 14px 14px}.psd-table{border-collapse:separate;border-spacing:0;min-width:1500px;width:100%;font-size:13px}.psd-table th{background:#eaf1fa;color:#294265;text-align:left;font-size:12px;white-space:nowrap;padding:12px 13px;border-bottom:1px solid #cfdce9}.psd-table td{padding:14px 13px;min-width:85px;vertical-align:top;border-bottom:1px solid #e9eef5;line-height:1.5}.psd-table tbody tr:hover{background:#f4f9ff}.psd-table td small{color:#63768c}.psd-table .psd-num{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}.psd-table-note{font-size:13px;line-height:1.55;color:#52647b;margin:10px 0 0}
</style>`);
document.head.insertAdjacentHTML('beforeend',`<style>
#s11 .psd-overview{display:grid;grid-template-columns:minmax(315px,365px) minmax(0,1fr);gap:14px;align-items:start;margin:12px 0 16px}
#s11 .psd-compact-calendar,#s11 .psd-summary{background:#fff;border:1px solid #d9e5ee;border-radius:10px;padding:12px;min-width:0}
#s11 .psd-compact-calendar .action-month{justify-content:center;gap:9px;margin:0 0 9px;font-size:12px}
#s11 .psd-compact-calendar .action-month button{padding:4px 8px}
#s11 .psd-compact-calendar .action-grid{gap:3px}
#s11 .psd-compact-calendar .action-day{min-height:38px;padding:3px 4px;text-align:center;border-radius:5px}
#s11 .psd-compact-calendar .action-day b{font-size:11px}
#s11 .psd-compact-calendar .action-day small{font-size:8px;margin-top:1px}
#s11 .psd-summary{padding:10px 12px}
#s11 .psd-summary-head{display:grid;grid-template-columns:86px 1fr;text-align:center;border:1px solid #34485b;border-bottom:0;color:#405c77;font-size:13px;font-weight:800}
#s11 .psd-summary-head span{border-right:1px solid #34485b;padding:5px}
#s11 .psd-summary-head strong{padding:5px}
#s11 .psd-summary-scroll{overflow:auto;max-height:259px;border:1px solid #34485b}
#s11 .psd-summary-table{width:100%;min-width:940px;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}
#s11 .psd-summary-table th{background:#fffbc8;color:#1f2937;border:1px solid #6e7c86;padding:7px 4px;text-align:center;line-height:1.25}
#s11 .psd-summary-table td{border:1px solid #9da9b2;padding:6px;text-align:center}
#s11 .psd-summary-table .psd-summary-line{background:#989ca0;color:white;font-weight:800;text-align:left}
#s11 .psd-summary-table .psd-summary-ewos{text-align:left}
#s11 .psd-summary-table .psd-summary-products{text-align:left;min-width:150px}
#s11 .psd-summary-table tfoot{position:sticky;bottom:0}
#s11 .psd-summary-table tfoot td:not(.psd-summary-line){background:#f7f8f9;color:#e87900;font-weight:800}
#s11 .psd-summary-note{font-size:11px;color:#60778d;margin:8px 0 0;line-height:1.4}
#s11 .psd-flag{display:inline-block;padding:3px 8px;border-radius:5px;font-size:12px}
#s11 .psd-flag.yes{background:#e3f4e9;color:#176b44}
#s11 .psd-flag.no{background:#edf1f4;color:#536779}
@media(max-width:900px){#s11 .psd-overview{grid-template-columns:1fr}}
</style>`);
async function ganttActionEvents(tab){
  if(tab==='psd'){
    return [...ganttPsdGroups().values()].map(group=>({date:group.date,ewo:String(group.ewo),line:String(group.line),color:String(group.color),
      action:'First PSD / production start',detail:'First PSD across POs for this line, EWO and color',source:'Planning SQL · selected version'}));
  }
  if(tab==='pcd'){
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
function ganttActionLines(event){return String(event.line||'').split('/').map(x=>Number(x.trim())).filter(Boolean);}
function ganttActionSelect(id,values,label){
  const select=document.getElementById(id),selected=select?.value||'';if(!select)return '';
  select.innerHTML=`<option value="">All ${label}</option>`+values.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  select.value=values.includes(selected)?selected:'';return select.value;
}
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
    if(ewo)events=events.filter(e=>e.ewo.toUpperCase().includes(ewo));
    const lines=[...new Set(events.flatMap(ganttActionLines))].sort((a,b)=>a-b).map(x=>String(x).padStart(2,'0'));
    const line=ganttActionSelect('action-line',lines,'lines');
    if(line)events=events.filter(e=>ganttActionLines(e).includes(Number(line)));
    const colors=[...new Set(events.map(e=>String(e.color||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const color=ganttActionSelect('action-color',colors,'colors');
    if(color)events=events.filter(e=>ganttColorKey(e.color)===ganttColorKey(color));
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
    const calendar=`<div class="action-month"><button type="button" onclick="ganttActionMoveMonth(-1)" ${idx===0?'disabled':''} aria-label="Previous month">←</button><span>${GANTT_ACTION_MONTHS[month-1]} ${year||'· year not supplied'}</span><button type="button" onclick="ganttActionMoveMonth(1)" ${idx===months.length-1?'disabled':''} aria-label="Next month">→</button><span>${monthEvents.length.toLocaleString('en-US')} events</span></div>`+
      (year?'':'<p class="action-note">Source dates have no year; weekday and overdue status are not inferred.</p>')+
      `<div class="action-grid">${weekday}${cells}</div>`;
    body.innerHTML=banner+(GANTT_ACTION_NOTICE?`<p class="action-note">${esc(GANTT_ACTION_NOTICE)}</p>`:'')+
      '<div class="action-kpis">'+counts.map(([name,value])=>`<div class="action-kpi">${esc(name)}<strong>${value.toLocaleString('en-US')}</strong></div>`).join('')+'</div>'+
      (tab==='psd'?`<div class="psd-overview"><div class="psd-compact-calendar">${calendar}</div><section id="gantt-psd-summary" class="psd-summary">Loading PSD summary…</section></div>`:calendar)+
      `<h3>${GANTT_ACTION_DAY} ${GANTT_ACTION_MONTHS[month-1]} · ${dayEvents.length.toLocaleString('en-US')} events</h3>`+
      (tab==='psd'?'<div id="gantt-psd-table" class="action-note">Loading matching Order Bank and activity reports…</div>':`<div class="action-events">${details||'<p class="action-note">No events for this day.</p>'}</div>`)+
      (dayEvents.length>300?'<p class="action-note">Showing first 300 events. Filter by EWO or line for the rest.</p>':'');
    if(tab==='psd')renderGanttPsdTable(dayEvents,token).catch(error=>{if(token!==GANTT_ACTION_REQUEST)return;console.warn('PSD activity table source unavailable',error);
      const slot=document.getElementById('gantt-psd-table');if(slot)slot.innerHTML='<p class="action-note">The activity table could not load. Try Refresh SQL.</p>';});
  }catch(error){if(token!==GANTT_ACTION_REQUEST)return;console.warn('Action calendar source unavailable',error);
    body.innerHTML='<p class="action-note">This calendar could not read its SQL source. Check report access and try again.</p>';}
}
