/* Shared pure model: active report evidence suggests one reason per uncovered
   Line/EWO; this is forecast-gap attribution, not a claim of proven causality. */
const LA_REASONS=[['planning','Planning / Loading Gap','Planning'],['sample','Sample Pending','Merchant'],['accessories','Accessories Shortage','Store / Merchant'],['gsm','Fabric low GSM issue','Textile'],['fabric','Fabric balance shortage','Textile'],['wash','Panel wash challenge','Washing'],['print','Print Delayed','Print'],['emb','Embroidery Delayed','Embroidery'],['unknown','Unassigned Loss','Review required']];
const laNorm=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
const laColor=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' ');
function laSourceField(row,name){const wanted=laNorm(name);const entry=Object.entries(row||{}).find(([k])=>laNorm(k)===wanted);return entry?entry[1]:null;}
function laEvidence(sources){
 const map=new Map();
 const add=(record,source,field,value,reason=null,rule='Explicit report field')=>{
  const r=record.row_data||record,ewo=gdsKey(r.EWO??r['EWO No']??r.ewo);if(!ewo)return;
  if(!map.has(ewo))map.set(ewo,[]);
  map.get(ewo).push({reason,source,field,raw:String(value),color:laColor(r.Color??r.color_name??r.color),line:String(r.Line??r.line_no??'').trim(),sourceRow:record.source_row_no??r.source_row??null,file:record.file_name??null,uploadedAt:record.uploaded_at??null,text:source+' · '+field+': '+String(value),rule,verified:!!reason});
 };
 const active=text=>{const v=laNorm(text);if(/\bavailable\b/.test(v)&&!/\bnot (?:yet )?available\b/.test(v))return false;if(/\b(?:no|not)\s+(?:panel wash|gsm|sample|size set)\b/.test(v))return false;return !/\b(no issue|no shortage|no delay|no pending|not pending|not delayed|not short|no low gsm|not low gsm|resolved|solved|completed|closed|balanced|not applicable)\b/.test(v);};
 const pending=text=>active(text)&&(/\b(pending|awaiting|hold|shortage|short|delayed|delay|not received|not approved|not available|missing)\b/.test(laNorm(text)));
 for(const record of sources.size||[]){const r=record.row_data||record;for(const field of ['T & A Closed','Next Action to Do\n(What)']){
  const value=laSourceField(r,field);if(value==null||String(value).trim()==='')continue;
  const recordClosed=[laSourceField(r,'T & A Closed'),laSourceField(r,'Next Action to Do\n(What)')].some(v=>/^(closed|complete|completed|ok)$/i.test(String(v??'').trim()));
  const specific=/\b(sample|size set|size-set|s\/s)\b/.test(laNorm(value));
  add(record,'Size Set',field,value,!recordClosed&&specific&&pending(value)?'sample':null,'Only explicit sample/size-set pending text; generic Open/No is not a proven sample issue');
 }}
 for(const record of sources.accessories||[]){const r=record.row_data||record,field='Sewing Trims Pending Stts',value=laSourceField(r,field);if(value!=null&&String(value).trim()!=='')add(record,'Accessories',field,value,pending(value)?'accessories':null);}
 for(const record of sources.fabric||[]){const r=record.row_data||record;for(const field of ['status','cutting_difficulties']){
  const value=r[field];if(value==null||String(value).trim()==='')continue;
  const clauses=String(value).split(/[;\n|]+/).filter(active),reasons=new Set();
  for(const text of clauses){const v=laNorm(text);
   if(/\b(low gsm|gsm (issue|problem|shortage))\b/.test(v))reasons.add('gsm');
   if(/\bfabrics?\b.*\b(short|shortage|pending|balance issue)\b/.test(v))reasons.add('fabric');
   if(/\bpanel wash\b/.test(v)&&/\b(pending|challenge|issue|delay|problem|hold)\b/.test(v))reasons.add('wash');
  }
  if(reasons.size)for(const reason of reasons)add(record,'Fabrics & Cutting',field,value,reason);else add(record,'Fabrics & Cutting',field,value);
 }
 const balance=gdsNumber(r.fabric_balance);if(balance!==null)add(record,'Fabrics & Cutting','fabric_balance',r.fabric_balance,balance<0?'fabric':null,'Negative numeric fabric balance');
 }
 // Preserve the source movements. Their positive stock is delayed only under
 // the user's explicit operating rule, not an inferred calendar due date.
 for(const record of sources.embellishment||[]){const r=record.row_data||record;for(const [reason,send,receive] of [['print','Today Print Send Qty','Today Print Receive Qty'],['emb','Today EMB Send Qty','Today EMB Receive Qty']]){
  const a=gdsNumber(laSourceField(r,send)),b=gdsNumber(laSourceField(r,receive));if(a===null&&b===null)continue;
  add(record,'Embellishment',send+' / '+receive,(a===null?'—':a)+' / '+(b===null?'—':b),a!==null&&b!==null&&a>b?reason:null,'Positive Send − Receive is delayed by the agreed operating rule; stock pooled by EWO');
 }}
 return map;
}
function laRecordEvidence(proof,colors,line){
 const scope=new Set(colors.map(laColor).filter(Boolean));
 return proof.map(p=>{
  if(['print','emb'].includes(p.reason))return {...p,eligible:p.verified,scope:'EWO shared WIP'};
  const sourceLine=p.line?(/^(?:\d+|[A-Za-z -]+0*\d+)$/.test(p.line)?Number(p.line.match(/\d+$/)?.[0]):null):null;
  const matchedLine=!p.line||sourceLine===Number(line),matchedColor=!p.color||(scope.size>0&&scope.has(p.color));
  return {...p,eligible:p.verified&&matchedLine&&matchedColor,scope:!matchedLine?'Source line does not match':!matchedColor?'Source color is not confirmed for this plan':p.verified?'Matched plan scope':'Context only: no explicit active issue'};
 });
}
function laSupportedReasons(proof,colors){
 const scope=new Set(colors.map(laColor).filter(Boolean));
 return LA_REASONS.map(r=>r[0]).filter(reason=>!['planning','print','emb','unknown'].includes(reason)).filter(reason=>{
  const matches=proof.filter(p=>p.eligible&&p.reason===reason);
  // A color-specific issue cannot justify the entire mixed-color EWO gap.
  return matches.some(p=>!p.color)||(scope.size>0&&[...scope].every(color=>matches.some(p=>p.color===color)));
 });
}
function buildLoadAnalysisLoss(input){
 const selected=new Set((input.selected||[0,1,2,3,4]).filter(i=>Number.isInteger(i)&&i>=0&&i<5));
 const notes=new Set(),allocated=gdsAllocate(input,notes),summary=buildGanttDailySummary({...input,selected:[...selected]},{allocation:allocated,notes}),evidence=laEvidence(input.sources||{}),overrides=input.overrides||{};
 const plan=gdsGroup(allocated.plan,row=>JSON.stringify([row.date,Number(row.line),gdsKey(row.ewo)]));
 const cellKey=row=>JSON.stringify([row.date,Number(row.line),gdsKey(row.ewo)]),lineKey=row=>JSON.stringify([Number(row.line),gdsKey(row.ewo)]);
 const dataByLine=gdsGroup(input.data,lineKey),dailyByCell=gdsGroup(gdsUniqueDaily(input.sah),cellKey),scheduledByCell=gdsGroup(input.plan.filter(r=>gdsNumber(r.value)!==null),cellKey);
 const dates=new Set(input.dates),lines=new Set(input.lines),proofByScope=new Map();
 const records=[];
 for(const [key,rows] of plan){const [date,line,ewo]=JSON.parse(key);if(!dates.has(date)||!lines.has(line))continue;
  const data=dataByLine.get(JSON.stringify([line,ewo]))||[],smvs=[...new Set(data.map(row=>gdsNumber(row.smv)).filter(v=>v>0))],a=allocated.allocations.get(key);
  const daily=dailyByCell.get(key)||[];
  const expected=daily.length?gdsSum(daily,row=>gdsNumber(row.value)):smvs.length===1?rows.reduce((n,row)=>n+gdsNumber(row.value),0)*smvs[0]/60:null;
  const known=a?.stages.filter((v,i)=>v!==null&&selected.has(i))||[],covered=selected.size===0&&a?0:known.length&&(a.smv!==null||known.every(v=>v===0))?known.reduce((n,v)=>n+v,0)*(a.smv||0)/60:null;
  const printPcs=selected.has(1)?a?.stages[1]??null:0,embPcs=selected.has(2)?a?.stages[2]??null:0;
  const printSah=printPcs===null?null:printPcs===0?0:a.smv===null?null:printPcs*a.smv/60;
  const embSah=embPcs===null?null:embPcs===0?0:a.smv===null?null:embPcs*a.smv/60;
  const delayed=(printSah||0)+(embSah||0),achievable=covered===null?null:Math.max(0,covered-delayed);
  const scheduled=scheduledByCell.get(key)||[];
  const scheduledColors=[...new Set(scheduled.map(r=>r.color??data.find(d=>d.record_id!=null&&String(d.record_id)===String(r.record_id))?.color).filter(Boolean))];
  const proofKey=JSON.stringify([line,ewo,scheduledColors]);
  if(!proofByScope.has(proofKey)){
   const proof=laRecordEvidence(evidence.get(ewo)||[],scheduledColors,line);
   proofByScope.set(proofKey,{proof,supported:laSupportedReasons(proof,scheduledColors)});
  }
  const {proof,supported}=proofByScope.get(proofKey);
  const auto=input.evidenceAvailable!==false&&supported.length===1?supported[0]:'unknown',saved=overrides[key];
  const manual=saved&&LA_REASONS.some(r=>r[0]===saved.reason&&!['planning','print','emb'].includes(r[0]))?saved:null;
  const manualApplied=!!manual&&(manual.reason==='unknown'||supported.includes(manual.reason));
  records.push({key,date,line,ewo,allocatedPcs:a?.stages||[],netDemand:a?.qty??null,smv:a?.smv??null,colors:scheduledColors,plan:expected,planDerived:!daily.length&&expected!==null,ganttForecast:covered,forecast:achievable,printPcs,embPcs,printSah,embSah,gap:expected===null||achievable===null?null:Math.max(0,expected-achievable),evidence:proof,supportedReasons:supported,allowedReasons:[...supported,'unknown'],auto,reason:manualApplied?manual.reason:auto,manual,manualApplied,reasonBasis:input.evidenceAvailable===false?'Some evidence sources are unavailable; automatic cause is unconfirmed':manual&&!manualApplied?'Saved correction retained but not applied: no matching report evidence':supported.length>1?'Multiple supported issues; exact cause is unconfirmed':supported.length===0?'No complete matching report evidence':'One matching report issue; forecast attribution, not proven actual causality',partial:!!a?.stagePartial.some(Boolean)||!daily.length||input.sourcePartial===true});
 }
 const recordsByDate=gdsGroup(records,row=>row.date);
 const days=summary.days.map(day=>{
  const date=day.date,target=gdsNumber(input.dailyCapacity),ganttForecast=day.values[4],planned=gdsNumber(input.planTotals?.[date]),rows=recordsByDate.get(date)||[];
  const delayed=rows.reduce((n,row)=>n+(row.printSah||0)+(row.embSah||0),0),forecast=ganttForecast===null?null:Math.max(0,ganttForecast-delayed);
  const loss=target===null||forecast===null?null:Math.max(0,target-forecast),loading=loss===null||planned===null?null:Math.min(loss,Math.max(0,target-planned));
  const buckets=Object.fromEntries(LA_REASONS.map(reason=>[reason[0],loss===null?null:0]));
  // Reserve explicit quantity-based delays first. They are still capped by the
  // date's target gap when over-target planning provides surplus capacity.
  const rawDelay=rows.reduce((n,row)=>n+(row.printSah||0)+(row.embSah||0),0);
  const budget=loss===null?null:Math.max(0,loss-(loading||0)),delayScale=budget!==null&&rawDelay>0?Math.min(1,budget/rawDelay):0;
  const remaining=budget===null?null:Math.max(0,budget-rawDelay*delayScale);
  const rawShortage=rows.reduce((n,row)=>n+(row.gap===null?0:Math.max(0,row.gap-(row.printSah||0)-(row.embSah||0))),0),shortageScale=rawShortage>0&&remaining!==null?Math.min(1,remaining/rawShortage):0;
  if(loss!==null){buckets.planning=loading||0;
   for(const row of rows){
    const shortage=row.gap===null?0:Math.max(0,row.gap-(row.printSah||0)-(row.embSah||0))*shortageScale;
    const print=(row.printSah||0)*delayScale,emb=(row.embSah||0)*delayScale;
    row.contributions={print,emb};row.contributions[row.reason]=(row.contributions[row.reason]||0)+shortage;row.attributed=shortage+print+emb;row.correctable=shortage;
    buckets.print+=print;buckets.emb+=emb;buckets[row.reason]+=shortage;
   }
   buckets.unknown+=Math.max(0,remaining-rawShortage*shortageScale);
  }else rows.forEach(row=>{row.attributed=null;row.contributions={};});
  return {date,target,plan:planned,sahScopeDelta:planned!==null&&day.values[1]!==null?planned-day.values[1]:null,ganttForecast,wipSah:day.stageSah,wipPartial:day.stageSahPartial,printSah:rows.reduce((n,r)=>n+(r.printSah||0),0),embSah:rows.reduce((n,r)=>n+(r.embSah||0),0),forecast,loss,loading,buckets,partial:day.partial[4]||rows.some(row=>row.partial||row.gap===null)||planned===null||input.evidenceAvailable===false||input.sourcePartial===true};
 });
 const model={days,records,cutoff:summary.cutoff,notes:summary.notes,selected:[...selected]};
 model.reconciliation=validateLoadAnalysisReconciliation(model);
 return model;
}

// Unrounded arithmetic is checked separately from source completeness. A matched
// sum never upgrades missing data or an unsupported status into verified evidence.
function validateLoadAnalysisReconciliation(model){
 const errors=[],close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(1e-7,Math.abs(b)*1e-10),selected=new Set(model.selected||[0,1,2,3,4]);
 for(const day of model.days||[]){
  if(day.forecast!==null&&day.wipSah){const values=[0,4,3].filter(i=>selected.has(i)).map(i=>day.wipSah[i]).filter(v=>v!==null);if(values.length&&!close(values.reduce((a,b)=>a+b,0),day.forecast))errors.push(day.date+': Final SAH does not match selected ready-stage SAH');}
  if(day.ganttForecast!==null&&day.wipSah){const known=[...selected].map(i=>day.wipSah[i]).filter(v=>v!==null);if(!close(known.reduce((a,b)=>a+b,0),day.ganttForecast))errors.push(day.date+': Selected WIP subtotal mismatch');}
  if(day.loss!==null){if(Object.values(day.buckets).some(v=>!Number.isFinite(v)||v<0))errors.push(day.date+': Invalid reason quantity');if(!close(day.loss,Math.max(0,day.target-day.forecast)))errors.push(day.date+': Target/forecast gap mismatch');if(!close(Object.values(day.buckets).reduce((a,b)=>a+b,0),day.loss))errors.push(day.date+': Reason total differs from gap');}
 }
 for(const r of model.records||[]){if(r.netDemand===undefined||!Array.isArray(r.allocatedPcs)){errors.push(r.key+': Allocation evidence missing');continue;}if(r.netDemand!==null&&(r.allocatedPcs.some(v=>v!==null&&(!Number.isFinite(v)||v<0))||r.allocatedPcs.filter(v=>v!==null).reduce((a,b)=>a+b,0)>r.netDemand+1e-7))errors.push(r.key+': Allocated pieces exceed demand or contain invalid quantities');if(r.correctable>0&&r.reason!=='unknown'&&!r.supportedReasons?.includes(r.reason))errors.push(r.key+': Reason has no eligible evidence');}
 const scopeDifferences=(model.days||[]).filter(d=>d.sahScopeDelta!==null&&Math.abs(d.sahScopeDelta||0)>1e-7).map(d=>({date:d.date,delta:d.sahScopeDelta}));
 return {ok:errors.length===0,errors,scopeDifferences,partial:scopeDifferences.length>0||(model.days||[]).some(d=>d.partial||d.loss===null),knownDates:(model.days||[]).filter(d=>d.loss!==null).length};
}

// The distribution is derived from the same displayed reason buckets, including
// Unassigned. It never reclassifies evidence or counts a shared department twice.
const LA_DEPARTMENTS=[
 ['planning','Planning','#2563a6',['planning']],['merchant','Merchant','#7056b8',['sample']],
 ['store','Store / Merchant','#26899b',['accessories']],['textile','Textile','#198a76',['gsm','fabric']],
 ['washing','Washing','#c58b2d',['wash']],['print','Print','#cc6573',['print']],
 ['embroidery','Embroidery','#8b66a8',['emb']],['unassigned','Unassigned','#7c8fa3',['unknown']]
];
function buildLoadAnalysisDepartmentTotals(days){
 let partial=false,known=0,expected=0;
 const series=LA_DEPARTMENTS.map(([id,label,color,keys])=>({id,label,color,keys,value:0}));
 for(const day of days||[]){
  if(day.loss===null||day.loss===undefined||!Number.isFinite(Number(day.loss))){partial=true;continue;}
  known++;expected+=Number(day.loss);if(day.partial)partial=true;
  for(const item of series)for(const key of item.keys){const value=day.buckets?.[key];if(value===null||value===undefined||!Number.isFinite(Number(value))||Number(value)<0){partial=true;continue;}item.value+=Number(value);}
 }
 const total=series.reduce((n,item)=>n+item.value,0),reconciled=!known||Math.abs(total-expected)<=Math.max(1e-8,Math.abs(expected)*1e-10);
 return {series:series.map(item=>({...item,percent:total>0?item.value/total*100:0})),total:known?total:null,expected:known?expected:null,partial,reconciled,knownDates:known};
}
