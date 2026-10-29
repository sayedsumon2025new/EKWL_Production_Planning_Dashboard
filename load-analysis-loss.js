/* Shared pure model: active report evidence suggests one reason per uncovered
   Line/EWO; this is forecast-gap attribution, not a claim of proven causality. */
const LA_REASONS=[['planning','Planning / Loading Gap','Planning'],['sample','Sample Pending','Merchant'],['accessories','Accessories Shortage','Store / Merchant'],['gsm','Fabric low GSM issue','Textile'],['fabric','Fabric balance shortage','Textile'],['wash','Panel wash challenge','Washing'],['print','Print Delayed','Print'],['emb','Embroidery Delayed','Embroidery'],['unknown','Unassigned Loss','Review required']];
function laEvidence(sources){
 const map=new Map(),key=gdsKey;
 const add=(ewo,reason,text)=>{ewo=key(ewo);if(!ewo)return;if(!map.has(ewo))map.set(ewo,[]);map.get(ewo).push({reason,text:String(text).slice(0,1000)});};
 const norm=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
 const closed=v=>/^(closed|ok|complete|completed|all acc\.? balanced|balanced|n\/a|not applicable)$/.test(norm(v));
 const pending=v=>/\b(pending|open|not closed|not received|awaiting|hold|shortage|delayed|delay|not approved)\b/.test(norm(v))||norm(v)==='no';
 for(const row of sources.size||[]){const r=row.row_data||row;for(const field of ['T & A Closed','Next Action to Do\n(What)']){const value=r[field];if(value&&!closed(value)&&pending(value))add(r.EWO,'sample',field+': '+value);}}
 for(const row of sources.accessories||[]){const r=row.row_data||row,v=String(r['Sewing Trims Pending Stts']??'').trim();if(v&&!closed(v)&&!['—','-','none','nil','0'].includes(norm(v)))add(r.EWO,'accessories','Sewing Trims Pending Stts: '+v);}
 for(const row of sources.fabric||[]){
  for(const field of ['status','cutting_difficulties']){
   const raw=String(row[field]??'').trim(),v=norm(raw);if(!v||/\b(no issue|resolved|solved|completed|not pending)\b/.test(v))continue;
   if(/\b(low gsm|gsm (issue|problem|shortage))\b/.test(v)&&!v.includes('not low'))add(row.ewo,'gsm',field+': '+raw);
   if(/\b(fabric|fabrics)\b.*\b(short|shortage|pending|balance issue)\b/.test(v))add(row.ewo,'fabric',field+': '+raw);
   if(/\bpanel wash\b/.test(v)&&/\b(pending|challenge|issue|delay|problem|hold)\b/.test(v))add(row.ewo,'wash',field+': '+raw);
   if(/\bprint\b/.test(v)&&/\b(pending|delay|hold|issue)\b/.test(v))add(row.ewo,'print',field+': '+raw);
   if(/\b(embroidery|emb)\b/.test(v)&&/\b(pending|delay|hold|issue)\b/.test(v))add(row.ewo,'emb',field+': '+raw);
  }
  const balance=gdsNumber(row.fabric_balance);if(balance!==null&&balance<0)add(row.ewo,'fabric','Fabric balance: '+balance+' kg');
 }
 // User rule: positive report WIP is itself evidence of delay.
 const em=gdsGroup(sources.embellishment||[],row=>gdsKey(row['EWO No']));
 for(const [ewo,rows] of em){for(const [reason,send,receive] of [['print','Today Print Send Qty\n',' Today Print Receive Qty'],['emb','Today EMB Send Qty','Today EMB Receive Qty']]){
  const report=gdsReportSum(rows,row=>{const a=gdsNumber(row[send]),b=gdsNumber(row[receive]);return a===null||b===null?null:a-b;});
  if(report.value>0)add(ewo,reason,(reason==='print'?'Print':'Embroidery')+' WIP '+report.value+' pcs > 0: delayed (operating rule)');
 }}
 return map;
}
function buildLoadAnalysisLoss(input){
 const notes=new Set(),allocated=gdsAllocate(input,notes),summary=buildGanttDailySummary({...input,selected:[0,1,2,3,4]}),evidence=laEvidence(input.sources||{}),overrides=input.overrides||{};
 const plan=gdsGroup(allocated.plan,row=>JSON.stringify([row.date,Number(row.line),gdsKey(row.ewo)]));
 const records=[];
 for(const [key,rows] of plan){const [date,line,ewo]=JSON.parse(key);if(!input.dates.includes(date)||!input.lines.includes(line))continue;
  const data=input.data.filter(row=>Number(row.line)===line&&gdsKey(row.ewo)===ewo),smvs=[...new Set(data.map(row=>gdsNumber(row.smv)).filter(v=>v>0))],a=allocated.allocations.get(key);
  const daily=gdsUniqueDaily(input.sah).filter(row=>row.date===date&&Number(row.line)===line&&gdsKey(row.ewo)===ewo);
  const expected=daily.length?gdsSum(daily,row=>gdsNumber(row.value)):smvs.length===1?rows.reduce((n,row)=>n+gdsNumber(row.value),0)*smvs[0]/60:null;
  const known=a?.stages.filter(v=>v!==null)||[],covered=known.length&&(a.smv!==null||known.every(v=>v===0))?known.reduce((n,v)=>n+v,0)*(a.smv||0)/60:null;
  const printPcs=a?.stages[1]??null,embPcs=a?.stages[2]??null;
  const printSah=printPcs===null?null:printPcs===0?0:a.smv===null?null:printPcs*a.smv/60;
  const embSah=embPcs===null?null:embPcs===0?0:a.smv===null?null:embPcs*a.smv/60;
  const delayed=(printSah||0)+(embSah||0),achievable=covered===null?null:Math.max(0,covered-delayed);
  const proof=evidence.get(ewo)||[];
  // Print/EMB receive only their own allocated WIP SAH. A positive WIP flag
  // cannot absorb an unrelated material shortage in addition to that quantity.
  const auto=LA_REASONS.find(reason=>!['print','emb'].includes(reason[0])&&proof.some(p=>p.reason===reason[0]))?.[0]||'unknown',manual=overrides[key];
  const validManual=LA_REASONS.some(r=>r[0]===manual?.reason&&!['planning','print','emb'].includes(r[0]));
  records.push({key,date,line,ewo,plan:expected,ganttForecast:covered,forecast:achievable,printPcs,embPcs,printSah,embSah,gap:expected===null||achievable===null?null:Math.max(0,expected-achievable),evidence:proof,auto,reason:validManual?manual.reason:auto,manual:validManual?manual:null,partial:!!a?.stagePartial.some(Boolean)});
 }
 const days=summary.days.map(day=>{
  const date=day.date,target=gdsNumber(input.dailyCapacity),ganttForecast=day.values[4],planned=gdsNumber(input.planTotals?.[date]),rows=records.filter(row=>row.date===date);
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
    row.contributions={print,emb,[row.manual?row.reason:row.auto]:shortage};row.attributed=shortage+print+emb;row.correctable=shortage;
    buckets.print+=print;buckets.emb+=emb;buckets[row.manual?row.reason:row.auto]+=shortage;
   }
   buckets.unknown+=Math.max(0,remaining-rawShortage*shortageScale);
  }else rows.forEach(row=>{row.attributed=null;row.contributions={};});
  return {date,target,plan:planned,ganttForecast,printSah:rows.reduce((n,r)=>n+(r.printSah||0),0),embSah:rows.reduce((n,r)=>n+(r.embSah||0),0),forecast,loss,loading,buckets,partial:day.partial[4]||rows.some(row=>row.partial||row.gap===null)||planned===null};
 });
 return {days,records,cutoff:summary.cutoff,notes:summary.notes};
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
