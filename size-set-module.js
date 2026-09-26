/* Size Set Module: source-preserving SS.csv preview and completed SQL snapshots. */
const SS_HEADERS=[
  'Common','Line','Buyer','EWO','Stroke','Product Type','Color','Print Y/N','EMB Y/N','Wash',
  'GMT Qty','EFD','PCD','PP comment Plan','PP comment Actual','SS Fabric Plan','SS Fabric Actual',
  'SS Pattern Plan','SS Pattern Actual','S/S Cut Date Plan','S/S Cut Date Actual',
  'EBM Send Plan','EBM Send Actual','Trims Plan','Trims Actual','SS Set Trims card Plan',
  'SS Set Trims Card Actual','EBM Rcv Plan','EBM Rcv Actual','S/S Input Plan','S/S Input Actual',
  'S/S Sew Finish Plan','S/S Sew Finish Actual','PP Meeting Plan','PP Meeting Actual',
  'Bulk Pattern Plan','Bulk Pattern Actual','Pattern Master Name','T & A Closed',
  'PCD Actual','PCD Pass/Fail','Next Action to Do\n(What)','When','Who','CTN Booking Plan',
  'Remarks','Season','Sales','Outsource'
];
const SS_PAGE_SIZE=100;
const SS_TNA_STEPS=[
  ['PP Comment','PP comment Plan','PP comment Actual'],
  ['SS Fabric','SS Fabric Plan','SS Fabric Actual'],
  ['SS Pattern','SS Pattern Plan','SS Pattern Actual'],
  ['S/S Cut Date','S/S Cut Date Plan','S/S Cut Date Actual'],
  ['EBM Send','EBM Send Plan','EBM Send Actual'],
  ['Trims','Trims Plan','Trims Actual'],
  ['SS Set Trims Card','SS Set Trims card Plan','SS Set Trims Card Actual'],
  ['EBM Receive','EBM Rcv Plan','EBM Rcv Actual'],
  ['S/S Input','S/S Input Plan','S/S Input Actual'],
  ['S/S Sew Finish','S/S Sew Finish Plan','S/S Sew Finish Actual'],
  ['PP Meeting','PP Meeting Plan','PP Meeting Actual'],
  ['Bulk Pattern','Bulk Pattern Plan','Bulk Pattern Actual']
];
let SS_ROWS=[];
let SS_FILTERED=[];
let SS_PAGE=1;
let SS_MODE='sql';
let SS_PREVIEW=null;
let SS_FILE_TOKEN=0;
let SS_LOAD_TOKEN=0;
let SS_SEARCH_TIMER=0;
let SS_FILE_NAME='';
let SS_UPLOADED_AT='';

const ssCount=n=>Number(n||0).toLocaleString('en-US');
const ssVal=(row,key)=>String(row?.row_data?.[key]??'');
function ssMessage(id,message){const el=document.getElementById(id);if(el)el.textContent=message;}
// The report has day/month text without a year. Count recorded dates, never infer lateness.
const ssHasDate=value=>/^(?:[1-9]|[12]\d|3[01])-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i.test(value.trim());
const ssPct=(n,total)=>total?`${(100*n/total).toFixed(1)}%`:'—';

function showSizeSetSub(which){
  for(const name of ['raw','tna']){
    const active=which===name;
    const tab=document.getElementById('ss-tab-'+name),view=document.getElementById('ss-'+name+'-view');
    if(tab){tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
    if(view)view.hidden=!active;
  }
}

function renderSizeSetTNA(valid){
  const stats=SS_TNA_STEPS.map(([label,planKey,actualKey])=>{
    let planned=0,actual=0,both=0;
    for(const row of valid){
      const p=ssHasDate(ssVal(row,planKey)),a=ssHasDate(ssVal(row,actualKey));
      if(p)planned++;
      if(a)actual++;
      if(p&&a)both++;
    }
    return {label,planned,actual,both,missing:planned-both,actualOnly:actual-both};
  });
  const planned=stats.reduce((n,s)=>n+s.planned,0),both=stats.reduce((n,s)=>n+s.both,0);
  const closed=valid.filter(row=>ssVal(row,'T & A Closed').trim().toLowerCase()==='closed').length;
  const cards=[['ORDER ROWS',ssCount(valid.length),'With Buyer · current filters'],
    ['TNA CLOSED',ssCount(closed),`${ssPct(closed,valid.length)} of order rows`],
    ['ACTUAL COVERAGE',ssPct(both,planned),`${ssCount(both)} / ${ssCount(planned)} planned milestones`],
    ['MISSING ACTUAL',ssCount(planned-both),'Planned milestones without recorded actual']];
  const kpis=document.getElementById('ss-tna-kpis');
  if(kpis)kpis.innerHTML=cards.map(([name,value,sub])=>
    `<div class="kpi"><div class="kpi-lbl">${name}</div><div class="kpi-val">${value}</div><div class="kpi-sub">${sub}</div></div>`).join('');
  ssMessage('ss-tna-note','12 TNA milestones from SS.csv · date recorded = D-Mon text; empty / N/A excluded. Coverage = rows with both plan and actual ÷ rows with plan, summed across milestones. “Actual only” has a recorded actual without a plan. Dates have no year, so no late or on-time result is inferred. All counts respect the filters above.');
  const table=document.getElementById('ss-tna-table');
  if(table)table.innerHTML=`<table class="ss-tna-table"><thead><tr><th>Milestone</th><th>Planned date</th><th>Plan + actual</th><th>Missing actual</th><th>Actual only</th><th>Coverage</th></tr></thead><tbody>${stats.map(s=>
    `<tr><td>${esc(s.label)}</td><td>${ssCount(s.planned)}</td><td>${ssCount(s.both)}</td><td>${ssCount(s.missing)}</td><td>${ssCount(s.actualOnly)}</td><td><span class="ss-progress"><span style="width:${s.planned?Math.min(100,100*s.both/s.planned):0}%"></span></span>${ssPct(s.both,s.planned)}</td></tr>`).join('')}</tbody></table>`;
}

function parseSizeSetCSV(text){
  const records=parseRecords(text,true);
  if(!records.length)throw Error('CSV is empty.');
  const headers=records.shift().map(x=>String(x??'').replace(/^\uFEFF/,'').trim());
  if(headers.length===50 && headers[49]===''){
    if(records.some(row=>row[49]?.trim()))throw Error('Trailing unnamed column contains data.');
    headers.pop();
  }
  if(headers.length!==SS_HEADERS.length || headers.some((h,i)=>h!==SS_HEADERS[i])){
    const missing=SS_HEADERS.filter(h=>!headers.includes(h));
    throw Error(missing.length?'Missing Size Set columns: '+missing.join(', '):
      'SS.csv columns or order differ from the 49-column template.');
  }
  if(!records.length)throw Error('CSV has no data rows.');
  return records.map((cells,i)=>{
    if(cells.length===50 && cells[49]==='')cells=cells.slice(0,49);
    if(cells.length!==49)throw Error(`Record ${i+2}: expected 49 source columns; found ${cells.length}.`);
    return {source_row_no:i+2,row_data:Object.fromEntries(SS_HEADERS.map((h,j)=>[h,cells[j]]))};
  });
}

async function previewSizeSetFile(){
  const file=document.getElementById('ss-file')?.files?.[0];
  const token=++SS_FILE_TOKEN;
  SS_PREVIEW=null;
  if(!file){ssMessage('ss-upload-msg','No CSV selected.');return;}
  ssMessage('ss-upload-msg','Reading and checking SS.csv…');
  try{
    const rows=parseSizeSetCSV(await file.text());
    if(token!==SS_FILE_TOKEN)return;
    SS_PREVIEW={file,rows};
    SS_ROWS=rows;SS_MODE='preview';SS_PAGE=1;SS_FILE_NAME=file.name;SS_UPLOADED_AT='';
    populateSizeSetFilters();renderSizeSetModule();
    ssMessage('ss-upload-msg',`✓ Local preview: ${ssCount(rows.length)} source rows, 49 columns. Nothing has been uploaded to SQL.`);
  }catch(error){if(token===SS_FILE_TOKEN)ssMessage('ss-upload-msg','CSV preview failed: '+(error?.message||error));}
}

function populateSizeSetFilters(){
  const columns=[['ss-line','Line','All Lines'],['ss-buyer','Buyer','All Buyers'],
    ['ss-product','Product Type','All Products'],['ss-action','Next Action to Do\n(What)','All Actions']];
  for(const [id,key,label] of columns){
    const select=document.getElementById(id);if(!select)continue;
    const options=[...new Set(SS_ROWS.map(row=>ssVal(row,key).trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    select.innerHTML=`<option value="">${esc(label)}</option>`+
      options.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
  }
  const search=document.getElementById('ss-search');if(search)search.value='';
}

function renderSizeSetModule(){
  const table=document.getElementById('ss-table');if(!table)return;
  const values=Object.fromEntries(['line','buyer','product','action'].map(name=>
    [name,document.getElementById('ss-'+name)?.value||'']));
  const search=(document.getElementById('ss-search')?.value||'').trim().toLowerCase();
  SS_FILTERED=SS_ROWS.filter(row=>
    (!values.line||ssVal(row,'Line')===values.line) &&
    (!values.buyer||ssVal(row,'Buyer')===values.buyer) &&
    (!values.product||ssVal(row,'Product Type')===values.product) &&
    (!values.action||ssVal(row,'Next Action to Do\n(What)')===values.action) &&
    (!search||['EWO','Common','Color'].some(key=>ssVal(row,key).toLowerCase().includes(search)))
  );
  const valid=SS_FILTERED.filter(row=>ssVal(row,'Buyer').trim());
  const qty=valid.reduce((total,row)=>{
    const value=ssVal(row,'GMT Qty').replace(/,/g,'').trim();
    return total+(/^\d+(?:\.\d+)?$/.test(value)?Number(value):0);
  },0);
  const open=valid.filter(row=>{
    const action=ssVal(row,'Next Action to Do\n(What)').trim();
    return action && action.toLowerCase()!=='closed';
  }).length;
  const kpis=[['SOURCE ROWS',SS_ROWS.length,'Complete CSV snapshot'],
    ['ROWS WITH BUYER',valid.length,'Current filters'],['GMT QTY',qty,'Current filters · PCS'],
    ['OPEN ACTIONS',open,'Nonblank, excluding Closed']];
  document.getElementById('ss-kpis').innerHTML=kpis.map(([name,n,sub])=>
    `<div class="kpi"><div class="kpi-lbl">${name}</div><div class="kpi-val">${ssCount(n)}</div><div class="kpi-sub">${sub}</div></div>`).join('');
  renderSizeSetTNA(valid);
  const pages=Math.max(1,Math.ceil(SS_FILTERED.length/SS_PAGE_SIZE));
  SS_PAGE=Math.min(SS_PAGE,pages);
  const start=(SS_PAGE-1)*SS_PAGE_SIZE;
  const shown=SS_FILTERED.slice(start,start+SS_PAGE_SIZE);
  table.innerHTML=`<table class="dt ss-table"><thead><tr><th>CSV Row</th>${SS_HEADERS.map(h=>
    `<th title="${esc(h)}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${shown.map(row=>
    `<tr><td>${ssCount(row.source_row_no)}</td>${SS_HEADERS.map(h=>{
      const value=ssVal(row,h);return `<td title="${esc(value)}">${esc(value)}</td>`;
    }).join('')}</tr>`).join('')||'<tr><td colspan="50">No matching rows.</td></tr>'}</tbody></table>`;
  document.getElementById('ss-pagination').innerHTML=`<span>${SS_FILTERED.length?ssCount(start+1):0}–${ssCount(Math.min(start+SS_PAGE_SIZE,SS_FILTERED.length))} of ${ssCount(SS_FILTERED.length)} matching rows</span>
    <button class="pg-btn" type="button" ${SS_PAGE<=1?'disabled':''} onclick="sizeSetPage(${SS_PAGE-1})">← Previous</button>
    <span>Page ${SS_PAGE} / ${pages}</span>
    <button class="pg-btn" type="button" ${SS_PAGE>=pages?'disabled':''} onclick="sizeSetPage(${SS_PAGE+1})">Next →</button>`;
  ssMessage('ss-msg',`${SS_MODE==='preview'?'LOCAL CSV PREVIEW':'SQL LIVE'} · ${ssCount(SS_FILTERED.length)} filtered / ${ssCount(SS_ROWS.length)} source rows`);
  ssMessage('ss-source',(SS_MODE==='preview'?'Local file':'Latest SQL file')+': '+SS_FILE_NAME+
    (SS_UPLOADED_AT?' · '+new Date(SS_UPLOADED_AT).toLocaleString():'')+
    ' · All 49 named columns shown · date text has no inferred year');
}

function sizeSetPage(page){SS_PAGE=page;renderSizeSetModule();document.getElementById('ss-table')?.scrollTo({top:0,left:0});}
function sizeSetSearchChanged(){clearTimeout(SS_SEARCH_TIMER);SS_SEARCH_TIMER=setTimeout(()=>{SS_PAGE=1;renderSizeSetModule()},160);}
function clearSizeSetFilters(){
  for(const id of ['ss-line','ss-buyer','ss-product','ss-action','ss-search']){
    const el=document.getElementById(id);if(el)el.value='';
  }
  SS_PAGE=1;renderSizeSetModule();
}

async function loadSizeSetModule(force=false){
  const upload=document.getElementById('ss-upload-card');if(upload)upload.style.display=siteIsAdmin()?'':'none';
  if(SS_MODE==='preview'&&!force){renderSizeSetModule();return;}
  if(!force&&SS_ROWS.length&&SS_MODE==='sql'){renderSizeSetModule();return;}
  const token=++SS_LOAD_TOKEN,session=SITE_SESSION_GENERATION,userId=SITE_AUTH_USER?.id;
  if(!userId||!canAccessSlide(17))return;
  ssMessage('ss-msg','Loading latest Size Set SQL snapshot…');
  try{
    const all=[];
    for(let offset=0;;offset+=1000){
      const {data,error}=await SB.from('size_set_rows')
        .select('source_row_no,row_data,file_name,uploaded_at').eq('is_active',true)
        .order('source_row_no',{ascending:true}).range(offset,offset+999);
      if(error)throw error;
      if(token!==SS_LOAD_TOKEN||session!==SITE_SESSION_GENERATION||userId!==SITE_AUTH_USER?.id)return;
      all.push(...(data||[]));
      if((data||[]).length<1000)break;
    }
    SS_ROWS=all;SS_MODE='sql';SS_PAGE=1;SS_FILE_NAME=all[0]?.file_name||'';SS_UPLOADED_AT=all[0]?.uploaded_at||'';
    populateSizeSetFilters();
    if(!all.length){
      document.getElementById('ss-kpis').innerHTML='';
      document.getElementById('ss-tna-kpis').innerHTML='';
      document.getElementById('ss-tna-table').innerHTML='<div class="modal-msg">No completed Size Set SQL snapshot yet.</div>';
      document.getElementById('ss-table').innerHTML='<div class="modal-msg">No completed Size Set SQL snapshot yet. Admin can preview and upload SS.csv above.</div>';
      document.getElementById('ss-pagination').innerHTML='';
      ssMessage('ss-msg','No SQL snapshot yet');ssMessage('ss-source','');
      return;
    }
    renderSizeSetModule();
  }catch(error){
    if(token!==SS_LOAD_TOKEN||session!==SITE_SESSION_GENERATION)return;
    ssMessage('ss-msg','SQL load failed');
    document.getElementById('ss-table').innerHTML=`<div class="modal-msg">${esc(error?.message||error)}. The SQL table must be installed before uploading. Local CSV preview is available above.</div>`;
    document.getElementById('ss-tna-table').innerHTML='<div class="modal-msg">TNA KPI will appear when the Size Set SQL snapshot is available.</div>';
  }
}

async function uploadSizeSetFile(){
  if(!siteIsAdmin()){ssMessage('ss-upload-msg','Admin access required for SQL upload.');return;}
  const file=document.getElementById('ss-file')?.files?.[0];
  if(!file){ssMessage('ss-upload-msg','Select SS.csv first.');return;}
  const button=document.getElementById('ss-upload-btn');button.disabled=true;
  const session=SITE_SESSION_GENERATION,userId=SITE_AUTH_USER?.id;
  try{
    let preview=SS_PREVIEW;
    if(!preview||preview.file!==file){
      const rows=parseSizeSetCSV(await file.text());preview={file,rows};SS_PREVIEW=preview;
    }
    const rows=preview.rows;
    if(!rows.length)throw Error('No source rows.');
    // Fail before staging if the migration has not yet installed the table.
    const {error:tableError}=await SB.from('size_set_rows').select('source_row_no').limit(1);
    if(tableError)throw tableError;
    const batchId=crypto.randomUUID();
    for(let offset=0;offset<rows.length;offset+=150){
      if(session!==SITE_SESSION_GENERATION||userId!==SITE_AUTH_USER?.id)throw Error('Session changed during upload.');
      const part=rows.slice(offset,offset+150).map(row=>({
        batch_id:batchId,source_row_no:row.source_row_no,file_name:file.name,row_data:row.row_data
      }));
      const {error}=await SB.from('size_set_rows').insert(part);
      if(error)throw Error(`Rows ${offset+1}–${Math.min(offset+part.length,rows.length)}: ${error.message}`);
      ssMessage('ss-upload-msg',`Staging SS.csv… ${ssCount(Math.min(offset+part.length,rows.length))} / ${ssCount(rows.length)} rows`);
    }
    const {data,error}=await SB.rpc('finalize_size_set_upload',{
      p_batch_id:batchId,p_expected_rows:rows.length,p_file_name:file.name
    });
    if(error)throw error;
    if(data?.status!=='SUCCESS'||Number(data?.uploaded_rows)!==rows.length)throw Error('SQL row-count audit failed. Previous snapshot remains active.');
    ssMessage('ss-upload-msg',`✓ ${ssCount(rows.length)} / ${ssCount(data.uploaded_rows)} source rows verified in SQL. Snapshot activated.`);
    await loadSizeSetModule(true);
  }catch(error){ssMessage('ss-upload-msg','Upload not activated: '+(error?.message||error));}
  finally{button.disabled=false;}
}

function resetSizeSetModule(){
  ++SS_LOAD_TOKEN;++SS_FILE_TOKEN;clearTimeout(SS_SEARCH_TIMER);
  SS_ROWS=[];SS_FILTERED=[];SS_PAGE=1;SS_MODE='sql';SS_PREVIEW=null;SS_FILE_NAME='';SS_UPLOADED_AT='';
  const file=document.getElementById('ss-file');if(file)file.value='';
  ssMessage('ss-upload-msg','No CSV selected.');
  ssMessage('ss-source','');ssMessage('ss-msg','Waiting for sign in…');
  showSizeSetSub('raw');
  for(const id of ['ss-kpis','ss-table','ss-pagination','ss-tna-kpis','ss-tna-table','ss-tna-note']){const el=document.getElementById(id);if(el)el.innerHTML='';}
}
