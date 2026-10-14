/* EWO Readiness Board: active SQL evidence and the selected completed planning upload. */
const RD_STAGES=[['fabric','Fabric'],['cutting','Cutting'],['print','Print'],['embroidery','Embroidery'],
  ['accessories','Accessories'],['size_set','Size Set'],['sewing','Sewing']];
const RD_LABELS={green:'Ready',amber:'Partial',red:'Blocked',unknown:'Unknown',na:'N/A'};
const RD_RISKS={high:'High',watch:'Watch',low:'Low',unknown:'Unknown'};
const RD_COLUMNS='upload_id,ewo,buyer,lines,pcd,psd,pfd,delivery,first_plan_date,first_day_plan_qty,starter_qty,'+
  'fabric_status,cutting_status,print_status,embroidery_status,accessories_status,size_set_status,sewing_status,'+
  'readiness_score,known_stages,applicable_stages,delivery_risk,risk_reason,sewing_started,input_qty,output_qty,'+
  'plan_qty,color_details,accessories_uploaded_at,as_of_date';
let RD_ROWS=[],RD_UPLOAD_ID='',RD_LOAD_TOKEN=0,RD_BUSY=false,RD_ERROR='';

function rdFmt(value){
  return value===null||value===undefined||value===''||!Number.isFinite(Number(value))?'—':Number(value).toLocaleString('en-US');
}
function rdLight(status){
  const state=Object.hasOwn(RD_LABELS,status)?status:'unknown';
  return `<span class="rd-light rd-${state}"><span aria-hidden="true">●</span> ${RD_LABELS[state]}</span>`;
}
function rdRisk(status){
  const state=Object.hasOwn(RD_RISKS,status)?status:'unknown';
  return `<span class="rd-risk rd-${state}">${RD_RISKS[state]}</span>`;
}
function resetEWOReadinessBoard(){
  if(typeof resetReadyInputCoverage==='function')resetReadyInputCoverage();
  ++RD_LOAD_TOKEN;RD_ROWS=[];RD_UPLOAD_ID='';RD_BUSY=false;RD_ERROR='';
  document.getElementById('rd-detail-dialog')?.close();
  document.getElementById('rd-detail-body')?.replaceChildren();
  const buyer=document.getElementById('rd-buyer');if(buyer)buyer.innerHTML='<option value="">All buyers</option>';
  for(const id of ['rd-search','rd-readiness','rd-risk']){
    const input=document.getElementById(id);if(input)input.value='';
  }
  renderEWOReadinessBoard();
}
function renderEWOReadinessBoard(){
  if(typeof recordDashboardRender==='function')recordDashboardRender('readiness');
  const body=document.getElementById('rd-body'),kpis=document.getElementById('rd-kpis'),msg=document.getElementById('rd-msg');
  if(!body||!kpis||!msg)return;
  if(!SITE_AUTH_USER||!canAccessSlide(21)){
    body.innerHTML='<tr><td colspan="21" class="cen">EWO Readiness Board access required.</td></tr>';
    kpis.replaceChildren();msg.textContent='';return;
  }
  const search=(document.getElementById('rd-search')?.value||'').trim().toLowerCase();
  const buyer=document.getElementById('rd-buyer')?.value||'';
  const readiness=document.getElementById('rd-readiness')?.value||'';
  const risk=document.getElementById('rd-risk')?.value||'';
  const rows=RD_ROWS.filter(r=>(!search||String(r.ewo).toLowerCase().includes(search))&&
    (!buyer||r.buyer===buyer)&&(!readiness||r.sewing_status===readiness)&&(!risk||r.delivery_risk===risk));
  const cards=[['EWOs',rows.length,'Selected planning snapshot'],
    ['READY TO START',rows.filter(r=>r.sewing_status==='green').length,'80% starter quantities and approvals'],
    ['HIGH MILESTONE RISK',rows.filter(r=>r.delivery_risk==='high').length,'PCD / PSD / PFD evidence'],
    ['INCOMPLETE EVIDENCE',rows.filter(r=>r.readiness_score===null).length,'Missing or conflicting sources']];
  kpis.innerHTML=cards.map(([label,value,note])=>`<div class="kpi"><div class="kpi-lbl">${label}</div><div class="kpi-val">${rdFmt(value)}</div><div class="kpi-sub">${note}</div></div>`).join('');
  body.innerHTML=rows.length?rows.map(r=>`<tr>
    <td>${esc(r.ewo)}</td><td>${esc(r.buyer)}</td><td>${esc(r.lines?.join(', ')||'')}</td>
    <td>${esc(r.first_plan_date||'—')}</td><td class="num">${rdFmt(r.first_day_plan_qty)}</td><td class="num">${rdFmt(r.starter_qty)}</td>
    ${RD_STAGES.map(([key])=>`<td>${rdLight(r[key+'_status'])}</td>`).join('')}
    <td class="num">${r.readiness_score===null?'—':rdFmt(r.readiness_score)+'%'}<small class="rd-coverage">${rdFmt(r.known_stages)}/${rdFmt(r.applicable_stages)} known</small></td>
    <td title="${esc(r.risk_reason)}">${rdRisk(r.delivery_risk)}</td>
    <td>${esc(r.pcd||'—')}</td><td>${esc(r.psd||'—')}</td><td>${esc(r.pfd||'—')}</td><td>${esc(r.delivery||'—')}</td>
    <td>${r.sewing_started?'Input recorded':'No input evidence'}<small class="rd-coverage">${rdFmt(r.input_qty)} pcs</small></td>
    <td><button type="button" class="pg-btn" data-rd-detail="${esc(r.ewo)}">Evidence</button></td></tr>`).join(''):
    `<tr><td colspan="21" class="cen">${RD_ERROR?'Readiness data unavailable.':RD_BUSY?'Loading SQL readiness evidence…':RD_ROWS.length?'No EWOs match these filters.':'No eligible Plan/Day EWOs in this completed snapshot.'}</td></tr>`;
  const uploadLabel=PLAN_UPLOAD_CATALOG.find(u=>String(u.id)===RD_UPLOAD_ID)?.planning_id||RD_UPLOAD_ID;
  msg.textContent=RD_ERROR?'SQL load failed: '+RD_ERROR:RD_BUSY?'Loading selected planning readiness…':
    `${rows.length} / ${RD_ROWS.length} EWOs · ${uploadLabel||'No planning selected'} · As of ${RD_ROWS[0]?.as_of_date||'—'} (Dhaka)`;
}
function rdPopulateBuyers(){
  const select=document.getElementById('rd-buyer');if(!select)return;
  const previous=select.value;
  select.innerHTML='<option value="">All buyers</option>'+[...new Set(RD_ROWS.map(r=>r.buyer).filter(Boolean))]
    .sort().map(buyer=>`<option value="${esc(buyer)}">${esc(buyer)}</option>`).join('');
  select.value=[...select.options].some(o=>o.value===previous)?previous:'';
}
async function loadEWOReadinessBoard(){
  if(typeof loadReadyInputCoverage==='function')loadReadyInputCoverage();
  const token=++RD_LOAD_TOKEN,session=SITE_SESSION_GENERATION,userId=SITE_AUTH_USER?.id;
  const selectedId=String(ACTIVE_PLAN_UPLOAD?.id||'');
  const current=()=>token===RD_LOAD_TOKEN&&session===SITE_SESSION_GENERATION&&userId===SITE_AUTH_USER?.id&&
    String(ACTIVE_PLAN_UPLOAD?.id||'')===selectedId&&canAccessSlide(21);
  document.getElementById('rd-detail-dialog')?.close();
  document.getElementById('rd-detail-body')?.replaceChildren();
  RD_ROWS=[];RD_ERROR='';RD_BUSY=true;RD_UPLOAD_ID=selectedId;renderEWOReadinessBoard();
  if(!userId||!canAccessSlide(21)){RD_BUSY=false;return;}
  try{
    let uploadId=selectedId;
    if(!uploadId){
      const {data,error}=await SB.from('plan_uploads').select('id').eq('status','complete')
        .order('uploaded_at',{ascending:false}).order('id',{ascending:false}).limit(1);
      if(error)throw error;if(!current())return;
      uploadId=String(data?.[0]?.id||'');
    }
    if(!uploadId){RD_BUSY=false;renderEWOReadinessBoard();return;}
    const rows=[];
    for(let offset=0;;offset+=1000){
      const {data,error}=await SB.from('ewo_readiness_board').select(RD_COLUMNS).eq('upload_id',uploadId)
        .order('ewo',{ascending:true}).range(offset,offset+999);
      if(error)throw error;if(!current())return;
      rows.push(...(data||[]));if((data||[]).length<1000)break;
    }
    RD_ROWS=rows;RD_UPLOAD_ID=uploadId;rdPopulateBuyers();
  }catch(error){
    if(!current())return;RD_ROWS=[];RD_ERROR=error?.message||String(error);
  }finally{
    if(current()){RD_BUSY=false;renderEWOReadinessBoard();}
  }
}
function showEWOReadinessEvidence(ewo){
  if(!SITE_AUTH_USER||!canAccessSlide(21))return;
  const row=RD_ROWS.find(r=>String(r.ewo)===ewo);if(!row)return;
  const dialog=document.getElementById('rd-detail-dialog'),body=document.getElementById('rd-detail-body');
  document.getElementById('rd-detail-title').textContent='EWO '+row.ewo+' · Readiness Evidence';
  body.innerHTML=`<p>${esc(row.risk_reason)}</p><p>First positive plan date: ${esc(row.first_plan_date||'—')}. Each color requires ceil(80% × its first-day Plan pcs).</p>
    <div class="tbl-wrap"><table class="dt"><thead><tr><th>Color</th><th>Day-1 Plan</th><th>80% Target</th><th>Fabric pcs evidence</th><th>Cut pcs</th><th>Print usable / target</th><th>EMB usable / target</th><th>Size Set</th><th>Source timestamps</th></tr></thead><tbody>
    ${(row.color_details||[]).map(c=>`<tr><td>${esc(c.color||'Missing color')}</td><td class="num">${rdFmt(c.plan_qty)}</td><td class="num">${rdFmt(c.required_qty)}</td>
      <td>${rdLight(c.fabric)} ${rdFmt(c.fabric_qty)}</td><td>${rdLight(c.cutting)} ${rdFmt(c.cut_qty)}</td>
      <td>${rdLight(c.print)} ${rdFmt(c.print_qty)} / ${rdFmt(c.print_required_qty)}</td>
      <td>${rdLight(c.embroidery)} ${rdFmt(c.emb_qty)} / ${rdFmt(c.emb_required_qty)}</td><td>${rdLight(c.size_set)}</td>
      <td>Fabric: ${esc(c.fabric_uploaded_at||'—')}<br>Print/EMB report: ${esc(c.embellishment_date||'—')}<br>Print/EMB upload: ${esc(c.embellishment_uploaded_at||'—')}<br>Size Set: ${esc(c.size_set_uploaded_at||'—')}</td></tr>`).join('')}
    </tbody></table></div><p>Accessories source: ${esc(row.accessories_uploaded_at||'—')}. Sewing input: ${rdFmt(row.input_qty)} pcs; output: ${rdFmt(row.output_qty)} / planned ${rdFmt(row.plan_qty)} pcs.</p>
    <p>Fabric proof uses the greater of reported cutable pcs and cut pcs, without adding them. Print/EMB use the latest cumulative report and deduct reported returns. Conflicting quantities are Unknown.</p>
    <p>Score: Green 100, Partial 50, Blocked 0; equal weights across six prerequisites. N/A is excluded. Any Unknown leaves the score unreported. Sewing is derived and is not counted twice.</p>`;
  if(!dialog.open)dialog.showModal();
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-rd-detail]');if(button)showEWOReadinessEvidence(button.dataset.rdDetail);
});
