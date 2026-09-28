/* Embellishment Send Receive: preserve 21 CSV cells and activate complete daily files. */
const EM_HEADERS=[
  'Code','Date','EWO No','Style No','Buyer','Buyer Team','Color','Order Qty',
  'Today Print Send Qty\n','Total Print Send Qty\n',' Today Print Receive Qty',
  'Total Print Receive Qty','Today Print Return Qty','Total Print Return Qty',
  'Today EMB Send Qty','Total EMB Send Qty','Today EMB Receive Qty',
  'Total EMB Receive Qty','Today EMB Return Qty','Total EMB Return Qty',''
];
const EM_PAGE_SIZE=50;
let EM_ROWS=[],EM_FILTERED=[],EM_PAGE=1,EM_MODE='sql',EM_FILE_NAME='',EM_UPLOADED_AT='';
let EM_PREVIEW=null,EM_LOAD_TOKEN=0,EM_FILE_TOKEN=0,EM_SEARCH_TIMER=0;
const emCell=(row,i)=>String(row?.[i===20?'csv_column_21':EM_HEADERS[i]]??'');
const emCount=n=>Number(n||0).toLocaleString('en-US');
function emMessage(id,value){const el=document.getElementById(id);if(el)el.textContent=value;}

// Quoted fields can contain commas or line breaks. No trimming: spaces in the
// headings and source cells are significant for a faithful import.
function parseEmbellishmentRecords(input){
  const text=input.replace(/^\uFEFF/,'');let quoted=false,closed=false,field='',row=[];
  const records=[];
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){
      if(c==='"'&&text[i+1]==='"'){field+='"';i++;}
      else if(c==='"'){quoted=false;closed=true;}
      else field+=c;
    }else if(c==='"'&&field===''&&!closed){quoted=true;}
    else if(c===','){row.push(field);field='';closed=false;}
    else if(c==='\r'||c==='\n'){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(field);records.push(row);row=[];field='';closed=false;
    }else{
      if(closed)throw Error('Unexpected character after a closing CSV quote.');
      field+=c;
    }
  }
  if(quoted)throw Error('Unclosed CSV quoted field.');
  if(field!==''||row.length){row.push(field);records.push(row);}
  return records;
}
function emDateTime(value){
  const match=/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/.exec(value);
  if(!match)return NaN;
  const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(match[2]);
  if(month<0)return NaN;
  const year=2000+Number(match[3]),day=Number(match[1]);
  const time=Date.UTC(year,month,day),d=new Date(time);
  return d.getUTCFullYear()===year&&d.getUTCMonth()===month&&d.getUTCDate()===day?time:NaN;
}
function parseEmbellishmentCSV(text){
  const records=parseEmbellishmentRecords(text),headers=records.shift();
  if(!headers)throw Error('CSV headings are missing.');
  // Report exports differ in line breaks, spacing, case and sometimes omit the
  // final unnamed column. Match by name; keep the original cell text unchanged.
  const key=header=>String(header).replace(/[\u00a0\s]+/g,' ').trim().toLowerCase();
  const expected=EM_HEADERS.slice(0,20).map(key),positions=new Map();
  headers.forEach((header,index)=>{
    const name=key(header);
    if(!name)return;
    if(positions.has(name))throw Error(`Duplicate CSV heading: ${header.trim()}`);
    positions.set(name,index);
  });
  const missing=expected.filter(name=>!positions.has(name));
  const unexpected=[...positions.keys()].filter(name=>!expected.includes(name));
  if(missing.length||unexpected.length)
    throw Error(`CSV headings do not match the Embellishment report.${missing.length?' Missing: '+missing.join(', ')+'.':''}${unexpected.length?' Unexpected: '+unexpected.join(', ')+'.':''}`);
  const unnamed=headers.findIndex(header=>!key(header)),indices=expected.map(name=>positions.get(name));
  const data=records.filter(cells=>cells.length!==1||cells[0]!=='');
  if(!data.length||data.length>100000)throw Error('CSV must contain 1–100,000 data rows.');
  return data.map((cells,i)=>{
    if(cells.length>headers.length&&cells.slice(headers.length).some(value=>value!==''))
      throw Error(`CSV row ${i+2}: unexpected data after the report columns.`);
    if(indices.some(index=>index>=cells.length))throw Error(`CSV row ${i+2}: one or more report cells are missing.`);
    if(!Number.isFinite(emDateTime(cells[indices[1]])))throw Error(`CSV row ${i+2}: invalid Date. Expected D-Mon-YY.`);
    const values=Object.fromEntries(EM_HEADERS.map((header,j)=>
      [j===20?'csv_column_21':header,j===20?(unnamed<0?'':(cells[unnamed]??'')):cells[indices[j]]]));
    return {source_row_no:i+2,...values};
  });
}
function embellishmentSetRows(rows,fileName,uploadedAt='',mode='sql'){
  EM_ROWS=rows;EM_PAGE=1;EM_FILE_NAME=fileName;EM_UPLOADED_AT=uploadedAt;EM_MODE=mode;
  for(const [id,index,label] of [['em-date',1,'dates'],['em-buyer',4,'buyers'],['em-team',5,'teams']]){
    const values=[...new Set(rows.map(row=>emCell(row,index)).filter(Boolean))]
      .sort(index===1?(a,b)=>emDateTime(b)-emDateTime(a):(a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const node=document.getElementById(id);
    if(node)node.innerHTML=`<option value="">All ${label}</option>`+
      values.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
  }
  const search=document.getElementById('em-search');if(search)search.value='';
  renderEmbellishmentModule();
}
function renderEmbellishmentModule(){
  const table=document.getElementById('em-table');if(!table)return;
  const date=document.getElementById('em-date')?.value||'';
  const buyer=document.getElementById('em-buyer')?.value||'';
  const team=document.getElementById('em-team')?.value||'';
  const search=(document.getElementById('em-search')?.value||'').trim().toLowerCase();
  EM_FILTERED=EM_ROWS.filter(row=>(!date||emCell(row,1)===date)&&
    (!buyer||emCell(row,4)===buyer)&&(!team||emCell(row,5)===team)&&
    (!search||[0,2,3,6].some(i=>emCell(row,i).toLowerCase().includes(search))));
  const total=EM_FILTERED.length;
  const cards=[['SOURCE ROWS',total,'Matching source records'],
    ['REPORT DATES',new Set(EM_FILTERED.map(row=>emCell(row,1))).size,'Distinct CSV dates'],
    ['EWO NUMBERS',new Set(EM_FILTERED.map(row=>emCell(row,2))).size,'Distinct EWO numbers'],
    ['BUYERS',new Set(EM_FILTERED.map(row=>emCell(row,4))).size,'Distinct buyers']];
  const kpis=document.getElementById('em-kpis');
  if(kpis)kpis.innerHTML=cards.map(([label,n,note])=>
    `<div class="kpi"><div class="kpi-lbl">${label}</div><div class="kpi-val">${emCount(n)}</div><div class="kpi-sub">${note}</div></div>`).join('');
  const pages=Math.max(1,Math.ceil(total/EM_PAGE_SIZE));EM_PAGE=Math.min(EM_PAGE,pages);
  const start=(EM_PAGE-1)*EM_PAGE_SIZE,shown=EM_FILTERED.slice(start,start+EM_PAGE_SIZE);
  const th=EM_HEADERS.map((header,i)=>`<th title="${esc(header)}">${esc(header.trim().replace(/\s+/g,' ')||'Unnamed column 21')}</th>`).join('');
  table.innerHTML=`<table class="em-table"><thead><tr>${th}</tr></thead><tbody>`+
    (shown.map(row=>`<tr>${EM_HEADERS.map((_,i)=>{
      const value=emCell(row,i);return `<td title="${esc(value)}">${esc(value|| (i===20?'—':''))}</td>`;
    }).join('')}</tr>`).join('')||'<tr><td colspan="21">No matching rows.</td></tr>')+'</tbody></table>';
  const pager=document.getElementById('em-pagination');
  if(pager)pager.innerHTML=`<span>${total?emCount(start+1):0}–${emCount(Math.min(start+EM_PAGE_SIZE,total))} of ${emCount(total)} matching rows</span>
    <button class="pg-btn" type="button" ${EM_PAGE<=1?'disabled':''} onclick="embellishmentPage(${EM_PAGE-1})">← Previous</button>
    <span>Page ${EM_PAGE} / ${pages}</span>
    <button class="pg-btn" type="button" ${EM_PAGE>=pages?'disabled':''} onclick="embellishmentPage(${EM_PAGE+1})">Next →</button>`;
  emMessage('em-msg',`${EM_MODE==='preview'?'LOCAL CSV PREVIEW':'SQL LIVE'} · ${emCount(total)} / ${emCount(EM_ROWS.length)} rows`);
  emMessage('em-source',`${EM_MODE==='preview'?'Local CSV':'SQL file'}: ${EM_FILE_NAME||'—'} · All 21 original CSV columns shown in source order. Date values are shown as supplied.`+
    (EM_UPLOADED_AT?' · Uploaded '+new Date(EM_UPLOADED_AT).toLocaleString():'') );
}
function embellishmentPage(n){EM_PAGE=n;renderEmbellishmentModule();document.getElementById('em-table')?.scrollTo({top:0,left:0});}
function embellishmentFiltersChanged(){EM_PAGE=1;renderEmbellishmentModule();}
function embellishmentSearchChanged(){clearTimeout(EM_SEARCH_TIMER);EM_SEARCH_TIMER=setTimeout(embellishmentFiltersChanged,150);}
function clearEmbellishmentFilters(){for(const id of ['em-date','em-buyer','em-team','em-search']){
  const node=document.getElementById(id);if(node)node.value='';
}embellishmentFiltersChanged();}

async function previewEmbellishmentFile(){
  const file=document.getElementById('em-file')?.files?.[0],token=++EM_FILE_TOKEN;
  EM_PREVIEW=null;if(!file){emMessage('em-upload-msg','Select a CSV.');return;}
  try{
    const rows=parseEmbellishmentCSV(await file.text());if(token!==EM_FILE_TOKEN)return;
    EM_PREVIEW={file,rows};embellishmentSetRows(rows,file.name,'','preview');
    emMessage('em-upload-msg',`✓ ${emCount(rows.length)} source rows / 21 columns previewed locally. Open slide 19 to inspect. SQL has not changed.`);
  }catch(error){if(token===EM_FILE_TOKEN)emMessage('em-upload-msg','CSV preview failed: '+(error?.message||error));}
}
async function loadEmbellishmentModule(force=false){
  if(EM_MODE==='preview'&&!force){renderEmbellishmentModule();return;}
  if(!force&&EM_ROWS.length&&EM_MODE==='sql'){renderEmbellishmentModule();return;}
  const token=++EM_LOAD_TOKEN,session=SITE_SESSION_GENERATION,userId=SITE_AUTH_USER?.id;
  if(!userId||!canAccessSlide(19))return;
  emMessage('em-msg','Loading Embellishment SQL snapshot…');
  try{
    const rows=[];
    for(let offset=0;;offset+=1000){
      const {data,error}=await SB.from('embellishment_send_receive_rows').select('*').eq('is_active',true)
        .order('source_row_no',{ascending:true}).range(offset,offset+999);
      if(error)throw error;
      if(token!==EM_LOAD_TOKEN||session!==SITE_SESSION_GENERATION||userId!==SITE_AUTH_USER?.id)return;
      rows.push(...(data||[]));if((data||[]).length<1000)break;
    }
    embellishmentSetRows(rows,rows[0]?.file_name||'',rows[0]?.uploaded_at||'','sql');
    if(!rows.length)emMessage('em-msg','No SQL snapshot yet. Upload the CSV in Upload / Data Control.');
  }catch(error){
    if(token!==EM_LOAD_TOKEN||session!==SITE_SESSION_GENERATION)return;
    emMessage('em-msg','SQL load failed');
    const tableError=document.getElementById('em-table');
    if(tableError)tableError.innerHTML=`<div class="modal-msg">${esc(error?.message||error)}</div>`;
  }
}
async function uploadEmbellishmentFile(){
  if(!siteHasPerm('embellishment_upload')){emMessage('em-upload-msg','Embellishment Upload permission required.');return;}
  const file=document.getElementById('em-file')?.files?.[0];
  if(!file){emMessage('em-upload-msg','Select Embellishment Send Receive.csv first.');return;}
  const button=document.getElementById('em-upload-btn');button.disabled=true;
  const session=SITE_SESSION_GENERATION,userId=SITE_AUTH_USER?.id;
  try{
    const preview=EM_PREVIEW?.file===file?EM_PREVIEW:{file,rows:parseEmbellishmentCSV(await file.text())};
    EM_PREVIEW=preview;const rows=preview.rows;
    const batchId=crypto.randomUUID();
    for(let offset=0;offset<rows.length;offset+=120){
      if(session!==SITE_SESSION_GENERATION||userId!==SITE_AUTH_USER?.id)throw Error('Session changed during upload.');
      const part=rows.slice(offset,offset+120).map(({source_row_no,...cells})=>({
        batch_id:batchId,source_row_no,file_name:file.name,...cells
      }));
      const {error}=await SB.from('embellishment_send_receive_rows').insert(part);
      if(error)throw Error(`Rows ${offset+1}–${Math.min(offset+part.length,rows.length)}: ${error.message}`);
      emMessage('em-upload-msg',`Staging… ${emCount(Math.min(offset+part.length,rows.length))} / ${emCount(rows.length)} rows`);
    }
    const {data,error}=await SB.rpc('finalize_embellishment_upload',{
      p_batch_id:batchId,p_expected_rows:rows.length,p_file_name:file.name
    });
    if(error)throw error;
    if(data?.status!=='SUCCESS'||Number(data?.uploaded_rows)!==rows.length)
      throw Error('SQL row-count audit failed; previous snapshot remains active.');
    emMessage('em-upload-msg',`✓ ${emCount(rows.length)} rows verified and activated. ${data.report_dates} report dates in the snapshot.`);
    await loadEmbellishmentModule(true);
    resetGanttHoverCache();
  }catch(error){emMessage('em-upload-msg','Upload not activated: '+(error?.message||error));}
  finally{button.disabled=false;}
}
function resetEmbellishmentModule(){
  ++EM_LOAD_TOKEN;++EM_FILE_TOKEN;clearTimeout(EM_SEARCH_TIMER);
  EM_ROWS=[];EM_FILTERED=[];EM_PAGE=1;EM_MODE='sql';EM_PREVIEW=null;EM_FILE_NAME='';EM_UPLOADED_AT='';
  const file=document.getElementById('em-file');if(file)file.value='';
  for(const id of ['em-kpis','em-table','em-pagination']){const el=document.getElementById(id);if(el)el.innerHTML='';}
  emMessage('em-msg','Waiting for sign in…');emMessage('em-source','');
  emMessage('em-upload-msg','Select an Embellishment CSV to preview.');
}
