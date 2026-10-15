let GANTT_EWO_SEARCH='';
let GANTT_LINE_FILTER='';
let S11_RANGE_PLAN_ID=null,S11_RANGE_FROM='',S11_RANGE_TO='',S11_RANGE_NARROWED=false;
function s11DateRangeChanged(which){
  const from=document.getElementById('s11-date-from'),to=document.getElementById('s11-date-to');
  if(!from||!to)return;
  if(from.value>to.value){if(which==='from')to.value=from.value;else from.value=to.value;}
  S11_RANGE_FROM=from.value;S11_RANGE_TO=to.value;
  renderS11(getFiltered());
}
function s11ResetDateRange(){S11_RANGE_PLAN_ID=null;renderS11(getFiltered());}
function ganttCoverageCondition(wip,cutting,cutable,shortage){
  return wip?'wip':cutting?'cutting':cutable?'cutable':shortage?'short':'';
}
function ganttConditionVisible(condition,enabled,filter){
  return !enabled||!filter||condition===filter;
}

function renderS11(data){
  if(!prepareSharedReportView(7))return;
  if(typeof recordDashboardRender==='function')recordDashboardRender('7');
  const selected='';
  const master=getChassisMasterLines();
  const allDates=[...new Set(DAILY_PLAN.map(d=>d.date).filter(Boolean))].sort();
  const candidateDates=selected ? allDates.filter(d=>monthFromISO(d)===selected) : allDates;
  const activeDateSet=new Set(DAILY_PLAN.filter(d=>candidateDates.includes(d.date)&&d.value>0&&master.has(Number(d.line))).map(d=>d.date));
  const planDates=candidateDates.filter(d=>activeDateSet.has(d));
  const planId=String(ACTIVE_PLAN_UPLOAD?.id||'local');
  if(S11_RANGE_PLAN_ID!==planId){
    S11_RANGE_PLAN_ID=planId;S11_RANGE_FROM=planDates[0]||'';S11_RANGE_TO=planDates.at(-1)||'';
  }
  const from=document.getElementById('s11-date-from'),to=document.getElementById('s11-date-to'),all=document.getElementById('s11-date-all');
  for(const input of [from,to]){input.disabled=!planDates.length;input.min=planDates[0]||'';input.max=planDates.at(-1)||'';}
  if(planDates.length){
    const clamp=value=>!value||value<planDates[0]?planDates[0]:value>planDates.at(-1)?planDates.at(-1):value;
    S11_RANGE_FROM=clamp(S11_RANGE_FROM);S11_RANGE_TO=clamp(S11_RANGE_TO);
    if(S11_RANGE_FROM>S11_RANGE_TO)S11_RANGE_TO=S11_RANGE_FROM;
  }
  from.value=S11_RANGE_FROM;to.value=S11_RANGE_TO;all.disabled=!planDates.length;
  S11_RANGE_NARROWED=!!planDates.length&&(S11_RANGE_FROM!==planDates[0]||S11_RANGE_TO!==planDates.at(-1));
  const dates=planDates.filter(d=>d>=S11_RANGE_FROM&&d<=S11_RANGE_TO);
  // Retain the complete plan for cumulative coverage, even when showing a short date range.
  const scope=DAILY_PLAN.filter(d=>activeDateSet.has(d.date)&&d.value>0&&master.has(Number(d.line)));
  document.getElementById('s11-month').textContent=activePlanningLabel();

  // Shared Gantt normalizers: function scope, available to aggregation, indexing and rendering.
  const normEwo=v=>{
    let z=String(v??'').trim().toUpperCase();
    if(/^\d+\.0+$/.test(z))z=z.replace(/\.0+$/,'');
    return z;
  };
  const normColor=v=>String(v??'')
    .trim().toUpperCase().replace(/\s+/g,' ').replace(/\s*([\/-])\s*/g,'$1');

  // Correct Plan/Day aggregation: legitimate PO/Color Plan/Day rows are summed,
  // but an accidental duplicate plan_daily row for the same record_id + date counts once.
  // Example: Line 5 / 23-Sep / EWO 271774 = 846 + 150 = 996.
  const ewoQty=new Map(), metaMap=new Map(), planColorQty=new Map();
  const seenPlanDailyRecordDate=new Set();
  scope.forEach(d=>{
    const line=Number(d.line),date=d.date,ewo=normEwo(d.ewo);
    if(!line||!date||!ewo)return;
    const rdKey=String(d.record_id??'')+'|'+date;
    if(d.record_id!=null && seenPlanDailyRecordDate.has(rdKey))return;
    if(d.record_id!=null)seenPlanDailyRecordDate.add(rdKey);
    const k=line+'|'+date+'|'+ewo;
    ewoQty.set(k,(ewoQty.get(k)||0)+N(d.value));
    if(!metaMap.has(k))metaMap.set(k,{buyer:d.buyer||'',style:d.style||'',color:d.color||'',smv:N(d.smv)});
    const ck=k+'|'+String(d.color||'').trim();
    planColorQty.set(ck,(planColorQty.get(ck)||0)+N(d.value));
  });

  const metricSum=(arr,line,ewo,month)=>arr
    .filter(x=>Number(x.line)===Number(line)&&String(x.ewo)===String(ewo)&&(!month||x.month===month))
    .reduce((s,x)=>s+N(x.total),0);

  const cellEntries=new Map();
  ewoQty.forEach((qty,k)=>{
    const p=k.split('|'),line=Number(p[0]),date=p[1],ewo=p.slice(2).join('|');
    const cellKey=line+'|'+date,m=metaMap.get(k)||{};
    const month=monthFromISO(date);
    // Exact hovered Line + Date Plan SAH:
    // Plan SAH = this Gantt cell's Plan Qty × SMV / 60.
    // Do NOT use monthly SAH/Day total here.
    let smv=N(m.smv);
    if(smv<=0){
      const dp=scope.find(x=>Number(x.line)===line&&x.date===date&&String(x.ewo||'').trim()===ewo&&N(x.smv)>0);
      if(dp)smv=N(dp.smv);
    }
    const sah=qty*smv/60;
    const clock=metricSum(CLOCK_HOUR_DATA,line,ewo,month);
    const eff=clock>0?sah/clock*100:0;
    // Resolve Color from THIS exact Plan Line + Date + EWO cell.
    // If the same EWO has multiple colors on the same line/date, use the color
    // carrying the highest Plan Qty for that cell (stable alphabetical tie-break).
    const colorPrefix=k+'|';
    const colorCandidates=[];
    planColorQty.forEach((cq,ck)=>{
      if(ck.startsWith(colorPrefix))colorCandidates.push({color:ck.slice(colorPrefix.length),qty:N(cq)});
    });
    colorCandidates.sort((a,b)=>b.qty-a.qty || String(a.color).localeCompare(String(b.color)));
    let color=colorCandidates.length?colorCandidates[0].color:(m.color||'');
    if(!color){
      const sr=SAH_DATA.find(x=>Number(x.line)===line&&String(x.ewo)===String(ewo)&&(!month||x.month===month));
      if(sr)color=sr.color||'';
    }
    const ganttColor=normColor(color);

    // EWO-wise reconciliation: Color is informational only, never a calculation key.
    // Sewing metrics = exact Line + EWO, summed across every Color.
    const sio=SEWING_IO_DATA.filter(x=>
      Number(x.line_no)===line &&
      normEwo(x.ewo)===normEwo(ewo)
    );
    const sewingInput=sio.reduce((a,x)=>a+N(x.input),0);
    const sewingOutput=sio.reduce((a,x)=>a+N(x.output),0);
    const sewingWip=sio.reduce((a,x)=>a+N(x.wip),0);
    const sewingReject=sio.reduce((a,x)=>a+N(x.reject),0);

    // Exact Date Wise Production match:
    // SAME Line + SAME Output Date + SAME EWO, across all Colors.
    // The production report may contain multiple PO / Color rows for that key,
    // therefore Total Qty is summed once across every exact matching source row.
    const normProdEwo=v=>{
      let z=String(v??'').trim().toUpperCase();
      if(/^\d+\.0+$/.test(z))z=z.replace(/\.0+$/,'');
      return z;
    };
    const productionMatches=(DATE_WISE_PRODUCTION_DATA||[]).filter(x=>
      Number(x.line_no)===Number(line) &&
      String(x.output_date||'').slice(0,10)===String(date||'').slice(0,10) &&
      normProdEwo(x.ewo)===normProdEwo(ewo)
    );
    const productionQty=productionMatches.reduce((a,x)=>a+N(x.total_qty),0);

    // Cut Qty = EWO total across every Color (not line/date scoped).
    const fcMatches=(FABRIC_CUTTING_DATA||[]).filter(x=>
      normEwo(x.ewo)===normEwo(ewo)
    );
    const cutableQty=fcMatches.reduce((a,x)=>a+N(x.cutable_qty),0);
    const cutQty=fcMatches.reduce((a,x)=>a+N(x.total_cut_qty),0);

    // Cutting WIP = EWO Total Cut Qty - EWO Total Sewing Input.
    // All lines and all colors are combined; no Line/Date/Color filter here.
    const cuttingInputMatches=(SEWING_IO_DATA||[]).filter(x=>
      normEwo(x.ewo)===normEwo(ewo)
    );
    const cuttingTotalSewingInput=cuttingInputMatches.reduce((sum,x)=>sum+N(x.input),0);
    const cuttingWip=Math.max(0,cutQty-cuttingTotalSewingInput);

    // Informational only: show every known color for this EWO.
    const ewoColors=[...new Set([
      ...scope.filter(x=>normEwo(x.ewo)===normEwo(ewo)).map(x=>String(x.color||'').trim()),
      ...(FABRIC_CUTTING_DATA||[]).filter(x=>normEwo(x.ewo)===normEwo(ewo)).map(x=>String(x.color_name||'').trim()),
      ...(SEWING_IO_DATA||[]).filter(x=>normEwo(x.ewo)===normEwo(ewo)).map(x=>String(x.color||'').trim()),
      ...(DATE_WISE_PRODUCTION_DATA||[]).filter(x=>normEwo(x.ewo)===normEwo(ewo)).map(x=>String(x.color||'').trim())
    ].filter(Boolean))].sort((a,b)=>a.localeCompare(b));

    // Informational Cutting comments ONLY: exact EWO + exact Gantt Color.
    // These fields do not participate in any quantity, WIP, coverage, winner or color calculation.
    const exactColorCuttingMatches=(FABRIC_CUTTING_DATA||[]).filter(x=>
      normEwo(x.ewo)===normEwo(ewo) &&
      normColor(x.color_name)===ganttColor
    );
    const uniqueCutText=field=>[...new Set(exactColorCuttingMatches
      .map(x=>String(x[field]??'').trim()).filter(Boolean))].join(' | ')||'—';
    const cuttingComment={
      styleEmb:uniqueCutText('style_embellishment_type'),
      status:uniqueCutText('status'),
      difficulties:uniqueCutText('cutting_difficulties')
    };

    const item={ewo,qty,buyer:m.buyer||'',style:m.style||'',color,planColors:colorCandidates,ewoColors,sah,clock,eff,
      sewingInput,sewingOutput,sewingWip,sewingReject,sewingRows:sio.length,
      productionQty,productionRows:productionMatches.length,
      cutableQty,cutQty,cutRows:fcMatches.length,cuttingTotalSewingInput,cuttingWip,
      cuttingComment};
    if(!cellEntries.has(cellKey))cellEntries.set(cellKey,[]);
    cellEntries.get(cellKey).push(item);
  });

  cellEntries.forEach(items=>items.sort((a,b)=>b.qty-a.qty||a.ewo.localeCompare(b.ewo,undefined,{numeric:true})));

  const allLines=[...master].map(Number).filter(n=>n>0&&n!==46).sort((a,b)=>a-b);
  const searchEwo=String(GANTT_EWO_SEARCH||'').trim().toUpperCase();
  const selectedLine=Number(GANTT_LINE_FILTER)||0;
  const lines=allLines.filter(line=>{
    if(selectedLine && line!==selectedLine)return false;
    if(!searchEwo)return true;
    return dates.some(date=>{
      return (cellEntries.get(line+'|'+date)||[]).some(w=>normEwo(w.ewo)===searchEwo);
    });
  });
  const displayDates=searchEwo
    ? dates.filter(date=>lines.some(line=>(cellEntries.get(line+'|'+date)||[]).some(w=>normEwo(w.ewo)===searchEwo)))
    : dates;

  // Pre-index latest production date once per Line+EWO.
  // This avoids rescanning thousands of production rows for every Gantt cell.
  const latestProdByLineEwo=new Map();
  let actualProductionDate='';
  for(const x of (DATE_WISE_PRODUCTION_DATA||[])){
    const ln=Number(x.line_no);
    const ew=normEwo(x.ewo);
    const dt=String(x.output_date||'').slice(0,10);
    // ACTUAL PRODUCTION REPORT CUTOFF:
    // The latest valid output_date present in the uploaded Date Wise Actual Production Report
    // is the official "production updated through" date. Qty is NOT used to decide the cutoff.
    if(dt && (!actualProductionDate || dt>actualProductionDate))actualProductionDate=dt;
    if(!ln||!ew||!dt)continue;
    const k=ln+'|'+ew;
    if(!latestProdByLineEwo.has(k)||dt>latestProdByLineEwo.get(k))latestProdByLineEwo.set(k,dt);
  }

  // Precompute cumulative Plan Qty from all planned EWO entries, grouped by Line+EWO.
  const ewoCoverage=new Map();
  cellEntries.forEach((items,ck)=>items.forEach(cw=>{
    const p=String(ck).split('|');
    const ln=Number(p[0]),dt=String(p[1]||'').slice(0,10),ew=normEwo(cw.ewo);
    if(!ln||!dt||!ew)return;
    const k=ln+'|'+ew;
    if(!ewoCoverage.has(k))ewoCoverage.set(k,[]);
    ewoCoverage.get(k).push({date:dt,qty:N(cw.qty)});
  }));
  ewoCoverage.forEach(arr=>arr.sort((a,b)=>a.date.localeCompare(b.date)));

  const dateLabel=d=>{const dt=new Date(d+'T00:00:00');return String(dt.getDate()).padStart(2,'0')+'-'+dt.toLocaleString('en-US',{month:'short'})+'-'+String(dt.getFullYear()).slice(-2)};
  const s11Count=document.getElementById('s11-count'); if(s11Count)s11Count.textContent=lines.length+' Teams · '+displayDates.length+' active days'+(actualProductionDate?' · Actual Production Report updated through: '+dateLabel(actualProductionDate):'');
  const s11Head=document.getElementById('s11-head'); if(s11Head)s11Head.innerHTML='<tr><th class="sticky-team">Team</th>'+displayDates.map(d=>'<th class="g-date">'+dateLabel(d)+'</th>').join('')+'</tr>';

  const ewoInput=document.getElementById('gantt-ewo-search');
  const ewoBtn=document.getElementById('gantt-ewo-search-btn');
  const lineSel=document.getElementById('gantt-line-filter');
  const clearBtn=document.getElementById('gantt-filter-clear');
  const colorToggle=document.getElementById('gantt-color-condition');
  const conditionSelect=document.getElementById('gantt-condition-filter');
  const colorEnabled=!!colorToggle?.checked;
  const conditionFilter=colorEnabled?conditionSelect?.value||'':'';
  if(conditionSelect)conditionSelect.disabled=!colorEnabled;
  if(lineSel){
    const current=String(GANTT_LINE_FILTER||'');
    lineSel.innerHTML='<option value="">All Lines</option>'+allLines.map(x=>'<option value="'+x+'" '+(String(x)===current?'selected':'')+'>Line '+x+'</option>').join('');
    lineSel.onchange=()=>{GANTT_LINE_FILTER=lineSel.value;renderS11(data);};
  }
  if(ewoInput){
    ewoInput.value=GANTT_EWO_SEARCH;
    const runSearch=()=>flushDashboardInput(ewoInput,()=>{GANTT_EWO_SEARCH=String(ewoInput.value||'').trim();renderS11(data);});
    ewoInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();runSearch();}};
    if(ewoBtn)ewoBtn.onclick=runSearch;
  }
  if(clearBtn)clearBtn.onclick=()=>{
    GANTT_EWO_SEARCH='';GANTT_LINE_FILTER='';
    if(colorToggle)colorToggle.checked=true;
    if(conditionSelect)conditionSelect.value='';
    renderS11(data);
  };

  const s11Body=document.getElementById('s11-body'); if(!s11Body)return; s11Body.innerHTML=lines.map(line=>'<tr><td class="sticky-team">'+line+'</td>'+displayDates.map(date=>{
    const items=cellEntries.get(line+'|'+date)||[];
    const entries=items.filter(w=>!searchEwo||normEwo(w.ewo)===searchEwo).map(w=>{
      // WIP coverage starts AFTER this exact Line + EWO's latest production date.
      // All planned EWO entries remain the source for cumulative future Plan Qty.
      const coverageKey=Number(line)+'|'+normEwo(w.ewo);
      const lineEwoLatestProductionDate=latestProdByLineEwo.get(coverageKey)||'';
      const thisDate=String(date||'').slice(0,10);
      // Material coverage colors are allowed only AFTER the latest date physically present
      // in the uploaded Date Wise Actual Production Report. Dates through that report date
      // keep the normal Gantt color; coverage begins strictly on the next plan date.
      const latestProductionDate=actualProductionDate;
      const afterProductionCutoff=!!actualProductionDate && thisDate>actualProductionDate;

      let wipCovered=false,cuttingCovered=false,cutableCovered=false,materialShort=false;
      if(afterProductionCutoff){
        const sameLineEwoFuture=(ewoCoverage.get(coverageKey)||[]);
        let cumulativePlan=0;
        for(const fp of sameLineEwoFuture){
          if(latestProductionDate && fp.date<=latestProductionDate)continue;
          if(fp.date>thisDate)break;
          cumulativePlan+=N(fp.qty);
        }
        // Sequential/additive stock consumption:
        // 1) cumulative Plan consumes Sewing WIP first;
        // 2) only the uncovered balance consumes Cutting WIP;
        // 3) only the still-uncovered balance consumes Cutable Qty.
        const sewingStock=N(w.sewingWip);
        const cuttingStock=N(w.cuttingWip);
        const cutableStock=N(w.cutableQty);
        const planRequiringCutting=Math.max(0,cumulativePlan-sewingStock);
        const planRequiringCutable=Math.max(0,cumulativePlan-sewingStock-cuttingStock);

        w.consumableWip=Math.max(0,sewingStock-cumulativePlan);
        w.consumableCuttingWip=Math.max(0,cuttingStock-planRequiringCutting);
        w.consumableCutableQty=Math.max(0,cutableStock-planRequiringCutable);

        wipCovered=cumulativePlan<=sewingStock;
        cuttingCovered=!wipCovered && cumulativePlan<=sewingStock+cuttingStock;
        cutableCovered=!wipCovered && !cuttingCovered && cumulativePlan<=sewingStock+cuttingStock+cutableStock;
        materialShort=!wipCovered && !cuttingCovered && !cutableCovered;
      }
      if(!afterProductionCutoff){
        w.consumableWip=null;
        w.consumableCuttingWip=null;
        w.consumableCutableQty=null;
      }

      const condition=ganttCoverageCondition(wipCovered,cuttingCovered,cutableCovered,materialShort);
      if(!ganttConditionVisible(condition,colorEnabled,conditionFilter))return '';
      const cellEwos=items.map(item=>({line,date,ewo:item.ewo,qty:item.qty,color:item.color,planColors:item.planColors,buyer:item.buyer,style:item.style}));
      const payloadWithWip=encodeURIComponent(JSON.stringify({line,date,...w,cellEwos}));
      const coverageClass=!colorEnabled?'':condition==='wip'?' g-wip-covered':condition==='cutting'?' g-cutting-covered':condition==='cutable'?' g-cutable-covered':condition==='short'?' g-material-short':'';
      return '<button type="button" class="g-ewo'+coverageClass+'" data-gantt="'+payloadWithWip+'" aria-label="Open EWO '+esc(w.ewo)+' status">'+esc(w.ewo)+'</button>';
    }).filter(Boolean);
    return entries.length?'<td class="g-ewo-cell"><div class="g-ewo-stack">'+entries.join('\n')+'</div></td>':'<td class="g-empty">&nbsp;</td>';
  }).join('')+'</tr>').join('');

  if(s11Body.addEventListener&&!s11Body.dataset.ganttBound){
    s11Body.dataset.ganttBound='1';
    s11Body.addEventListener('click',event=>{
      const target=event.target.closest('[data-gantt]');
      if(target&&s11Body.contains(target))showGanttPopup(target);
    });
    s11Body.addEventListener('keydown',event=>{
      const target=event.target.closest('[data-gantt]');
      if(target&&s11Body.contains(target)&&(event.key==='Enter'||event.key===' ')){
        event.preventDefault();showGanttPopup(target);
      }
    });
  }
  if(typeof GANTT_ACTION_TAB!=='undefined'&&GANTT_ACTION_TAB!=='gantt')renderGanttActionCalendar();
}
