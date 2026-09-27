/* Accessories: PSD is the source Report Date; each upload is a complete snapshot. */
const AC_HEADERS=[
  'SI','Buyer/Team','EWO','Line No','PSD','PCD','Sewing Trims Pending Stts',
  'Finishing Trims Pending stts','Carton Receiving Stts','Inventory Status',
  'Inspection Status','Trims Card status','Final Status','Relavant Concern ',
  'Relevant M&M Name'
];
const AC_PAGE_SIZE=50;
let AC_ROWS=[],AC_FILTERED=[],AC_PAGE=1,AC_MODE='sql';
let AC_PREVIEW=null,AC_FILE_TOKEN=0,AC_LOAD_TOKEN=0,AC_SEARCH_TIMER=0;
let AC_FILE_NAME='',AC_UPLOADED_AT='';

const acVal=(row,key)=>String(row?.row_data?.[key]??'').trim();
const acCount=n=>Number(n||0).toLocaleString('en-US');
function acMessage(id,message){const node=document.getElementById(id);if(node)node.textContent=message;}

function parseAccessoriesCSV(text){
  const records=parseRecords(text,true);
  if(!records.length)throw Error('CSV is empty.');
  // The existing CSV reader trims cell whitespace, including the last space
  // in this one source header. Restore that header's exact source spelling.
  const headers=records.shift().map((value,i)=>i===13&&value==='Relavant Concern'?'Relavant Concern ':value);
  if(headers.length!==AC_HEADERS.length || headers.some((value,i)=>value!==AC_HEADERS[i]))
    throw Error('CSV must contain the same 15 source columns in the same order, including the final space in "Relavant Concern ".');
  if(!records.length)throw Error('CSV has no data rows.');
  if(records.length>100000)throw Error('CSV exceeds 100,000 rows.');
  return records.map((cells,i)=>{
    if(cells.length!==AC_HEADERS.length)throw Error(`CSV row ${i+2}: expected 15 cells; found ${cells.length}.`);
    if(!cells.some(Boolean))throw Error(`CSV row ${i+2} is empty.`);
    if(!cells[4].trim())throw Error(`CSV row ${i+2}: PSD is required for Report Date.`);
    return {source_row_no:i+2,row_data:Object.fromEntries(AC_HEADERS.map((key,j)=>[key,cells[j]]))};
  });
}

function accessoriesSetRows(rows,fileName,uploadedAt='',mode='sql'){
  AC_ROWS=rows;AC_PAGE=1;AC_FILE_NAME=fileName;
  AC_UPLOADED_AT=uploadedAt;AC_MODE=mode;
  populateAccessoriesFilters();renderAccessoriesModule();
}

function populateAccessoriesFilters(){
  const dateSelect=document.getElementById('ac-date');
  if(dateSelect){
    const values=[...new Set(AC_ROWS.map(row=>acVal(row,'PSD')).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    dateSelect.innerHTML='<option value="">All PSD dates</option>'+
      values.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
  }
  for(const [id,key,label] of [
    ['ac-buyer','Buyer/Team','All buyers'],['ac-line','Line No','All lines'],
    ['ac-sewing','Sewing Trims Pending Stts','All sewing statuses'],
    ['ac-status','Final Status','All statuses'],['ac-owner','Relevant M&M Name','All names']
  ]){
    const node=document.getElementById(id);if(!node)continue;
    const values=[...new Set(AC_ROWS.map(row=>acVal(row,key)).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    node.innerHTML=`<option value="">${esc(label)}</option>`+
      values.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
  }
  const search=document.getElementById('ac-search');if(search)search.value='';
}

function renderAccessoriesModule(){
  const table=document.getElementById('ac-table');if(!table)return;
  const buyer=document.getElementById('ac-buyer')?.value||'';
  const line=document.getElementById('ac-line')?.value||'';
  const reportDate=document.getElementById('ac-date')?.value||'';
  const sewingFilter=document.getElementById('ac-sewing')?.value||'';
  const status=document.getElementById('ac-status')?.value||'';
  const owner=document.getElementById('ac-owner')?.value||'';
  const search=(document.getElementById('ac-search')?.value||'').trim().toLowerCase();
  AC_FILTERED=AC_ROWS.filter(row=>
    (!buyer||acVal(row,'Buyer/Team')===buyer) &&
    (!line||acVal(row,'Line No')===line) &&
    (!reportDate||acVal(row,'PSD')===reportDate) &&
    (!sewingFilter||acVal(row,'Sewing Trims Pending Stts')===sewingFilter) &&
    (!status||acVal(row,'Final Status')===status) &&
    (!owner||acVal(row,'Relevant M&M Name')===owner) &&
    (!search||['EWO','Sewing Trims Pending Stts','Finishing Trims Pending stts']
      .some(key=>acVal(row,key).toLowerCase().includes(search)))
  );
  const total=AC_FILTERED.length;
  const buyers=new Set(AC_FILTERED.map(row=>acVal(row,'Buyer/Team')).filter(Boolean)).size;
  const sewing=AC_FILTERED.filter(row=>acVal(row,'Sewing Trims Pending Stts').toLowerCase()!=='ok').length;
  const finishing=AC_FILTERED.filter(row=>acVal(row,'Finishing Trims Pending stts').toLowerCase()!=='ok').length;
  const cards=[['SOURCE ROWS',total,'Current filters'],['BUYERS / TEAMS',buyers,'Distinct reported names'],
    ['SEWING NOT MARKED OK',sewing,'Literal CSV status'],['FINISHING NOT MARKED OK',finishing,'Literal CSV status']];
  const kpi=document.getElementById('ac-kpis');
  if(kpi)kpi.innerHTML=cards.map(([label,n,detail])=>
    `<div class="kpi"><div class="kpi-lbl">${label}</div><div class="kpi-val">${acCount(n)}</div><div class="kpi-sub">${detail}</div></div>`).join('');
  const pages=Math.max(1,Math.ceil(total/AC_PAGE_SIZE));AC_PAGE=Math.min(AC_PAGE,pages);
  const start=(AC_PAGE-1)*AC_PAGE_SIZE;
  const shown=AC_FILTERED.slice(start,start+AC_PAGE_SIZE);
  const mark=(key,value)=>key==='Final Status'||key==='Sewing Trims Pending Stts'||key==='Finishing Trims Pending stts'
    ?(value.trim().toLowerCase()==='ok'?'ac-ok':'ac-attention'):'';
  table.innerHTML=`<table class="dt ac-table"><thead><tr><th>CSV row</th>${AC_HEADERS.map(h=>
    `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${shown.map(row=>
    `<tr><td>${acCount(row.source_row_no)}</td>${AC_HEADERS.map(key=>{
      const value=acVal(row,key);return `<td class="${mark(key,value)}" title="${esc(value)}">${esc(value)}</td>`;
    }).join('')}</tr>`).join('')||'<tr><td colspan="16">No matching rows.</td></tr>'}</tbody></table>`;
  const pager=document.getElementById('ac-pagination');
  if(pager)pager.innerHTML=`<span>${total?acCount(start+1):0}–${acCount(Math.min(start+AC_PAGE_SIZE,total))} of ${acCount(total)} matching rows</span>
    <button class="pg-btn" type="button" ${AC_PAGE<=1?'disabled':''} onclick="accessoriesPage(${AC_PAGE-1})">← Previous</button>
    <span>Page ${AC_PAGE} / ${pages}</span>
    <button class="pg-btn" type="button" ${AC_PAGE>=pages?'disabled':''} onclick="accessoriesPage(${AC_PAGE+1})">Next →</button>`;
  acMessage('ac-msg',`${AC_MODE==='preview'?'LOCAL CSV PREVIEW':'SQL LIVE'} · ${acCount(total)} / ${acCount(AC_ROWS.length)} rows`);
  acMessage('ac-source',`Report Date = PSD${reportDate?': '+reportDate:''} · ${AC_MODE==='preview'?'Local file':'SQL file'}: ${AC_FILE_NAME||'—'}`+
    (AC_UPLOADED_AT?' · uploaded '+new Date(AC_UPLOADED_AT).toLocaleString():'')+
    ' · All 15 CSV columns shown. PSD / PCD text is displayed as supplied; a missing year is not inferred.');
}
function accessoriesPage(page){AC_PAGE=page;renderAccessoriesModule();document.getElementById('ac-table')?.scrollTo({top:0,left:0});}
function accessoriesSearchChanged(){clearTimeout(AC_SEARCH_TIMER);AC_SEARCH_TIMER=setTimeout(()=>{AC_PAGE=1;renderAccessoriesModule()},160);}
function clearAccessoriesFilters(){
  for(const id of ['ac-date','ac-buyer','ac-line','ac-sewing','ac-status','ac-owner','ac-search']){
    const node=document.getElementById(id);if(node)node.value='';
  }
  AC_PAGE=1;renderAccessoriesModule();
}

async function previewAccessoriesFile(){
  const file=document.getElementById('ac-file')?.files?.[0];const token=++AC_FILE_TOKEN;
  AC_PREVIEW=null;
  if(!file){acMessage('ac-upload-msg','Select a CSV.');return;}
  try{
    const rows=parseAccessoriesCSV(await file.text());if(token!==AC_FILE_TOKEN)return;
    AC_PREVIEW={file,rows};
    accessoriesSetRows(rows,file.name,'','preview');
    acMessage('ac-upload-msg',`✓ Local preview: ${acCount(rows.length)} source rows, 15 columns. SQL data has not changed. Open slide 18 to inspect.`);
  }catch(error){if(token===AC_FILE_TOKEN)acMessage('ac-upload-msg','CSV preview failed: '+(error?.message||error));}
}

async function loadAccessoriesModule(force=false){
  if(AC_MODE==='preview'&&!force){renderAccessoriesModule();return;}
  if(!force&&AC_ROWS.length&&AC_MODE==='sql'){renderAccessoriesModule();return;}
  const token=++AC_LOAD_TOKEN,session=SITE_SESSION_GENERATION,userId=SITE_AUTH_USER?.id;
  if(!userId||!canAccessSlide(18))return;
  acMessage('ac-msg','Loading Accessories SQL snapshots…');
  try{
    const rows=[];
    for(let offset=0;;offset+=1000){
      const {data,error}=await SB.from('accessories_rows')
        .select('source_row_no,row_data,file_name,uploaded_at').eq('is_active',true)
        .order('source_row_no',{ascending:true}).range(offset,offset+999);
      if(error)throw error;
      if(token!==AC_LOAD_TOKEN||session!==SITE_SESSION_GENERATION||userId!==SITE_AUTH_USER?.id)return;
      rows.push(...(data||[]));if((data||[]).length<1000)break;
    }
    accessoriesSetRows(rows,rows[0]?.file_name||'',rows[0]?.uploaded_at||'','sql');
    if(!rows.length)acMessage('ac-msg','No SQL snapshot yet');
  }catch(error){
    if(token!==AC_LOAD_TOKEN||session!==SITE_SESSION_GENERATION)return;
    acMessage('ac-msg','SQL load failed');
    acMessage('ac-source','SQL table and functions must be installed before live data can load.');
    const table=document.getElementById('ac-table');if(table)table.innerHTML=`<div class="modal-msg">${esc(error?.message||error)}</div>`;
  }
}

async function uploadAccessoriesFile(){
  if(!siteIsAdmin()){acMessage('ac-upload-msg','Admin access required.');return;}
  const file=document.getElementById('ac-file')?.files?.[0];
  if(!file){acMessage('ac-upload-msg','Select EKWLHW-Accessories.csv first.');return;}
  const button=document.getElementById('ac-upload-btn');button.disabled=true;
  const session=SITE_SESSION_GENERATION,userId=SITE_AUTH_USER?.id;
  try{
    const preview=AC_PREVIEW?.file===file?AC_PREVIEW:{file,rows:parseAccessoriesCSV(await file.text())};
    AC_PREVIEW=preview;const rows=preview.rows;
    const {error:tableError}=await SB.from('accessories_rows').select('source_row_no').limit(1);
    if(tableError)throw tableError;
    const batchId=crypto.randomUUID();
    for(let offset=0;offset<rows.length;offset+=150){
      if(session!==SITE_SESSION_GENERATION||userId!==SITE_AUTH_USER?.id)throw Error('Session changed during upload.');
      const part=rows.slice(offset,offset+150).map(row=>({
        batch_id:batchId,report_date:row.row_data.PSD.trim(),source_row_no:row.source_row_no,
        file_name:file.name,row_data:row.row_data
      }));
      const {error}=await SB.from('accessories_rows').insert(part);
      if(error)throw Error(`Rows ${offset+1}–${Math.min(offset+part.length,rows.length)}: ${error.message}`);
      acMessage('ac-upload-msg',`Staging PSD report dates… ${acCount(Math.min(offset+part.length,rows.length))} / ${acCount(rows.length)} rows`);
    }
    const {data,error}=await SB.rpc('finalize_accessories_upload',{
      p_batch_id:batchId,p_expected_rows:rows.length,p_file_name:file.name
    });
    if(error)throw error;
    if(data?.status!=='SUCCESS'||Number(data?.uploaded_rows)!==rows.length)throw Error('SQL row-count audit did not match. Previous snapshot remains active.');
    acMessage('ac-upload-msg',`✓ ${acCount(rows.length)} rows verified and activated. Report Date comes from each row's PSD.`);
    await loadAccessoriesModule(true);
  }catch(error){acMessage('ac-upload-msg','Upload not activated: '+(error?.message||error));}
  finally{button.disabled=false;}
}

function resetAccessoriesModule(){
  ++AC_LOAD_TOKEN;++AC_FILE_TOKEN;clearTimeout(AC_SEARCH_TIMER);
  AC_ROWS=[];AC_FILTERED=[];AC_PAGE=1;AC_MODE='sql';AC_PREVIEW=null;
  AC_FILE_NAME='';AC_UPLOADED_AT='';
  const file=document.getElementById('ac-file');if(file)file.value='';
  for(const id of ['ac-kpis','ac-table','ac-pagination']){const node=document.getElementById(id);if(node)node.innerHTML='';}
  acMessage('ac-msg','Waiting for sign in…');acMessage('ac-source','');
  acMessage('ac-upload-msg','Select an Accessories CSV to preview.');
}

// Local demonstration helper; never writes data to the database.
function setAccessoriesDemoRows(rows,date,fileName){
  accessoriesSetRows(rows,fileName,'','preview');
}
