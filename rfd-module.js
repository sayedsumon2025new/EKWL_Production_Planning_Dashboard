const RFD_TABS=['rfd','booking','dcs','fdr','converter'];
let RFD_ACTIVE_TAB='rfd';
function selectRfdTab(tab){
 if(!RFD_TABS.includes(tab)||!SITE_AUTH_USER||!canAccessSlide(22))return;
 rfdHideEwoTooltip();
 const refresh=document.getElementById('rfd-refresh');if(refresh)refresh.hidden=tab==='converter';
 RFD_ACTIVE_TAB=tab;for(const name of RFD_TABS){document.getElementById(name+'-panel').hidden=name!==tab;document.getElementById(name+'-tab').setAttribute('aria-selected',String(name===tab));}
 const subtitle=document.querySelector('#s22 .slide-subtitle');if(subtitle)subtitle.textContent=tab==='converter'?'Data Converter':tab==='fdr'?'Original fabrics details report · all 31 source columns':tab==='dcs'?'Original daily production report · all 25 source columns':tab==='booking'?'Original fabric booking report · all 13 source columns':'Original RFD report · all 22 source columns';
 if(tab==='converter')return loadRfdConverter();
 return tab==='fdr'?loadFdrModule():tab==='dcs'?loadDcsModule():tab==='booking'?loadBookingModule():loadRfdModule();
}
/* RFD raw report: exact source headers/cells, atomic SQL uploads, bounded DOM. */
const RFD_HEADERS=Object.freeze(['Receive & Delivery Date','Receive & Delivery Place','EWO No','Batch No','Re-Finish ID','Tag Number','Color','Fabric Details','Fabric Construction','Fabric Composition','Buyer Name','Vehicle Number','DC No','Re Delivery','Net Delivery Qty Kg.','Net Delivery Qty Pcs','Net Delivery Qty Yds','Total Roll','Lock No','Delivery From','Mushak Challan No','Body Fabrics']);
let RFD_ROWS=[],RFD_FILTERED=[],RFD_PAGE=1,RFD_REPORT=null,RFD_MODE='sql',RFD_PREVIEW=null,RFD_LOADED_AT=0,RFD_OWNER='',RFD_GENERATION=-1,RFD_TOKEN=0,RFD_FILE_TOKEN=0,RFD_LOAD=null,RFD_BUSY=false,RFD_SEARCH_TIMER=0,RFD_EXPORT_URL=null;
const rfdNode=id=>document.getElementById(id),rfdAdmin=()=>String(SITE_USER_PROFILE?.role||'').toLowerCase()==='admin';
function rfdMessage(text){const n=rfdNode('rfd-message');if(n)n.textContent=text;rfdScheduleFit('rfd');}
function parseRfdCSV(text){
 const rows=parseRecords(text,true,true),headers=rows.shift();
 if(!headers||headers.length!==22||headers.some((v,i)=>v!==RFD_HEADERS[i]))throw Error('RFD CSV must have the same 22 source headers in the same order.');
 if(!rows.length||rows.length>100000)throw Error('RFD CSV must contain 1–100,000 data rows.');
 rows.forEach((row,i)=>{if(row.length!==22)throw Error('CSV row '+(i+2)+': expected 22 cells; found '+row.length+'.');});
 return rows;
}
function verifyRfdRead(data){
 if(!data||!Array.isArray(data.headers)||data.headers.length!==22||data.headers.some((h,i)=>h!==RFD_HEADERS[i])||!Array.isArray(data.rows)||data.integrity?.complete!==true||data.integrity.row_count!==data.rows.length)throw Error('RFD SQL response is incomplete or its headers changed.');
 if(data.report&&(String(data.integrity.batch_id)!==String(data.report.id)||Number(data.report.expected_rows)!==data.rows.length||Number(data.report.received_rows)!==data.rows.length))throw Error('RFD report count/version verification failed.');
 if(!data.report&&data.rows.length)throw Error('RFD rows have no verified source report.');
 data.rows.forEach(row=>{if(!Array.isArray(row)||row.length!==22||row.some(v=>typeof v!=='string'))throw Error('RFD source cells changed type or column count.');});return data;
}
function clearRfdExport(){if(RFD_EXPORT_URL)URL.revokeObjectURL(RFD_EXPORT_URL);RFD_EXPORT_URL=null;const link=rfdNode('rfd-export');if(link){link.href='#';link.removeAttribute('download');}}
function setRfdRows(rows,report,mode){
 clearRfdExport();
 RFD_ROWS=rows;RFD_REPORT=report;RFD_MODE=mode;RFD_PAGE=1;RFD_OWNER=SITE_AUTH_USER?.id||'';RFD_GENERATION=SITE_SESSION_GENERATION;
 rfdResetTableTools('rfd');renderRfdModule();
}
function renderRfdModule(){
 const permitted=!!SITE_AUTH_USER&&canAccessSlide(22),upload=rfdNode('rfd-upload');if(upload){upload.hidden=!permitted||!rfdAdmin();if(permitted&&rfdAdmin()&&!RFD_REPORT)upload.open=true;}
 if(CURRENT_SLIDE!==22)return;
 rfdHideEwoTooltip();
 const table=rfdNode('rfd-table');if(!table)return;
 if(!permitted||RFD_OWNER!==SITE_AUTH_USER.id||RFD_GENERATION!==SITE_SESSION_GENERATION){table.replaceChildren();return;}
 RFD_FILTERED=rfdCascadeRows('rfd',RFD_ROWS);
 const pages=Math.max(1,Math.ceil(RFD_FILTERED.length/100));RFD_PAGE=Math.max(1,Math.min(RFD_PAGE,pages));const start=(RFD_PAGE-1)*100,part=RFD_FILTERED.slice(start,start+100);
 table.innerHTML='<colgroup>'+RFD_HEADERS.map(()=>'<col>').join('')+'</colgroup><thead><tr>'+RFD_HEADERS.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+(part.length?part.map(({row,i})=>'<tr data-source-row="'+(i+2)+'">'+row.map((value,j)=>'<td>'+(j===2?rfdEwoCell(value):esc(value))+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="22" class="rfd-empty">'+(RFD_ROWS.length?'No matching records.':'No saved RFD report. Select a CSV to preview, then Upload & Save.')+'</td></tr>')+'</tbody>'+rfdTotalsFooter('rfd',RFD_HEADERS,RFD_FILTERED,!!RFD_REPORT);
 rfdNode('rfd-count').textContent=RFD_FILTERED.length.toLocaleString()+' / '+rfdPlanRowCount('rfd').toLocaleString()+' scope rows · 22 source columns';
 rfdNode('rfd-source').textContent=RFD_REPORT?(RFD_MODE==='preview'?'CSV PREVIEW · NOT SAVED':'MYSQL · SAVED REPORT')+' · '+RFD_REPORT.file_name+(RFD_REPORT.completed_at?' · Saved '+RFD_REPORT.completed_at+' UTC':''):'RFD source report';
 rfdNode('rfd-page-label').textContent='Page '+RFD_PAGE+' / '+pages+(part.length?' · Rows '+(start+1)+'–'+(start+part.length):'');
 for(const id of ['rfd-first','rfd-prev'])rfdNode(id).disabled=RFD_PAGE===1;
 for(const id of ['rfd-next','rfd-last'])rfdNode(id).disabled=RFD_PAGE>=pages;
 rfdFitTable('rfd',table,RFD_HEADERS,RFD_FILTERED);rfdScheduleFit('rfd');
}
function rfdPage(direction){const pages=Math.max(1,Math.ceil(RFD_FILTERED.length/100));RFD_PAGE=direction==='first'?1:direction==='last'?pages:RFD_PAGE+Number(direction);renderRfdModule();rfdNode('rfd-table').parentElement.scrollTop=0;}
function rfdFilter(){RFD_PAGE=1;renderRfdModule();}
function clearRfdFilters(){for(const id of ['rfd-search','rfd-buyer','rfd-place','rfd-color'])if(rfdNode(id))rfdNode(id).value='';rfdFilter();}
async function loadRfdModule(force=false){
 if(RFD_ACTIVE_TAB==='converter')return loadRfdConverter(force);
 if(RFD_ACTIVE_TAB==='fdr')return loadFdrModule(force);
 if(RFD_ACTIVE_TAB==='dcs')return loadDcsModule(force);
 if(RFD_ACTIVE_TAB==='booking')return loadBookingModule(force);
 if(!SITE_AUTH_USER||!canAccessSlide(22))return;
 if(RFD_OWNER&&(RFD_OWNER!==SITE_AUTH_USER.id||RFD_GENERATION!==SITE_SESSION_GENERATION))resetRfdModule();
 if(RFD_BUSY)return;
 if(!force&&RFD_MODE==='preview'&&RFD_PREVIEW&&RFD_OWNER===SITE_AUTH_USER.id&&RFD_GENERATION===SITE_SESSION_GENERATION){renderRfdModule();return;}
 if(!force&&RFD_MODE==='sql'&&RFD_OWNER===SITE_AUTH_USER.id&&RFD_GENERATION===SITE_SESSION_GENERATION&&Date.now()-RFD_LOADED_AT<60000){renderRfdModule();return;}
 if(!force&&RFD_LOAD?.owner===SITE_AUTH_USER.id&&RFD_LOAD.generation===SITE_SESSION_GENERATION)return RFD_LOAD.promise;
 const token=++RFD_TOKEN,owner=SITE_AUTH_USER.id,generation=SITE_SESSION_GENERATION;
 const current=()=>token===RFD_TOKEN&&owner===SITE_AUTH_USER?.id&&generation===SITE_SESSION_GENERATION&&canAccessSlide(22);
 if(force){RFD_PREVIEW=null;if(rfdNode('rfd-file'))rfdNode('rfd-file').value='';}
 rfdMessage('Reading saved RFD report…');
 const entry={owner,generation,promise:null};RFD_LOAD=entry;
 const task=Promise.resolve().then(async()=>{try{
  const {data,error}=await SB.request('rfd',{action:'read'});if(error)throw error;if(!current())return;
  verifyRfdRead(data);RFD_LOADED_AT=Date.now();setRfdRows(data.rows,data.report,'sql');rfdMessage(data.report?'All '+data.rows.length.toLocaleString()+' source rows verified. Original cell text and order retained.':'No RFD report saved yet. Admin can upload the CSV here.');
 }catch(error){if(!current())return;RFD_LOADED_AT=0;setRfdRows([],null,'sql');rfdMessage('RFD read failed: '+(error?.message||error));}finally{if(RFD_LOAD===entry)RFD_LOAD=null;}});entry.promise=task;return task;
}
async function previewRfdFile(){
 const file=rfdNode('rfd-file')?.files?.[0];if(!file||!SITE_AUTH_USER||!rfdAdmin()||RFD_BUSY)return;
 const token=++RFD_FILE_TOKEN,owner=SITE_AUTH_USER.id,generation=SITE_SESSION_GENERATION;RFD_PREVIEW=null;++RFD_TOKEN;
 const current=()=>token===RFD_FILE_TOKEN&&owner===SITE_AUTH_USER?.id&&generation===SITE_SESSION_GENERATION;
 try{
  if(file.size>16777216)throw Error('RFD CSV exceeds 16 MiB.');
  const buffer=await file.arrayBuffer(),text=new TextDecoder('utf-8',{fatal:true}).decode(buffer),rows=parseRfdCSV(text);
  if(!current())return;RFD_PREVIEW={file,rows,buffer};RFD_LOADED_AT=0;setRfdRows(rows,{file_name:file.name},'preview');rfdMessage('CSV preview: '+rows.length.toLocaleString()+' source rows · not saved. Upload & Save stores all rows, including rows outside this page/filter.');
 }catch(error){if(current())rfdMessage('CSV preview failed: '+(error?.message||error));}
}
async function uploadRfdFile(){
 if(!SITE_AUTH_USER||!rfdAdmin()||RFD_BUSY)return;
 const file=rfdNode('rfd-file')?.files?.[0];if(!file){rfdMessage('Select an RFD CSV first.');return;}
 if(RFD_PREVIEW?.file!==file)await previewRfdFile();
 const preview=RFD_PREVIEW;if(!preview||preview.file!==file)return;
 const owner=SITE_AUTH_USER.id,generation=SITE_SESSION_GENERATION,token=RFD_FILE_TOKEN;
 const current=()=>owner===SITE_AUTH_USER?.id&&generation===SITE_SESSION_GENERATION&&token===RFD_FILE_TOKEN;
 RFD_BUSY=true;rfdNode('rfd-save').disabled=true;rfdNode('rfd-file').disabled=true;
 const request=async body=>{if(!current())throw Error('Session or selected file changed.');const result=await SB.request('rfd',body);if(result.error)throw result.error;if(!current())throw Error('Session changed.');return result.data;};
 try{
  const digest=await crypto.subtle.digest('SHA-256',preview.buffer),hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
  const job=await request({action:'begin',file_name:file.name,headers:[...RFD_HEADERS],expected_rows:preview.rows.length,file_sha256:hash});
  let offset=0;
  while(offset<preview.rows.length){const part=[];let bytes=0;while(offset+part.length<preview.rows.length&&part.length<250){const row=preview.rows[offset+part.length],size=new TextEncoder().encode(JSON.stringify(row)).length;if(size>2000000)throw Error('A source row exceeds the safe upload size.');if(part.length&&bytes+size>2000000)break;part.push(row);bytes+=size;}
   const received=await request({action:'chunk',id:job.id,start_row:offset+2,rows:part});offset+=part.length;if(received.received_rows!==offset)throw Error('RFD received-row count did not match.');rfdMessage('Saving source rows… '+offset.toLocaleString()+' / '+preview.rows.length.toLocaleString());
  }
  const saved=await request({action:'finalize',id:job.id});if(saved.status!=='SUCCESS'||saved.rows!==preview.rows.length)throw Error('RFD activation audit did not match.');
  const read=verifyRfdRead(await request({action:'read'}));
  if(read.report?.id===job.id&&(read.rows.length!==preview.rows.length||read.rows.some((row,i)=>row.some((value,j)=>value!==preview.rows[i][j]))))throw Error('Saved RFD cells did not match the original CSV. Refresh before using this report.');
  RFD_PREVIEW=null;rfdNode('rfd-file').value='';RFD_LOADED_AT=Date.now();setRfdRows(read.rows,read.report,'sql');rfdMessage(read.report?.id===job.id?'Saved and verified: every source cell matches the CSV.':'Upload saved. A newer RFD report is now active.');rfdNode('rfd-upload').open=false;
 }catch(error){if(current())rfdMessage('Upload not verified: '+(error?.message||error)+'. Previous completed SQL report stays available; Refresh saved report to view it.');}
 finally{if(owner===SITE_AUTH_USER?.id&&generation===SITE_SESSION_GENERATION){RFD_BUSY=false;rfdNode('rfd-save').disabled=false;rfdNode('rfd-file').disabled=false;}}
}
function exportRfdCSV(event){if(typeof rfdPlanExportAllowed!=='function'||!rfdPlanExportAllowed()){event.preventDefault();return false;}
 if(!SITE_AUTH_USER||!canAccessSlide(22)||CURRENT_SLIDE!==22||RFD_OWNER!==SITE_AUTH_USER.id||RFD_GENERATION!==SITE_SESSION_GENERATION){event.preventDefault();return false;}
 clearTimeout(RFD_SEARCH_TIMER);rfdFilter();if(!RFD_FILTERED.length){event.preventDefault();return false;}
 const quote=v=>'"'+String(v).replace(/"/g,'""')+'"',csv=[RFD_HEADERS,...RFD_FILTERED.map(x=>x.row)].map(row=>row.map(quote).join(',')).join('\r\n');
 clearRfdExport();const link=event.currentTarget,url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));RFD_EXPORT_URL=url;link.href=url;link.download=(RFD_REPORT?.file_name||'RFD.csv').replace(/\.csv$/i,RFD_FILTERED.length<RFD_ROWS.length?'_filtered.csv':'.csv').replace(/[^\p{L}\p{N}_.-]+/gu,'_');setTimeout(()=>{URL.revokeObjectURL(url);if(RFD_EXPORT_URL===url)clearRfdExport();},30000);return true;
}
function resetRfdModule(){if(typeof resetRfdPlanScope==='function')resetRfdPlanScope();resetRfdConverter();rfdResetTableTools('rfd');resetFdrModule();resetDcsModule();resetBookingModule();RFD_ACTIVE_TAB='rfd';if(rfdNode('rfd-refresh'))rfdNode('rfd-refresh').hidden=false;for(const name of RFD_TABS){if(rfdNode(name+'-panel'))rfdNode(name+'-panel').hidden=name!=='rfd';rfdNode(name+'-tab')?.setAttribute('aria-selected',String(name==='rfd'));}clearRfdExport();++RFD_TOKEN;++RFD_FILE_TOKEN;clearTimeout(RFD_SEARCH_TIMER);RFD_ROWS=[];RFD_FILTERED=[];RFD_PAGE=1;RFD_REPORT=null;RFD_PREVIEW=null;RFD_LOADED_AT=0;RFD_OWNER='';RFD_GENERATION=-1;RFD_LOAD=null;RFD_BUSY=false;const file=rfdNode('rfd-file');if(file){file.value='';file.disabled=false;}if(rfdNode('rfd-save'))rfdNode('rfd-save').disabled=false;for(const id of ['rfd-table','rfd-source','rfd-count','rfd-page-label'])rfdNode(id)?.replaceChildren();rfdMessage('Waiting for sign in…');if(rfdNode('rfd-upload'))rfdNode('rfd-upload').hidden=true;}
document.addEventListener('DOMContentLoaded',()=>{rfdNode('rfd-search')?.addEventListener('input',()=>{clearTimeout(RFD_SEARCH_TIMER);RFD_SEARCH_TIMER=setTimeout(rfdFilter,180);});});
