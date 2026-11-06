/* Slide 07 popup: use the selected Gantt cell, current Plan snapshot, and active SQL reports. */
let GANTT_HOVER_REQUEST=0;
let GANTT_POPUP_TRIGGER=null;
const ganttKey=v=>gsEwo(v);
const ganttColorKey=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' ');
const ganttQty=v=>Number(v)||0;
function resetGanttHoverCache(types){invalidateDataCache([...VERSIONED_DATA_CACHE.keys()].filter(key=>key.startsWith('hover:')));invalidateEwoSources(types);++GANTT_HOVER_REQUEST;closeGanttPopup();if(typeof resetGanttActionCache==='function')resetGanttActionCache();}

async function ganttHoverSources(ewo,color,colors){
  const allowed=new Set((colors||[color]).map(ganttColorKey));
  const key=ganttKey(ewo)+'|'+[...allowed].sort().join('|');
  return loadVersionedData('hover:'+key,()=>Promise.allSettled([
    loadEwoSource('size'),
    loadEwoSource('accessories'),
    Promise.resolve(GANTT_EMBELLISHMENT),
    loadEwoSource('orderbank')
  ]).then(results=>{
    const available=i=>results[i].status==='fulfilled';
    const ewoRows=i=>available(i)?results[i].value.filter(row=>ganttKey(i<2?row.row_data?.EWO:i===2?row['EWO No']:row.EWO)===ganttKey(ewo)):[];
    const matching=(i,getColor)=>ewoRows(i).filter(row=>allowed.has(ganttColorKey(getColor(row))));
    const size=matching(0,row=>row.row_data?.Color),accessories=ewoRows(1);
    const embellishment=matching(2,row=>row.Color);
    const orderBank=matching(3,row=>row.GmtColor);
    const unique=(list,getValue)=>[...new Set(list.map(getValue).map(v=>String(v??'').trim()).filter(Boolean))].join(' | ')||null;
    const qty=(row,column)=>{
      const value=String(row[column]??'').replace(/,/g,'').trim();
      return /^-?\d+(?:\.\d+)?$/.test(value)?Number(value):0;
    };
    const sum=column=>embellishment.reduce((total,row)=>total+qty(row,column),0);
    const errors=['Size Set','Accessories','Embellishment','Order Bank'].filter((_,i)=>!available(i));
    return {
      size_rows:available(0)?size.length:0,
      size_action:unique(size,row=>row.row_data?.['Next Action to Do\n(What)']),
      accessories_rows:available(1)?accessories.length:0,
      accessories_status:unique(accessories,row=>row.row_data?.['Sewing Trims Pending Stts']),
      order_bank_rows:available(3)?orderBank.length:0,
      order_qty:available(3)&&orderBank.length?orderBank.reduce((total,row)=>total+qty(row,'OrderQty'),0):null,
      embellishment_rows:available(2)?embellishment.length:0,
      print_send:sum('Today Print Send Qty\n'),
      print_receive:sum(' Today Print Receive Qty'),
      embroidery_send:sum('Today EMB Send Qty'),
      embroidery_receive:sum('Today EMB Receive Qty'),
      errors
    };
  }),{ttl:EWO_SOURCE_TTL});
}

function ganttHoverSewing(line,ewo,colors){
  const result=new Map();
  const allowed=new Set(colors.map(ganttColorKey));
  for(const row of SEWING_IO_DATA){
    if(Number(row.line_no)!==Number(line)||ganttKey(row.ewo)!==ganttKey(ewo)||!allowed.has(ganttColorKey(row.color)))continue;
    const rowColor=String(row.color||'').trim(),key=ganttColorKey(rowColor);
    if(!result.has(key))result.set(key,{color:rowColor||'Unspecified',input:0,output:0,reject:0,wip:0});
    const item=result.get(key);
    for(const field of ['input','output','reject','wip'])item[field]=item[field]===null||row[field]==null||String(row[field]).trim()===''?null:item[field]+ganttQty(row[field]);
  }
  return [...result.values()].sort((a,b)=>a.color.localeCompare(b.color));
}

function ganttHoverPlan(w){
  const allowed=new Set(w.selectedColors.map(ganttColorKey));
  const rows=DATA.filter(row=>ganttKey(row.ewo)===ganttKey(w.ewo)&&allowed.has(ganttColorKey(row.color)));
  const seen=new Set(),pos=[];
  for(const row of rows){
    const key=[row.po,row.orderqty,row.deliverydate].join('|');
    if(!row.po||seen.has(key))continue;
    seen.add(key);pos.push(row);
  }
  return {pos,meta:rows[0]||null,total:pos.length?pos.reduce((sum,row)=>sum+ganttQty(row.orderqty),0):null};
}

function ganttHoverPlanSah(w){
  // These arrays belong to the selected SQL planning snapshot. Daily SAH keeps
  // record_id; join to the SAH/Day source record for its garment color.
  const records=new Map(SAH_DATA.map(row=>[String(row.record_id),row]));
  const allowed=new Set(w.selectedColors.map(ganttColorKey));
  const seen=new Set();let total=0,matched=false;
  for(const daily of SAH_DAILY){
    const record=records.get(String(daily.record_id));
    if(!record||Number(record.line)!==Number(w.line)||ganttKey(record.ewo)!==ganttKey(w.ewo)||
      String(daily.date).slice(0,10)!==String(w.date).slice(0,10)||!allowed.has(ganttColorKey(record.color)))continue;
    const key=String(daily.record_id)+'|'+String(daily.date).slice(0,10);
    if(seen.has(key))continue;
    seen.add(key);
    if(daily.value==null||String(daily.value).trim()===''||!Number.isFinite(Number(daily.value)))continue;
    matched=true;total+=Number(daily.value);
  }
  return matched?total:null;
}

function ganttPopupColors(w){
  const listed=Array.isArray(w.planColors)&&w.planColors.length?w.planColors:[{color:w.color||'',qty:w.qty}];
  const unique=new Map();
  for(const x of listed){
    const color=String(x.color||'').trim(),key=ganttColorKey(color);
    if(!key)continue;
    if(!unique.has(key))unique.set(key,{color,qty:0});
    unique.get(key).qty+=ganttQty(x.qty);
  }
  return [...unique.values()].sort((a,b)=>b.qty-a.qty||a.color.localeCompare(b.color));
}

function ganttPopupHeader(w){
  const options=ganttPopupColors(w);
  const peers=Array.isArray(w.cellEwos)?w.cellEwos:[];
  const amounts=peers.map(item=>({...item,selectedColors:ganttPopupColors(item).map(x=>x.color)}));
  const totalSah=amounts.map(item=>ganttHoverPlanSah(item));
  const context=peers.length>1?`<div class="gt-cell-summary"><span>Line ${esc(w.line)} · ${esc(w.date)} · ${peers.length} planned EWOs</span><strong>Total Plan Qty ${esc(peers.reduce((sum,item)=>sum+ganttQty(item.qty),0).toLocaleString('en-US'))} · Plan SAH ${totalSah.every(x=>x!==null)?esc(totalSah.reduce((sum,x)=>sum+x,0).toLocaleString('en-US')):'—'}</strong></div>`+
    '<div class="gt-ewo-options" aria-label="Select planned EWO">'+amounts.map(item=>{
      const sah=ganttHoverPlanSah(item),selected=ganttKey(item.ewo)===ganttKey(w.ewo);
      return `<button type="button" class="gt-ewo-option" data-popup-ewo="${esc(item.ewo)}" aria-pressed="${selected}"><strong>EWO ${esc(item.ewo)}</strong><span>${esc(item.selectedColors.join(' / '))}</span><small>Plan ${esc(ganttQty(item.qty).toLocaleString('en-US'))} pcs · SAH ${sah===null?'—':esc(sah.toLocaleString('en-US'))}</small></button>`;
    }).join('')+'</div>':'';
  return context+`<div class="gt-title">EWO ${esc(w.ewo)}<small>Line ${esc(w.line)} · ${esc(w.date)}</small></div>`+
    '<div class="gt-color-filter"><label for="gt-plan-color">Plan Color</label>'+
    `<select id="gt-plan-color" class="gt-color-select" aria-label="Filter popup by planned color" ${options.length<2?'disabled':''}>`+
    `<option value="__all__" ${w.allColors?'selected':''}>All Colors · ${options.reduce((n,x)=>n+ganttQty(x.qty),0).toLocaleString('en-US')} pcs</option>`+
    options.map(x=>`<option value="${esc(x.color)}" ${!w.allColors&&ganttColorKey(x.color)===ganttColorKey(w.color)?'selected':''}>${esc(x.color)} · ${ganttQty(x.qty).toLocaleString('en-US')} pcs</option>`).join('')+
    `</select><span>${options.length} planned color${options.length===1?'':'s'}</span></div>`;
}

function ganttPopupCuttingWip(w,source){
 const model=getGanttStock(),items=[...new Set(w.selectedColors.map(gsColor))].map(color=>model.pairs.get(gsPair(w.ewo,color)));
 return {value:items.length&&items.every(p=>p?.cutting!==null&&p?.cutting!==undefined)?items.reduce((n,p)=>n+p.cutting,0):null,reason:[...new Set(items.flatMap(p=>p?.reasons||['No matching EWO + Color.']))].join(' ')};
}
function ganttPopupAllocation(w){
 const rows=(getGanttStock().details.get(JSON.stringify([w.date,Number(w.line),gsEwo(w.ewo)]))||[]).filter(r=>w.selectedColors.some(c=>gsColor(c)===r.color));
 if(!rows.length)return '<div class="gt-row">No allocation through the production cutoff, or no matching plan.</div>';
 return rows.map(r=>'<div class="gt-row"><span>'+esc(r.color)+' · Delivery '+esc(r.delivery||'Missing / last priority')+'</span><strong>Plan '+esc(r.value.toLocaleString('en-US'))+'</strong></div>'+[ [3,'Sewing'],[4,'Ready Cutting'],[2,'Embroidery'],[1,'Print'] ].map(([i,name])=>'<div class="gt-row"><span>'+name+' allocated</span><strong>'+esc(r.stages[i]===null?'—':r.stages[i].toLocaleString('en-US'))+'</strong></div>').join('')+'<div class="gt-row"><span>Uncovered plan · not a fabric shortage claim</span><strong>'+esc(r.need.toLocaleString('en-US'))+'</strong></div>'+ (r.reasons.length?'<p>'+esc(r.reasons.join(' '))+'</p>':'')).join('');
}

function ganttHoverHtml(w,source){
  const fmt=v=>v==null?'—':Number(v).toLocaleString('en-US');
  const safe=v=>esc(v==null||v===''?'—':v);
  const row=(n,label,value,title='')=>`<div class="gt-row"><span class="gt-row-label">${n?`<small>${esc(n)}</small>`:''}${esc(label)}</span><strong class="${value==null?'gt-no-data':Number(String(value).replace(/,/g,''))<0?'gt-negative':''}"${title?` title="${esc(title)}"`:''}>${safe(value)}</strong></div>`;
  const card=(title,kind,body)=>`<section class="gt-card gt-${kind}"><h3>${esc(title)}</h3><div class="gt-card-body">${body}</div></section>`;
  const allowed=new Set(w.selectedColors.map(ganttColorKey));
  const plan=ganttHoverPlan(w),sewing=ganttHoverSewing(w.line,w.ewo,w.selectedColors);
  const model=getGanttStock(),cutItems=w.selectedColors.map(color=>model.pairs.get(gsPair(w.ewo,color)));
  const cutSum=field=>cutItems.length&&cutItems.every(p=>p?.[field]!==null&&p?.[field]!==undefined&&!p?.[field+'Invalid'])?cutItems.reduce((n,p)=>n+p[field],0):null;
  const cutable=null,cutQty=cutSum('cut');
  const cuttingWip=ganttPopupCuttingWip(w,source);
  const send=cutSum('printSend'),recv=cutSum('printReceive');
  const embSend=cutSum('embSend'),embRecv=cutSum('embReceive');
  const actions=source?.size_rows>0?source.size_action:null;
  const accessories=source?.accessories_rows>0?source.accessories_status:null;
  const selectedSewing=Object.fromEntries(['input','output','reject','wip'].map(field=>[field,sewing.length&&sewing.every(r=>r[field]!==null)?sewing.reduce((n,r)=>n+r[field],0):null]));
  return ganttPopupHeader(w)+
    '<div class="gt-cards">'+
    card('Planning','planning',
      row('1','Buyer',plan.meta?.buyer||w.buyer||null)+
      row('2','Product',plan.meta?.style||w.style||null)+
      row('3','Plan / Day',fmt(w.qty))+
      row('4','Plan SAH',fmt(ganttHoverPlanSah(w)))+
      row('5','Total Order Qty',source?.order_bank_rows>0?fmt(source.order_qty):null))+
    '<div class="gt-card-pair">'+
      card('Size Set','size',row('','Next Action',actions))+
      card('Accessories','accessories',row('','Sewing Trims',accessories))+
    '</div>'+
    card('Cutting · RFD Daily Production','cutting',
      row('01','Total Cutting · Σ Cutting Today',fmt(cutQty),'EWO + Color · all source dates; Cutting Total is not used.')+
      row('02','Sewing Input · all Lines',fmt(cutSum('input')))+
      row('03','Saved RFD source',model.source?.file_name||null,'Batch '+(model.source?.id||'—')+' · source rows '+cutItems.flatMap(p=>p?.cutRows||[]).join(', ')))+
    card('Delivery priority allocation','allocation',ganttPopupAllocation(w))+
    card('Embellishment Send / Receive','embellishment',
      '<div class="gt-emb-pair"><div><h4>Print</h4>'+
        row('','Send',send==null?null:fmt(send))+
        row('','Received',recv==null?null:fmt(recv))+
        row('','WIP',send==null||recv==null?null:fmt(send-recv))+
      '</div><div><h4>Embroidery</h4>'+
        row('','Send',embSend==null?null:fmt(embSend))+
        row('','Received',embRecv==null?null:fmt(embRecv))+
        row('','WIP',embSend==null||embRecv==null?null:fmt(embSend-embRecv))+
      '</div></div>')+
    card('Sewing','sewing',
      row('1','Total Input Qty',selectedSewing.input==null?null:fmt(selectedSewing.input))+
      row('2','Total Output Qty',selectedSewing.output==null?null:fmt(selectedSewing.output))+
      row('3','Total Rejection Qty',selectedSewing.reject==null?null:fmt(selectedSewing.reject))+
      row('4','Total WIP Qty',selectedSewing.wip==null?null:fmt(selectedSewing.wip)))+
    card('Consumable WIP','wip',
      row('1','Cutable WIP · Paused',null)+
      row('2','Cutting WIP',cuttingWip.value==null?null:fmt(cuttingWip.value),'RFD Cutting Today · EWO + Color across all lines · '+(cuttingWip.reason||'Print Receive − Sewing Input; Embroidery Receive − Sewing Input; no process: Total Cutting − Sewing Input.'))+
      row('3','Print',send==null||recv==null?null:fmt(send-recv))+
      row('4','Embroidery',embSend==null||embRecv==null?null:fmt(embSend-embRecv))+
      row('5','Sewing WIP',selectedSewing.wip==null?null:fmt(selectedSewing.wip)))+
    '</div>';
}

function closeGanttPopup(){
  const dialog=document.getElementById('ewo-gantt-dialog');
  if(dialog?.open)dialog.close();
}
async function copyGanttPopupImage(){
  const button=document.getElementById('ewo-gantt-copy');
  const content=document.getElementById('ewo-gantt-content');
  const dialog=document.getElementById('ewo-gantt-dialog');
  if(!content||!button||!dialog)return;
  const label=button.textContent;
  button.disabled=true;button.textContent='Capturing…';
  try{
    const html2canvas=await ensureHtml2Canvas();
    // Capture the entire scrollable popup, including content below the viewport.
    const canvas=await html2canvas(dialog,{backgroundColor:'#ffffff',scale:Math.min(2,window.devicePixelRatio||2),useCORS:true,logging:false,
      windowWidth:Math.max(document.documentElement.clientWidth,dialog.scrollWidth),
      onclone:doc=>{
        const box=doc.getElementById('ewo-gantt-dialog'),body=doc.getElementById('ewo-gantt-content');
        if(box){box.style.maxHeight='none';box.style.height='auto';box.style.overflow='visible';box.style.position='static';box.style.margin='0';}
        if(body){body.style.maxHeight='none';body.style.height='auto';body.style.overflow='visible';}
        box?.querySelector('.gt-toolbar-actions')?.remove();
      }});
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw Error('PNG capture failed');
    if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
      try{await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);button.textContent='Image copied';return;}
      catch(error){console.warn('Clipboard unavailable; downloading PNG instead',error);}
    }
    const link=document.createElement('a'),url=URL.createObjectURL(blob);
    link.href=url;link.download='EWO-Gantt-status.png';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);button.textContent='PNG downloaded';
  }catch(error){console.warn('Gantt screenshot unavailable',error);button.textContent='Capture failed';}
  finally{button.disabled=false;setTimeout(()=>button.textContent=label,2200);}
}
async function showGanttPopup(cell,selectedColor,selectedEwo){
  const dialog=document.getElementById('ewo-gantt-dialog');
  const content=document.getElementById('ewo-gantt-content');
  if(!dialog||!content)return;
  const token=++GANTT_HOVER_REQUEST;
  const original=JSON.parse(decodeURIComponent(cell.dataset.gantt));
  const chosen=selectedEwo?(original.cellEwos||[]).find(x=>ganttKey(x.ewo)===ganttKey(selectedEwo)):null;
  const current=chosen?{...original,...chosen}:original;
  const options=ganttPopupColors(current);
  const allColors=selectedColor==='__all__';
  const selected=options.find(x=>ganttColorKey(x.color)===ganttColorKey(selectedColor))||
    options.find(x=>ganttColorKey(x.color)===ganttColorKey(current.color))||options[0];
  if(!selected)return;
  const w={...current,color:selected.color,allColors,selectedColors:allColors?options.map(x=>x.color):[selected.color],qty:allColors?options.reduce((n,x)=>n+ganttQty(x.qty),0):selected.qty};
  const bindColor=()=>{
    const select=content.querySelector('.gt-color-select');
    if(select){
      select.onchange=()=>showGanttPopup(cell,select.value,w.ewo);
      if(selectedColor)select.focus();
    }
    content.querySelectorAll('[data-popup-ewo]').forEach(button=>{
      button.onclick=()=>showGanttPopup(cell,undefined,button.dataset.popupEwo);
    });
  };
  GANTT_POPUP_TRIGGER=cell;
  content.innerHTML=ganttPopupHeader(w)+'<div class="gt-loading">Loading order status…</div>';
  bindColor();
  if(!dialog.open)dialog.showModal();
  if(!selectedColor)dialog.querySelector('.gt-modal-close')?.focus();
  try{
    const source=await ganttHoverSources(w.ewo,w.color,w.selectedColors);
    if(token!==GANTT_HOVER_REQUEST||!dialog.open)return;
    content.innerHTML=ganttHoverHtml(w,source)+(source.errors.length?
      `<div class="gt-loading">${esc(source.errors.join(', '))} status load failed. Refresh করে আবার চেষ্টা করুন; সমস্যা থাকলে account permission পরীক্ষা করুন।</div>`:'');
    bindColor();
  }catch(error){
    if(token!==GANTT_HOVER_REQUEST||!dialog.open)return;
    console.warn('Gantt popup source unavailable',error);
    content.innerHTML=ganttHoverHtml(w,null)+'<div class="gt-loading">Size Set, Accessories, Embellishment or Order Bank SQL status could not load.</div>';
    bindColor();
  }
}
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('ewo-gantt-dialog')?.addEventListener('close',()=>{
    ++GANTT_HOVER_REQUEST;
    if(GANTT_POPUP_TRIGGER?.isConnected)GANTT_POPUP_TRIGGER.focus();
    GANTT_POPUP_TRIGGER=null;
  });
});
