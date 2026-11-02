/* DCS raw report: exact source headers/cells, atomic SQL uploads, bounded DOM. */
const DCS_HEADERS=Object.freeze(["Date", "Buyer", "Buyer Team", "EWO No", "Style No", "Company Name", "Color Name", "Order Qty", "Cutting Today ", "Cutting Total", "Sewing Today", "Sewing Total", "Finishing Receive Today", "Finishing Receive Total", "Iron Today", "Iron Total", "Hang Tag Today", "Hang Tag Total", "Folding Today", "Folding Total", "Poly Today", "Poly Total", "Carton day", "Carton Total", "Carton WIP Qty"]);
let DCS_ROWS=[],DCS_FILTERED=[],DCS_PAGE=1,DCS_REPORT=null,DCS_MODE='sql',DCS_PREVIEW=null,DCS_LOADED_AT=0,DCS_OWNER='',DCS_GENERATION=-1,DCS_TOKEN=0,DCS_FILE_TOKEN=0,DCS_LOAD=null,DCS_BUSY=false,DCS_SEARCH_TIMER=0,DCS_EXPORT_URL=null;
const dcsNode=id=>document.getElementById(id),dcsAdmin=()=>String(SITE_USER_PROFILE?.role||'').toLowerCase()==='admin';
function dcsMessage(text){const n=dcsNode('dcs-message');if(n)n.textContent=text;rfdScheduleFit('dcs');}
function parseDcsCSV(text){
 const rows=parseRecords(text,true,true),headers=rows.shift();
 if(!headers||headers.length!==25||headers.some((v,i)=>v!==DCS_HEADERS[i]))throw Error('Daily Production Status CSV must have the same 25 source headers in the same order.');
 if(!rows.length||rows.length>100000)throw Error('Daily Production Status CSV must contain 1–100,000 data rows.');
 rows.forEach((row,i)=>{if(row.length!==25)throw Error('CSV row '+(i+2)+': expected 25 cells; found '+row.length+'.');});
 return rows;
}
function verifyDcsRead(data){
 if(!data||!Array.isArray(data.headers)||data.headers.length!==25||data.headers.some((h,i)=>h!==DCS_HEADERS[i])||!Array.isArray(data.rows)||data.integrity?.complete!==true||data.integrity.row_count!==data.rows.length)throw Error('Daily Production Status SQL response is incomplete or its headers changed.');
 if(data.report&&(String(data.integrity.batch_id)!==String(data.report.id)||Number(data.report.expected_rows)!==data.rows.length||Number(data.report.received_rows)!==data.rows.length))throw Error('Daily Production Status report count/version verification failed.');
 if(!data.report&&data.rows.length)throw Error('Daily Production Status rows have no verified source report.');
 data.rows.forEach(row=>{if(!Array.isArray(row)||row.length!==25||row.some(v=>typeof v!=='string'))throw Error('Daily Production Status source cells changed type or column count.');});return data;
}
function clearDcsExport(){if(DCS_EXPORT_URL)URL.revokeObjectURL(DCS_EXPORT_URL);DCS_EXPORT_URL=null;const link=dcsNode('dcs-export');if(link){link.href='#';link.removeAttribute('download');}}
function setDcsRows(rows,report,mode){
 clearDcsExport();
 DCS_ROWS=rows;DCS_REPORT=report;DCS_MODE=mode;DCS_PAGE=1;DCS_OWNER=SITE_AUTH_USER?.id||'';DCS_GENERATION=SITE_SESSION_GENERATION;
 rfdResetTableTools('dcs');renderDcsModule();
}
function renderDcsModule(){
 const permitted=!!SITE_AUTH_USER&&canAccessSlide(22),upload=dcsNode('dcs-upload');if(upload){upload.hidden=!permitted||!dcsAdmin();if(permitted&&dcsAdmin()&&!DCS_REPORT)upload.open=true;}
 if(CURRENT_SLIDE!==22||RFD_ACTIVE_TAB!=='dcs')return;
 const table=dcsNode('dcs-table');if(!table)return;
 if(!permitted||DCS_OWNER!==SITE_AUTH_USER.id||DCS_GENERATION!==SITE_SESSION_GENERATION){table.replaceChildren();return;}
 DCS_FILTERED=rfdCascadeRows('dcs',DCS_ROWS);
 const pages=Math.max(1,Math.ceil(DCS_FILTERED.length/100));DCS_PAGE=Math.max(1,Math.min(DCS_PAGE,pages));const start=(DCS_PAGE-1)*100,part=DCS_FILTERED.slice(start,start+100);
 table.innerHTML='<colgroup>'+DCS_HEADERS.map(()=>'<col>').join('')+'</colgroup><thead><tr>'+DCS_HEADERS.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+(part.length?part.map(({row,i})=>'<tr data-source-row="'+(i+2)+'">'+row.map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="25" class="dcs-empty">'+(DCS_ROWS.length?'No matching records.':'No saved Daily Production Status report. Select a CSV to preview, then Upload & Save.')+'</td></tr>')+'</tbody>'+rfdTotalsFooter('dcs',DCS_HEADERS,DCS_FILTERED,!!DCS_REPORT);
 dcsNode('dcs-count').textContent=DCS_FILTERED.length.toLocaleString()+' / '+DCS_ROWS.length.toLocaleString()+' rows · 25 source columns';
 dcsNode('dcs-source').textContent=DCS_REPORT?(DCS_MODE==='preview'?'CSV PREVIEW · NOT SAVED':'MYSQL · SAVED REPORT')+' · '+DCS_REPORT.file_name+(DCS_REPORT.completed_at?' · Saved '+DCS_REPORT.completed_at+' UTC':''):'Daily Production Status source report';
 dcsNode('dcs-page-label').textContent='Page '+DCS_PAGE+' / '+pages+(part.length?' · Rows '+(start+1)+'–'+(start+part.length):'');
 for(const id of ['dcs-first','dcs-prev'])dcsNode(id).disabled=DCS_PAGE===1;
 for(const id of ['dcs-next','dcs-last'])dcsNode(id).disabled=DCS_PAGE>=pages;
 rfdFitTable('dcs',table,DCS_HEADERS,DCS_FILTERED);rfdScheduleFit('dcs');
}
function dcsPage(direction){const pages=Math.max(1,Math.ceil(DCS_FILTERED.length/100));DCS_PAGE=direction==='first'?1:direction==='last'?pages:DCS_PAGE+Number(direction);renderDcsModule();dcsNode('dcs-table').parentElement.scrollTop=0;}
function dcsFilter(){DCS_PAGE=1;renderDcsModule();}
function clearDcsFilters(){for(const id of ['dcs-search','dcs-buyer','dcs-place','dcs-color'])if(dcsNode(id))dcsNode(id).value='';dcsFilter();}
async function loadDcsModule(force=false){
 if(!SITE_AUTH_USER||!canAccessSlide(22))return;
 if(DCS_OWNER&&(DCS_OWNER!==SITE_AUTH_USER.id||DCS_GENERATION!==SITE_SESSION_GENERATION))resetDcsModule();
 if(DCS_BUSY)return;
 if(!force&&DCS_MODE==='preview'&&DCS_PREVIEW&&DCS_OWNER===SITE_AUTH_USER.id&&DCS_GENERATION===SITE_SESSION_GENERATION){renderDcsModule();return;}
 if(!force&&DCS_MODE==='sql'&&DCS_OWNER===SITE_AUTH_USER.id&&DCS_GENERATION===SITE_SESSION_GENERATION&&Date.now()-DCS_LOADED_AT<60000){renderDcsModule();return;}
 if(!force&&DCS_LOAD?.owner===SITE_AUTH_USER.id&&DCS_LOAD.generation===SITE_SESSION_GENERATION)return DCS_LOAD.promise;
 const token=++DCS_TOKEN,owner=SITE_AUTH_USER.id,generation=SITE_SESSION_GENERATION;
 const current=()=>token===DCS_TOKEN&&owner===SITE_AUTH_USER?.id&&generation===SITE_SESSION_GENERATION&&canAccessSlide(22);
 if(force){DCS_PREVIEW=null;if(dcsNode('dcs-file'))dcsNode('dcs-file').value='';}
 dcsMessage('Reading saved Daily Production Status report…');
 const entry={owner,generation,promise:null};DCS_LOAD=entry;
 const task=Promise.resolve().then(async()=>{try{
  const {data,error}=await SB.request('rfd/daily-cutting',{action:'read'});if(error)throw error;if(!current())return;
  verifyDcsRead(data);DCS_LOADED_AT=Date.now();setDcsRows(data.rows,data.report,'sql');dcsMessage(data.report?'All '+data.rows.length.toLocaleString()+' source rows verified. Original cell text and order retained.':'No Daily Production Status report saved yet. Admin can upload the CSV here.');
 }catch(error){if(!current())return;DCS_LOADED_AT=0;setDcsRows([],null,'sql');dcsMessage('Daily Production Status read failed: '+(error?.message||error));}finally{if(DCS_LOAD===entry)DCS_LOAD=null;}});entry.promise=task;return task;
}
async function previewDcsFile(){
 const file=dcsNode('dcs-file')?.files?.[0];if(!file||!SITE_AUTH_USER||!dcsAdmin()||DCS_BUSY)return;
 const token=++DCS_FILE_TOKEN,owner=SITE_AUTH_USER.id,generation=SITE_SESSION_GENERATION;DCS_PREVIEW=null;++DCS_TOKEN;
 const current=()=>token===DCS_FILE_TOKEN&&owner===SITE_AUTH_USER?.id&&generation===SITE_SESSION_GENERATION;
 try{
  if(file.size>16777216)throw Error('Daily Production Status CSV exceeds 16 MiB.');
  const buffer=await file.arrayBuffer(),text=new TextDecoder('utf-8',{fatal:true}).decode(buffer),rows=parseDcsCSV(text);
  if(!current())return;DCS_PREVIEW={file,rows,buffer};DCS_LOADED_AT=0;setDcsRows(rows,{file_name:file.name},'preview');dcsMessage('CSV preview: '+rows.length.toLocaleString()+' rows · not saved. Upload & Save stores all rows, including rows outside this page/filter.');
 }catch(error){if(current())dcsMessage('CSV preview failed: '+(error?.message||error));}
}
async function uploadDcsFile(){
 if(!SITE_AUTH_USER||!dcsAdmin()||DCS_BUSY)return;
 const file=dcsNode('dcs-file')?.files?.[0];if(!file){dcsMessage('Select a Daily Production Status CSV first.');return;}
 if(DCS_PREVIEW?.file!==file)await previewDcsFile();
 const preview=DCS_PREVIEW;if(!preview||preview.file!==file)return;
 const owner=SITE_AUTH_USER.id,generation=SITE_SESSION_GENERATION,token=DCS_FILE_TOKEN;
 const current=()=>owner===SITE_AUTH_USER?.id&&generation===SITE_SESSION_GENERATION&&token===DCS_FILE_TOKEN;
 DCS_BUSY=true;dcsNode('dcs-save').disabled=true;dcsNode('dcs-file').disabled=true;
 const request=async body=>{if(!current())throw Error('Session or selected file changed.');const result=await SB.request('rfd/daily-cutting',body);if(result.error)throw result.error;if(!current())throw Error('Session changed.');return result.data;};
 try{
  const digest=await crypto.subtle.digest('SHA-256',preview.buffer),hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
  const job=await request({action:'begin',file_name:file.name,headers:[...DCS_HEADERS],expected_rows:preview.rows.length,file_sha256:hash});
  let offset=0;
  while(offset<preview.rows.length){const part=[];let bytes=0;while(offset+part.length<preview.rows.length&&part.length<250){const row=preview.rows[offset+part.length],size=new TextEncoder().encode(JSON.stringify(row)).length;if(size>2000000)throw Error('A source row exceeds the safe upload size.');if(part.length&&bytes+size>2000000)break;part.push(row);bytes+=size;}
   const received=await request({action:'chunk',id:job.id,start_row:offset+2,rows:part});offset+=part.length;if(received.received_rows!==offset)throw Error('Daily Production Status received-row count did not match.');dcsMessage('Saving source rows… '+offset.toLocaleString()+' / '+preview.rows.length.toLocaleString());
  }
  const saved=await request({action:'finalize',id:job.id});if(saved.status!=='SUCCESS'||saved.rows!==preview.rows.length)throw Error('Daily Production Status activation audit did not match.');
  const read=verifyDcsRead(await request({action:'read'}));
  if(read.report?.id===job.id&&(read.rows.length!==preview.rows.length||read.rows.some((row,i)=>row.some((value,j)=>value!==preview.rows[i][j]))))throw Error('Saved Daily Production Status cells did not match the original CSV. Refresh before using this report.');
  DCS_PREVIEW=null;dcsNode('dcs-file').value='';DCS_LOADED_AT=Date.now();setDcsRows(read.rows,read.report,'sql');dcsMessage(read.report?.id===job.id?'Saved and verified: every source cell matches the CSV.':'Upload saved. A newer Daily Production Status report is now active.');dcsNode('dcs-upload').open=false;
 }catch(error){if(current())dcsMessage('Upload not verified: '+(error?.message||error)+'. Previous completed SQL report stays available; Refresh saved report to view it.');}
 finally{if(owner===SITE_AUTH_USER?.id&&generation===SITE_SESSION_GENERATION){DCS_BUSY=false;dcsNode('dcs-save').disabled=false;dcsNode('dcs-file').disabled=false;}}
}
function exportDcsCSV(event){
 if(!SITE_AUTH_USER||!canAccessSlide(22)||CURRENT_SLIDE!==22||DCS_OWNER!==SITE_AUTH_USER.id||DCS_GENERATION!==SITE_SESSION_GENERATION){event.preventDefault();return false;}
 clearTimeout(DCS_SEARCH_TIMER);dcsFilter();if(!DCS_FILTERED.length){event.preventDefault();return false;}
 const quote=v=>'"'+String(v).replace(/"/g,'""')+'"',csv=[DCS_HEADERS,...DCS_FILTERED.map(x=>x.row)].map(row=>row.map(quote).join(',')).join('\r\n');
 clearDcsExport();const link=event.currentTarget,url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));DCS_EXPORT_URL=url;link.href=url;link.download=(DCS_REPORT?.file_name||'Daily Production Status.csv').replace(/\.csv$/i,DCS_FILTERED.length<DCS_ROWS.length?'_filtered.csv':'.csv').replace(/[^\p{L}\p{N}_.-]+/gu,'_');setTimeout(()=>{URL.revokeObjectURL(url);if(DCS_EXPORT_URL===url)clearDcsExport();},30000);return true;
}
function resetDcsModule(){rfdResetTableTools('dcs');clearDcsExport();++DCS_TOKEN;++DCS_FILE_TOKEN;clearTimeout(DCS_SEARCH_TIMER);DCS_ROWS=[];DCS_FILTERED=[];DCS_PAGE=1;DCS_REPORT=null;DCS_PREVIEW=null;DCS_LOADED_AT=0;DCS_OWNER='';DCS_GENERATION=-1;DCS_LOAD=null;DCS_BUSY=false;const file=dcsNode('dcs-file');if(file){file.value='';file.disabled=false;}if(dcsNode('dcs-save'))dcsNode('dcs-save').disabled=false;for(const id of ['dcs-table','dcs-source','dcs-count','dcs-page-label'])dcsNode(id)?.replaceChildren();dcsMessage('Waiting for sign in…');if(dcsNode('dcs-upload'))dcsNode('dcs-upload').hidden=true;}
document.addEventListener('DOMContentLoaded',()=>{dcsNode('dcs-search')?.addEventListener('input',()=>{clearTimeout(DCS_SEARCH_TIMER);DCS_SEARCH_TIMER=setTimeout(dcsFilter,180);});});
