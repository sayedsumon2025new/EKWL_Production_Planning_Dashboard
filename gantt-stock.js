/* Gantt stock authority: saved RFD Cutting Today, exact EWO/color, delivery-first
 * reservations across the complete selected plan. Never reads legacy fabric stock. */
let GANTT_RFD_CUTTING=null,GANTT_EMBELLISHMENT=[];
let GANTT_STOCK_CACHE=null;
function gsEwo(value){
 const text=String(value??'').trim().toUpperCase().replace(/\.0+$/,'');
 const tokens=[...new Set((text.match(/(?<!\d)\d{6}(?!\d)/g)||[]))];
 return tokens.length===1?tokens[0]:tokens.length>1?'':text;
}
const gsColor=value=>String(value??'').trim().toUpperCase().replace(/\s+/g,' ');
const gsPair=(ewo,color)=>JSON.stringify([gsEwo(ewo),gsColor(color)]);
function gsNumber(value){if(value==null||String(value).trim()==='')return null;const text=String(value).replace(/,/g,'').trim();return /^-?\d+(?:\.\d+)?$/.test(text)?Number(text):null;}
function gsDate(value){const text=String(value??'').trim();if(!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text))return '';const iso=text.slice(0,10),date=new Date(iso+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:'';}
function gsSmv(value){const n=gsNumber(value);return n>0?n:null;}
function buildGanttStock(input){
 const notes=new Set(['Legacy fabric/Cutable stock and material-short conditions are paused. Matching and allocation use EWO + Color.']),pairs=new Map(),allocations=new Map(),details=new Map();
 const ensure=(ewo,color)=>{const key=gsPair(ewo,color);if(!pairs.has(key))pairs.set(key,{ewo:gsEwo(ewo),color:gsColor(color),cut:null,input:0,printSend:null,printReceive:null,embSend:null,embReceive:null,print:false,emb:false,hasPlan:false,cutRows:[],emRows:[],reasons:[]});return pairs.get(key);};
 const plus=(item,field,value)=>{const n=gsNumber(value);if(n===null){item[field+'Invalid']=true;return;}item[field]=(item[field]??0)+n;};
 const required=v=>!['','no','n','0','false','n/a','na','none','-','—'].includes(String(v??'').trim().toLowerCase());
 const meta=new Map((input.data||[]).filter(r=>r.record_id!=null).map(r=>[String(r.record_id),r]));
 for(const row of input.data||[]){if(row.is_summary_row||!gsEwo(row.ewo)||!gsColor(row.color))continue;const p=ensure(row.ewo,row.color);p.hasPlan=true;p.print||=required(row.print);p.emb||=required(row.emb);}
 // Only the single verified active saved upload is supplied; previews never enter this model.
 for(const [i,row] of (input.rfdDaily?.rows||[]).entries()){
  if(!gsEwo(row[3])||!gsColor(row[6]))continue;
  const p=ensure(row[3],row[6]);plus(p,'cut',row[8]);p.cutRows.push(i+2);
 }
 for(const [i,row] of (input.embellishment||[]).entries()){
  if(!gsEwo(row['EWO No'])||!gsColor(row.Color))continue;
  const p=ensure(row['EWO No'],row.Color);
  for(const [field,name] of [['printSend','Today Print Send Qty\n'],['printReceive',' Today Print Receive Qty'],['embSend','Today EMB Send Qty'],['embReceive','Today EMB Receive Qty']])plus(p,field,row[name]);
  p.emRows.push(row.source_row_no??i+2);
 }
 const lineSewing=new Map();
 for(const row of input.sewing||[]){
  if(!gsEwo(row.ewo)||!gsColor(row.color))continue;
  const p=ensure(row.ewo,row.color);const n=gsNumber(row.input);if(n===null)p.inputInvalid=true;else p.input+=n;
  const key=JSON.stringify([Number(row.line_no),gsPair(row.ewo,row.color)]);
  if(!lineSewing.has(key))lineSewing.set(key,{input:0,output:0,reject:0,wip:0});
  const s=lineSewing.get(key);for(const field of ['input','output','reject','wip']){const v=gsNumber(row[field]);if(v===null)s[field+'Invalid']=true;else s[field]+=v;}
 }
 for(const p of pairs.values()){
  p.print||=(p.printSend||0)!==0||(p.printReceive||0)!==0;p.emb||=(p.embSend||0)!==0||(p.embReceive||0)!==0;
  p.printWip=p.printSend!==null&&p.printReceive!==null&&!p.printSendInvalid&&!p.printReceiveInvalid?p.printSend-p.printReceive:!p.print&&p.hasPlan?0:null;
  p.embWip=p.embSend!==null&&p.embReceive!==null&&!p.embSendInvalid&&!p.embReceiveInvalid?p.embSend-p.embReceive:!p.emb&&p.hasPlan?0:null;
  p.cutting=null;
  if(p.print&&p.emb)p.reasons.push('Both Print and Embroidery apply. Final process must be confirmed.');
  else if(p.inputInvalid)p.reasons.push('Sewing Input is missing/invalid.');
  else if(!p.hasPlan)p.reasons.push('No matched planned EWO + Color to confirm process applicability.');
  else {
   const field=p.print?'printReceive':p.emb?'embReceive':'cut';
   if(p[field]===null||p[field+'Invalid'])p.reasons.push('Required '+field+' quantity is unavailable.');
   else p.cutting=p[field]-p.input;
  }
  if(p.cutInvalid)p.cut=null;
  for(const field of ['cutting','printWip','embWip'])if(p[field]<0)p.reasons.push(field+' is negative; zero pieces are available for allocation.');
  if(p.printReceive>p.printSend&&p.printSend!==null)p.reasons.push('Print Receive exceeds Send.');
  if(p.embReceive>p.embSend&&p.embSend!==null)p.reasons.push('Embroidery Receive exceeds Send.');
  for(const reason of p.reasons)notes.add(reason);
 }
 const master=input.masterLines?new Set(input.masterLines.map(Number)):null,seen=new Set(),net=new Map();
 for(const [i,row] of (input.plan||[]).entries()){
  const key=row.record_id==null?'row:'+i:String(row.record_id)+'|'+row.date;if(seen.has(key))continue;seen.add(key);
  const m=meta.get(String(row.record_id))||row,line=Number(row.line),ewo=gsEwo(row.ewo),color=gsColor(row.color??m.color),date=gsDate(row.date),value=gsNumber(row.value);
  if(!line||line===46||(master&&!master.has(line))||!date||!ewo||value===null)continue;
  const delivery=gsDate(m.deliverydate??row.deliverydate),pair=gsPair(ewo,color),group=JSON.stringify([date,line,ewo,color,delivery]);
  if(!net.has(group))net.set(group,{...row,line,ewo,color,date,pair,delivery,value:0,smv:gsSmv(m.smv??row.smv),sourceOrder:i,recordIds:[]});
  const entry=net.get(group);entry.value+=value;entry.recordIds.push(String(row.record_id??i));
  if(entry.smv!==gsSmv(m.smv??row.smv))entry.smv=null;
  ensure(ewo,color);
 }
 const plan=[...net.values()].filter(r=>r.value>0),cutoff=(input.production||[]).map(r=>gsDate(r.output_date)).filter(Boolean).sort().at(-1)||'';
 const pending=plan.filter(r=>cutoff&&r.date>cutoff).sort((a,b)=>a.date.localeCompare(b.date)||a.line-b.line||a.sourceOrder-b.sourceOrder),sewingRemaining=new Map();
 for(const row of pending){
  const key=JSON.stringify([row.line,row.pair]),s=lineSewing.get(key);if(!sewingRemaining.has(key))sewingRemaining.set(key,s&&!s.wipInvalid?Math.max(0,s.wip):null);
  const available=sewingRemaining.get(key),used=available===null?null:Math.min(row.value,available);
  if(used!==null)sewingRemaining.set(key,available-used);
  row.stages=[null,0,0,used,0];row.need=row.value-(used||0);row.stagePartial=[false,false,false,false,false];
  row.reasons=[];if(!row.color)row.reasons.push('Planned Color is missing.');
 }
 // Reserve earlier-delivery demand first, even if a later-delivery line runs earlier.
 pending.sort((a,b)=>(a.delivery||'9999-99-99').localeCompare(b.delivery||'9999-99-99')||a.date.localeCompare(b.date)||a.line-b.line||a.sourceOrder-b.sourceOrder);
 const stock=new Map();
 for(const row of pending){
  const p=pairs.get(row.pair);if(!stock.has(row.pair))stock.set(row.pair,[p?.cutting??null,p?.embWip??null,p?.printWip??null].map(n=>n===null?null:Math.max(0,n)));
  const remaining=stock.get(row.pair);
  for(const [j,stage] of [[0,4],[1,2],[2,1]]){
   const available=remaining[j];row.stages[stage]=available===null?null:Math.min(row.need,available);
   if(available!==null){remaining[j]-=row.stages[stage];row.need-=row.stages[stage];}
   row.stagePartial[stage]=row.stages[3]===null||remaining.slice(0,j).some(x=>x===null)||!!p?.reasons.length;
  }
  if(!row.delivery){row.reasons.push('Delivery missing: allocated after valid delivery dates.');notes.add(row.reasons[0]);}
  if(p?.reasons.length)row.reasons.push(...p.reasons);
  const cell=JSON.stringify([row.date,row.line,row.ewo]);if(!details.has(cell))details.set(cell,[]);details.get(cell).push(row);
 }
 // Preserve the existing daily-summary cell API; SAH is summed per allocation below.
 for(const [key,rows] of details){
  const stageKnown=[0,1,2,3,4].map(i=>rows.some(r=>r.stages[i]!==null));
  const stages=stageKnown.map((known,i)=>known?rows.reduce((n,r)=>n+(r.stages[i]||0),0):null);
  const smvs=[...new Set(rows.map(r=>r.smv))];
  allocations.set(key,{line:rows[0].line,ewo:rows[0].ewo,date:rows[0].date,qty:rows.reduce((n,r)=>n+r.value,0),need:rows.reduce((n,r)=>n+r.need,0),stages,stagePartial:stages.map((v,i)=>rows.some(r=>r.stages[i]===null||r.stagePartial[i])),smv:smvs.length===1?smvs[0]:null,parts:rows});
 }
 if(!cutoff)notes.add('Actual production cutoff unavailable; stock coverage remains unavailable.');
 return {plan,cutoff,allocations,details,pairs,lineSewing,notes:[...notes],source:input.rfdDaily?.report||null};
}
function ganttStockInput(){return {data:DATA,plan:DAILY_PLAN,sewing:SEWING_IO_DATA,production:DATE_WISE_PRODUCTION_DATA,rfdDaily:GANTT_RFD_CUTTING,embellishment:GANTT_EMBELLISHMENT,masterLines:[...getChassisMasterLines()]};}
function getGanttStock(){
 const input=ganttStockInput(),refs=[input.data,input.plan,input.sewing,input.production,input.rfdDaily,input.embellishment],owner=SITE_AUTH_USER?.id,generation=SITE_SESSION_GENERATION,upload=String(ACTIVE_PLAN_UPLOAD?.id||''),master=input.masterLines.join('|');
 if(GANTT_STOCK_CACHE&&GANTT_STOCK_CACHE.owner===owner&&GANTT_STOCK_CACHE.generation===generation&&GANTT_STOCK_CACHE.upload===upload&&GANTT_STOCK_CACHE.master===master&&refs.every((r,i)=>r===GANTT_STOCK_CACHE.refs[i]&&(r?.length??r?.rows?.length??0)===GANTT_STOCK_CACHE.lengths[i]))return GANTT_STOCK_CACHE.model;
 const model=buildGanttStock(input);GANTT_STOCK_CACHE={owner,generation,upload,master,refs,lengths:refs.map(r=>r?.length??r?.rows?.length??0),model};return model;
}
function ganttAllocatedCondition(model,line,date,ewo){
 const item=model.allocations.get(JSON.stringify([date,Number(line),gsEwo(ewo)]));
 if(!item)return '';
 const sewing=item.stages[3]||0,cutting=item.stages[4]||0;
 if(sewing>=item.qty)return 'wip';
 if(sewing+cutting>=item.qty&&!item.stagePartial[4])return 'cutting';
 return ''; // No fabric-based shortage claim or Cutable condition during reconciliation.
}
