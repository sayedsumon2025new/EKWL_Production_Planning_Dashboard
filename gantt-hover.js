/* Slide 07 popup: use the selected Gantt cell, current Plan snapshot, and active SQL reports. */
const GANTT_HOVER_SOURCE_CACHE=new Map();
let GANTT_HOVER_REQUEST=0;
let GANTT_POPUP_TRIGGER=null;
const ganttKey=v=>String(v??'').trim().toUpperCase().replace(/\.0+$/,'');
const ganttColorKey=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' ');
const ganttQty=v=>Number(v)||0;
function resetGanttHoverCache(){GANTT_HOVER_SOURCE_CACHE.clear();++GANTT_HOVER_REQUEST;closeGanttPopup();if(typeof resetGanttActionCache==='function')resetGanttActionCache();}

async function ganttHoverSources(ewo,color,colors){
  const allowed=new Set((colors||[color]).map(ganttColorKey));
  const key=ganttKey(ewo)+'|'+[...allowed].sort().join('|');
  if(GANTT_HOVER_SOURCE_CACHE.has(key))return GANTT_HOVER_SOURCE_CACHE.get(key);
  const rows=async build=>{
    const all=[],size=500;
    for(let from=0;;from+=size){
      const {data,error}=await build().range(from,from+size-1);
      if(error)throw error;
      all.push(...(data||[]));
      if((data||[]).length<size)break;
    }
    return all;
  };
  const query=Promise.allSettled([
    rows(()=>SB.from('size_set_rows').select('row_data').eq('is_active',true)
      .filter('row_data->>EWO','eq',String(ewo)).order('source_row_no',{ascending:true})),
    rows(()=>SB.from('accessories_rows').select('row_data').eq('is_active',true)
      .filter('row_data->>EWO','eq',String(ewo)).order('source_row_no',{ascending:true})),
    rows(()=>SB.from('embellishment_send_receive_rows').select('*').eq('is_active',true)
      .eq('EWO No',String(ewo)).order('source_row_no',{ascending:true})),
    rows(()=>SB.from('order_bank_latest_all').select('GmtColor,OrderQty')
      .eq('EWO',String(ewo)))
  ]).then(results=>{
    const available=i=>results[i].status==='fulfilled';
    const matching=(i,getColor)=>available(i)?results[i].value.filter(row=>allowed.has(ganttColorKey(getColor(row)))):[];
    const size=matching(0,row=>row.row_data?.Color),accessories=available(1)?results[1].value:[];
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
  });
  GANTT_HOVER_SOURCE_CACHE.set(key,query);
  try{return await query;}catch(error){GANTT_HOVER_SOURCE_CACHE.delete(key);throw error;}
}

function ganttHoverSewing(line,ewo,colors){
  const result=new Map();
  const allowed=new Set(colors.map(ganttColorKey));
  for(const row of SEWING_IO_DATA){
    if(Number(row.line_no)!==Number(line)||ganttKey(row.ewo)!==ganttKey(ewo)||!allowed.has(ganttColorKey(row.color)))continue;
    const rowColor=String(row.color||'').trim(),key=ganttColorKey(rowColor);
    if(!result.has(key))result.set(key,{color:rowColor||'Unspecified',input:0,output:0,reject:0,wip:0});
    const item=result.get(key);
    item.input+=ganttQty(row.input);item.output+=ganttQty(row.output);
    item.reject+=ganttQty(row.reject);item.wip+=ganttQty(row.wip);
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
  return `<div class="gt-title">EWO ${esc(w.ewo)}<small>Line ${esc(w.line)} · ${esc(w.date)}</small></div>`+
    '<div class="gt-color-filter"><label for="gt-plan-color">Plan Color</label>'+
    `<select id="gt-plan-color" class="gt-color-select" aria-label="Filter popup by planned color" ${options.length<2?'disabled':''}>`+
    `<option value="__all__" ${w.allColors?'selected':''}>All Colors · ${options.reduce((n,x)=>n+ganttQty(x.qty),0).toLocaleString('en-US')} pcs</option>`+
    options.map(x=>`<option value="${esc(x.color)}" ${!w.allColors&&ganttColorKey(x.color)===ganttColorKey(w.color)?'selected':''}>${esc(x.color)} · ${ganttQty(x.qty).toLocaleString('en-US')} pcs</option>`).join('')+
    `</select><span>${options.length} planned color${options.length===1?'':'s'}</span></div>`;
}

function ganttHoverHtml(w,source){
  const fmt=v=>v==null?'—':Number(v).toLocaleString('en-US');
  const safe=v=>esc(v==null||v===''?'—':v);
  const row=(n,label,value)=>`<div class="gt-row"><span class="gt-row-label">${n?`<small>${esc(n)}</small>`:''}${esc(label)}</span><strong class="${value==null?'gt-no-data':Number(String(value).replace(/,/g,''))<0?'gt-negative':''}">${safe(value)}</strong></div>`;
  const card=(title,kind,body)=>`<section class="gt-card gt-${kind}"><h3>${esc(title)}</h3><div class="gt-card-body">${body}</div></section>`;
  const allowed=new Set(w.selectedColors.map(ganttColorKey));
  const plan=ganttHoverPlan(w),sewing=ganttHoverSewing(w.line,w.ewo,w.selectedColors);
  const cut=FABRIC_CUTTING_DATA.filter(row=>ganttKey(row.ewo)===ganttKey(w.ewo)&&allowed.has(ganttColorKey(row.color_name)));
  const cutSum=key=>{
    const values=cut.map(row=>row[key]).filter(value=>value!=null&&String(value).trim()!==''&&Number.isFinite(Number(value)));
    return values.length?values.reduce((sum,value)=>sum+Number(value),0):null;
  };
  const cutable=cutSum('cutable_qty'),cutQty=cutSum('total_cut_qty');
  const em=Number(source?.embellishment_rows)>0;
  const send=em?Number(source.print_send):null,recv=em?Number(source.print_receive):null;
  const embSend=em?Number(source.embroidery_send):null,embRecv=em?Number(source.embroidery_receive):null;
  const actions=source?.size_rows>0?source.size_action:null;
  const accessories=source?.accessories_rows>0?source.accessories_status:null;
  const selectedSewing=sewing.length?sewing.reduce((sum,item)=>({input:sum.input+item.input,output:sum.output+item.output,reject:sum.reject+item.reject,wip:sum.wip+item.wip}),{input:0,output:0,reject:0,wip:0}):{input:null,output:null,reject:null,wip:null};
  return ganttPopupHeader(w)+
    '<div class="gt-cards">'+
    card('Planning','planning',
      row('1','Buyer',plan.meta?.buyer||w.buyer||null)+
      row('2','Product',plan.meta?.style||w.style||null)+
      row('3','Plan / Day',fmt(w.qty))+
      row('4','Total Order Qty',source?.order_bank_rows>0?fmt(source.order_qty):null))+
    '<div class="gt-card-pair">'+
      card('Size Set','size',row('','Next Action',actions))+
      card('Accessories','accessories',row('','Sewing Trims',accessories))+
    '</div>'+
    card('Cutting','cutting',
      row('01','Total Order Qty',cutSum('color_order_qty')==null?null:fmt(cutSum('color_order_qty')))+
      row('02','Fabrics Booking (kg)',cutSum('fabric_booking_qty')==null?null:fmt(cutSum('fabric_booking_qty')))+
      row('03','Fabrics Received (kg)',cutSum('total_fabric_received')==null?null:fmt(cutSum('total_fabric_received')))+
      row('04','Total Cutting Pcs',cutQty==null?null:fmt(cutQty))+
      row('05','Cutting Balance',cutSum('cutting_balance')==null?null:fmt(cutSum('cutting_balance'))))+
    card('Embellishment Send / Receive','embellishment',
      '<div class="gt-emb-pair"><div><h4>Print</h4>'+
        row('','Send',send==null?null:fmt(send))+
        row('','Received',recv==null?null:fmt(recv))+
        row('','WIP',send==null?null:fmt(send-recv))+
      '</div><div><h4>Embroidery</h4>'+
        row('','Send',embSend==null?null:fmt(embSend))+
        row('','Received',embRecv==null?null:fmt(embRecv))+
        row('','WIP',embSend==null?null:fmt(embSend-embRecv))+
      '</div></div>')+
    card('Sewing','sewing',
      row('1','Total Input Qty',selectedSewing.input==null?null:fmt(selectedSewing.input))+
      row('2','Total Output Qty',selectedSewing.output==null?null:fmt(selectedSewing.output))+
      row('3','Total Rejection Qty',selectedSewing.reject==null?null:fmt(selectedSewing.reject))+
      row('4','Total WIP Qty',selectedSewing.wip==null?null:fmt(selectedSewing.wip)))+
    card('Consumable WIP','wip',
      row('1','Cutable WIP',cutable==null?null:fmt(cutable))+
      row('2','Print',send==null?null:fmt(send-recv))+
      row('3','Embroidery',embSend==null?null:fmt(embSend-embRecv))+
      row('4','Sewing WIP',selectedSewing.wip==null?null:fmt(selectedSewing.wip)))+
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
    if(typeof html2canvas!=='function')throw Error('Screenshot library unavailable');
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
async function showGanttPopup(cell,selectedColor){
  const dialog=document.getElementById('ewo-gantt-dialog');
  const content=document.getElementById('ewo-gantt-content');
  if(!dialog||!content)return;
  const token=++GANTT_HOVER_REQUEST;
  const original=JSON.parse(decodeURIComponent(cell.dataset.gantt));
  const options=ganttPopupColors(original);
  const allColors=selectedColor==='__all__';
  const selected=options.find(x=>ganttColorKey(x.color)===ganttColorKey(selectedColor))||
    options.find(x=>ganttColorKey(x.color)===ganttColorKey(original.color))||options[0];
  if(!selected)return;
  const w={...original,color:selected.color,allColors,selectedColors:allColors?options.map(x=>x.color):[selected.color],qty:allColors?options.reduce((n,x)=>n+ganttQty(x.qty),0):selected.qty};
  const bindColor=()=>{
    const select=content.querySelector('.gt-color-select');
    if(select){
      select.onchange=()=>showGanttPopup(cell,select.value);
      if(selectedColor)select.focus();
    }
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
      `<div class="gt-loading">${esc(source.errors.join(', '))} status unavailable for this account.</div>`:'');
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
