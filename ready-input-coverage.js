/* Cutting-hand ready-input coverage; one pooled stock balance per EWO + color. */
let RC_ROWS=[],RC_TOKEN=0,RC_BUSY=false,RC_ERROR='',RC_CUTOFF='';
function rcDateOffset(iso,days){
  if(!validDate(iso))return '';
  const date=new Date(iso+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
function rcDayCell(row,day){
  const state=['green','red'].includes(row['day'+day+'_status'])?row['day'+day+'_status']:'unknown';
  const evidence=row.day_details?.find(d=>d.date===row['day'+day+'_date']);
  const plan=row['day'+day+'_plan'];
  const label=plan===null||plan===undefined?'No plan data':row['day'+day+'_off']?'Off-day':Number(plan)===0?'No scheduled qty':rdFmt(plan)+' pcs';
  const note=state==='green'?'Covered':state==='red'?'Short '+rdFmt(evidence?.shortage_qty)+' pcs':'Coverage unknown';
  return `<td class="rc-day rc-${state}">${label}<small>${note}</small><small>Cumulative: ${rdFmt(evidence?.cumulative_qty)} pcs</small></td>`;
}
function resetReadyInputCoverage(){
  ++RC_TOKEN;RC_ROWS=[];RC_BUSY=false;RC_ERROR='';RC_CUTOFF='';
  const search=document.getElementById('rc-search');if(search)search.value='';
  const buyer=document.getElementById('rc-buyer');if(buyer)buyer.innerHTML='<option value="">All buyers</option>';
  renderReadyInputCoverage();
}
function renderReadyInputCoverage(){
  if(typeof recordDashboardRender==='function')recordDashboardRender('coverage');
  const body=document.getElementById('rc-body'),msg=document.getElementById('rc-msg'),windowLabel=document.getElementById('rc-window');
  if(!body||!msg||!windowLabel)return;
  const authorized=SITE_AUTH_USER&&canAccessSlide(21);
  const search=(document.getElementById('rc-search')?.value||'').trim().toLowerCase();
  const buyer=document.getElementById('rc-buyer')?.value||'';
  const rows=authorized?RC_ROWS.filter(r=>(!search||String(r.ewo).toLowerCase().includes(search))&&(!buyer||buyer===r.buyer)):[];
  for(let day=1;day<=3;day++)document.getElementById('rc-day'+day+'-head').textContent='Day '+day+' · '+(authorized?rcDateOffset(RC_CUTOFF,day)||'—':'—');
  windowLabel.textContent=authorized?'Actual production cutoff: '+(RC_CUTOFF||'—')+' · Next 3 calendar days · Latest reported stock':'';
  body.innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.ewo)}</td><td>${esc(r.buyer)}</td><td>${esc(r.lines?.join(', ')||'')}</td>
    <td class="num">${rdFmt(r.ready_input_qty)} pcs</td>${[1,2,3].map(day=>rcDayCell(r,day)).join('')}
    <td class="num">${rdFmt(r.required_qty)}</td><td class="num">${rdFmt(r.shortage_qty)}</td><td>${esc(r.first_short_date||'—')}</td>
    <td><button type="button" class="pg-btn" data-rc-detail="${esc(r.ewo)}">Evidence</button></td></tr>`).join(''):
    `<tr><td colspan="11" class="cen">${!authorized?'Ready Input Coverage access required.':RC_BUSY?'Loading ready-input evidence…':RC_ERROR?'Coverage data unavailable.':'No running EWOs have a positive plan in the next 3 calendar days.'}</td></tr>`;
  msg.textContent=!authorized?'':RC_ERROR?'Coverage SQL load failed: '+RC_ERROR:RC_BUSY?'Loading…':rows.length+' / '+RC_ROWS.length+' running EWOs · One balance shared across all lines; cumulative demand is checked per color.';
}
async function loadReadyInputCoverage(){
  const token=++RC_TOKEN,session=SITE_SESSION_GENERATION,user=SITE_AUTH_USER?.id,selected=String(ACTIVE_PLAN_UPLOAD?.id||'');
  const current=()=>token===RC_TOKEN&&session===SITE_SESSION_GENERATION&&user===SITE_AUTH_USER?.id&&String(ACTIVE_PLAN_UPLOAD?.id||'')===selected&&canAccessSlide(21);
  RC_ROWS=[];RC_ERROR='';RC_CUTOFF='';RC_BUSY=true;renderReadyInputCoverage();
  if(!user||!canAccessSlide(21)){RC_BUSY=false;return;}
  try{
    let upload=selected;
    if(!upload){
      const {data,error}=await SB.from('plan_uploads').select('id').eq('status','complete').order('uploaded_at',{ascending:false}).limit(1);
      if(error)throw error;if(!current())return;upload=String(data?.[0]?.id||'');
    }
    if(!upload){RC_BUSY=false;renderReadyInputCoverage();return;}
    const cutoff=await SB.from('date_wise_production').select('output_date').order('output_date',{ascending:false}).limit(1);
    if(cutoff.error)throw cutoff.error;if(!current())return;
    const rows=[];
    if(typeof SB.reportSnapshot==='function'){
      const {data,error}=await SB.reportSnapshot('coverage',{upload_id:upload});
      if(error)throw error;if(!current())return;
      if(data?.format!=='report-rows-v1'||data.kind!=='coverage'||!Array.isArray(data.rows)
          ||data.integrity?.complete!==true||data.integrity.row_count!==data.rows.length
          ||String(data.integrity.upload_id)!==upload)throw Error('Coverage SQL read did not complete.');
      rows.push(...data.rows);
    }else for(let offset=0;;offset+=1000){
      const {data,error}=await SB.rpc('get_ready_input_coverage',{p_upload_id:upload}).order('ewo',{ascending:true}).range(offset,offset+999);
      if(error)throw error;if(!current())return;rows.push(...(data||[]));if((data||[]).length<1000)break;
    }
    RC_ROWS=rows;RC_CUTOFF=rows[0]?.cutoff_date||cutoff.data?.[0]?.output_date||'';
    const buyer=document.getElementById('rc-buyer');
    if(buyer){const previous=buyer.value;buyer.innerHTML='<option value="">All buyers</option>'+[...new Set(rows.map(r=>r.buyer).filter(Boolean))].sort().map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join('');buyer.value=[...buyer.options].some(o=>o.value===previous)?previous:'';}
  }catch(error){if(!current())return;RC_ROWS=[];RC_ERROR=error?.message||String(error);}
  finally{if(current()){RC_BUSY=false;renderReadyInputCoverage();}}
}
function showReadyInputEvidence(ewo){
  if(!SITE_AUTH_USER||!canAccessSlide(21))return;
  const row=RC_ROWS.find(r=>String(r.ewo)===ewo);if(!row)return;
  const dialog=document.getElementById('rd-detail-dialog'),body=document.getElementById('rd-detail-body');
  document.getElementById('rd-detail-title').textContent='EWO '+row.ewo+' · Ready Input Evidence';
  body.innerHTML=`<p>Actual production cutoff: ${esc(row.cutoff_date)}. Stock is from latest source reports, not a historical reconstruction. Sewing WIP is excluded.</p>
    <div class="tbl-wrap"><table class="dt"><thead><tr><th>Color</th><th>Cut pcs</th><th>Already input</th><th>Print net</th><th>EMB net</th><th>Ready balance</th><th>Evidence / timestamps</th></tr></thead><tbody>
    ${(row.color_details||[]).map(c=>`<tr><td>${esc(c.color||'Missing color')}</td><td>${rdFmt(c.cut_qty)}</td><td>${rdFmt(c.input_qty)}</td><td>${rdFmt(c.print_qty)}</td><td>${rdFmt(c.emb_qty)}</td><td>${rdFmt(c.ready_qty)}</td><td>${esc(c.reason||'Quantity evidence matched')}<small class="rd-coverage">Cut upload: ${esc(c.fabric_uploaded_at||'—')}<br>Input upload: ${esc(c.input_uploaded_at||'—')}<br>Print/EMB report: ${esc(c.embellishment_date||'—')}<br>Print/EMB upload: ${esc(c.embellishment_uploaded_at||'—')}</small></td></tr>`).join('')}
    </tbody></table></div><div class="tbl-wrap"><table class="dt"><thead><tr><th>Date</th><th>Plan</th><th>Cumulative required</th><th>Cumulative shortage</th><th>Coverage</th></tr></thead><tbody>
    ${(row.day_details||[]).map(d=>`<tr><td>${esc(d.date)}</td><td>${rdFmt(d.plan_qty)}</td><td>${rdFmt(d.cumulative_qty)}</td><td>${rdFmt(d.shortage_qty)}</td><td>${esc({green:'Covered',red:'Short',unknown:'Unknown'}[d.status]||'Unknown')}</td></tr>`).join('')}
    </tbody></table></div><p>Cut or completed Print/EMB receipts minus all-line sewing input. Returns are deducted from receipts. Colors cannot cover each other. Missing/duplicate/conflicting evidence stays Unknown. Both Print and EMB require proof of the same finished pieces; separate totals alone do not establish that overlap.</p>`;
  if(!dialog.open)dialog.showModal();
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-rc-detail]');if(button)showReadyInputEvidence(button.dataset.rcDetail);});
if(typeof CURRENT_SLIDE!=='undefined'&&CURRENT_SLIDE===21&&SITE_AUTH_USER&&canAccessSlide(21))loadReadyInputCoverage();
