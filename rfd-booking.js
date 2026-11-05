/* BOOKING raw report: exact source headers/cells, atomic SQL uploads, bounded DOM. */
const BOOKING_HEADERS=Object.freeze(["EWO No", "Booking No", "Buyer", "Buyer Team", "Supplier", "Construction", "Composition", "Color/Length", "GSM/Height", "Width", "UOM", "Booking Qty.", "Reason for\n Additional \nBooking"]);
let BOOKING_ROWS=[],BOOKING_FILTERED=[],BOOKING_PAGE=1,BOOKING_REPORT=null,BOOKING_MODE='sql',BOOKING_PREVIEW=null,BOOKING_LOADED_AT=0,BOOKING_OWNER='',BOOKING_GENERATION=-1,BOOKING_TOKEN=0,BOOKING_FILE_TOKEN=0,BOOKING_LOAD=null,BOOKING_BUSY=false,BOOKING_SEARCH_TIMER=0,BOOKING_EXPORT_URL=null;
const bookingNode=id=>document.getElementById(id),bookingAdmin=()=>String(SITE_USER_PROFILE?.role||'').toLowerCase()==='admin';
function bookingMessage(text){const n=bookingNode('booking-message');if(n)n.textContent=text;rfdScheduleFit('booking');}
function parseBookingCSV(text){
 const rows=parseRecords(text,true,true),headers=rows.shift();
 if(!headers||headers.length!==13||headers.some((v,i)=>v!==BOOKING_HEADERS[i]))throw Error('Booking CSV must have the same 13 source headers in the same order.');
 if(!rows.length||rows.length>100000)throw Error('Booking CSV must contain 1–100,000 data rows.');
 rows.forEach((row,i)=>{if(row.length!==13)throw Error('CSV row '+(i+2)+': expected 13 cells; found '+row.length+'.');});
 return rows;
}
function verifyBookingRead(data){
 if(!data||!Array.isArray(data.headers)||data.headers.length!==13||data.headers.some((h,i)=>h!==BOOKING_HEADERS[i])||!Array.isArray(data.rows)||data.integrity?.complete!==true||data.integrity.row_count!==data.rows.length)throw Error('Booking SQL response is incomplete or its headers changed.');
 if(data.report&&(String(data.integrity.batch_id)!==String(data.report.id)||Number(data.report.expected_rows)!==data.rows.length||Number(data.report.received_rows)!==data.rows.length))throw Error('Booking report count/version verification failed.');
 if(!data.report&&data.rows.length)throw Error('Booking rows have no verified source report.');
 data.rows.forEach(row=>{if(!Array.isArray(row)||row.length!==13||row.some(v=>typeof v!=='string'))throw Error('Booking source cells changed type or column count.');});return data;
}
function clearBookingExport(){if(BOOKING_EXPORT_URL)URL.revokeObjectURL(BOOKING_EXPORT_URL);BOOKING_EXPORT_URL=null;const link=bookingNode('booking-export');if(link){link.href='#';link.removeAttribute('download');}}
function setBookingRows(rows,report,mode){
 clearBookingExport();
 BOOKING_ROWS=rows;BOOKING_REPORT=report;BOOKING_MODE=mode;BOOKING_PAGE=1;BOOKING_OWNER=SITE_AUTH_USER?.id||'';BOOKING_GENERATION=SITE_SESSION_GENERATION;
 rfdResetTableTools('booking');renderBookingModule();
}
function renderBookingModule(){
 const permitted=!!SITE_AUTH_USER&&canAccessSlide(22),upload=bookingNode('booking-upload');if(upload){upload.hidden=!permitted||!bookingAdmin();if(permitted&&bookingAdmin()&&!BOOKING_REPORT)upload.open=true;}
 if(CURRENT_SLIDE!==22||RFD_ACTIVE_TAB!=='booking')return;
 rfdHideEwoTooltip();
 const table=bookingNode('booking-table');if(!table)return;
 if(!permitted||BOOKING_OWNER!==SITE_AUTH_USER.id||BOOKING_GENERATION!==SITE_SESSION_GENERATION){table.replaceChildren();return;}
 BOOKING_FILTERED=rfdCascadeRows('booking',BOOKING_ROWS);
 const pages=Math.max(1,Math.ceil(BOOKING_FILTERED.length/100));BOOKING_PAGE=Math.max(1,Math.min(BOOKING_PAGE,pages));const start=(BOOKING_PAGE-1)*100,part=BOOKING_FILTERED.slice(start,start+100);
 table.innerHTML='<colgroup>'+BOOKING_HEADERS.map(()=>'<col>').join('')+'</colgroup><thead><tr>'+BOOKING_HEADERS.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+(part.length?part.map(({row,i})=>'<tr data-source-row="'+(i+2)+'">'+row.map((value,j)=>'<td>'+(j===0?rfdEwoCell(value):j===1?rfdEwoCell(value,true,'Original Booking No'):esc(value))+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="13" class="booking-empty">'+(BOOKING_ROWS.length?'No matching records.':'No saved Booking report. Select a CSV to preview, then Upload & Save.')+'</td></tr>')+'</tbody>'+rfdTotalsFooter('booking',BOOKING_HEADERS,BOOKING_FILTERED,!!BOOKING_REPORT);
 bookingNode('booking-count').textContent=BOOKING_FILTERED.length.toLocaleString()+' / '+rfdPlanRowCount('booking').toLocaleString()+' selected-plan rows · 13 source columns';
 bookingNode('booking-source').textContent=BOOKING_REPORT?(BOOKING_MODE==='preview'?'CSV PREVIEW · NOT SAVED':'MYSQL · SAVED REPORT')+' · '+BOOKING_REPORT.file_name+(BOOKING_REPORT.completed_at?' · Saved '+BOOKING_REPORT.completed_at+' UTC':''):'Booking source report';
 bookingNode('booking-page-label').textContent='Page '+BOOKING_PAGE+' / '+pages+(part.length?' · Rows '+(start+1)+'–'+(start+part.length):'');
 for(const id of ['booking-first','booking-prev'])bookingNode(id).disabled=BOOKING_PAGE===1;
 for(const id of ['booking-next','booking-last'])bookingNode(id).disabled=BOOKING_PAGE>=pages;
 rfdFitTable('booking',table,BOOKING_HEADERS,BOOKING_FILTERED);rfdScheduleFit('booking');
}
function bookingPage(direction){const pages=Math.max(1,Math.ceil(BOOKING_FILTERED.length/100));BOOKING_PAGE=direction==='first'?1:direction==='last'?pages:BOOKING_PAGE+Number(direction);renderBookingModule();bookingNode('booking-table').parentElement.scrollTop=0;}
function bookingFilter(){BOOKING_PAGE=1;renderBookingModule();}
function clearBookingFilters(){for(const id of ['booking-search','booking-buyer','booking-place','booking-color'])if(bookingNode(id))bookingNode(id).value='';bookingFilter();}
async function loadBookingModule(force=false){
 if(!SITE_AUTH_USER||!canAccessSlide(22))return;
 if(BOOKING_OWNER&&(BOOKING_OWNER!==SITE_AUTH_USER.id||BOOKING_GENERATION!==SITE_SESSION_GENERATION))resetBookingModule();
 if(BOOKING_BUSY)return;
 if(!force&&BOOKING_MODE==='preview'&&BOOKING_PREVIEW&&BOOKING_OWNER===SITE_AUTH_USER.id&&BOOKING_GENERATION===SITE_SESSION_GENERATION){renderBookingModule();return;}
 if(!force&&BOOKING_MODE==='sql'&&BOOKING_OWNER===SITE_AUTH_USER.id&&BOOKING_GENERATION===SITE_SESSION_GENERATION&&Date.now()-BOOKING_LOADED_AT<60000){renderBookingModule();return;}
 if(!force&&BOOKING_LOAD?.owner===SITE_AUTH_USER.id&&BOOKING_LOAD.generation===SITE_SESSION_GENERATION)return BOOKING_LOAD.promise;
 const token=++BOOKING_TOKEN,owner=SITE_AUTH_USER.id,generation=SITE_SESSION_GENERATION;
 const current=()=>token===BOOKING_TOKEN&&owner===SITE_AUTH_USER?.id&&generation===SITE_SESSION_GENERATION&&canAccessSlide(22);
 if(force){BOOKING_PREVIEW=null;if(bookingNode('booking-file'))bookingNode('booking-file').value='';}
 bookingMessage('Reading saved Booking report…');
 const entry={owner,generation,promise:null};BOOKING_LOAD=entry;
 const task=Promise.resolve().then(async()=>{try{
  const {data,error}=await SB.request('rfd/booking',{action:'read'});if(error)throw error;if(!current())return;
  verifyBookingRead(data);BOOKING_LOADED_AT=Date.now();setBookingRows(data.rows,data.report,'sql');bookingMessage(data.report?'All '+data.rows.length.toLocaleString()+' source rows verified. Original cell text and order retained.':'No Booking report saved yet. Admin can upload the CSV here.');
 }catch(error){if(!current())return;BOOKING_LOADED_AT=0;setBookingRows([],null,'sql');bookingMessage('Booking read failed: '+(error?.message||error));}finally{if(BOOKING_LOAD===entry)BOOKING_LOAD=null;}});entry.promise=task;return task;
}
async function previewBookingFile(){
 const file=bookingNode('booking-file')?.files?.[0];if(!file||!SITE_AUTH_USER||!bookingAdmin()||BOOKING_BUSY)return;
 const token=++BOOKING_FILE_TOKEN,owner=SITE_AUTH_USER.id,generation=SITE_SESSION_GENERATION;BOOKING_PREVIEW=null;++BOOKING_TOKEN;
 const current=()=>token===BOOKING_FILE_TOKEN&&owner===SITE_AUTH_USER?.id&&generation===SITE_SESSION_GENERATION;
 try{
  if(file.size>16777216)throw Error('Booking CSV exceeds 16 MiB.');
  const buffer=await file.arrayBuffer(),text=new TextDecoder('utf-8',{fatal:true}).decode(buffer),rows=parseBookingCSV(text);
  if(!current())return;BOOKING_PREVIEW={file,rows,buffer};BOOKING_LOADED_AT=0;setBookingRows(rows,{file_name:file.name},'preview');bookingMessage('CSV preview: '+rows.length.toLocaleString()+' source rows · not saved. Upload & Save stores all rows, including rows outside this page/filter.');
 }catch(error){if(current())bookingMessage('CSV preview failed: '+(error?.message||error));}
}
async function uploadBookingFile(){
 if(!SITE_AUTH_USER||!bookingAdmin()||BOOKING_BUSY)return;
 const file=bookingNode('booking-file')?.files?.[0];if(!file){bookingMessage('Select an Booking CSV first.');return;}
 if(BOOKING_PREVIEW?.file!==file)await previewBookingFile();
 const preview=BOOKING_PREVIEW;if(!preview||preview.file!==file)return;
 const owner=SITE_AUTH_USER.id,generation=SITE_SESSION_GENERATION,token=BOOKING_FILE_TOKEN;
 const current=()=>owner===SITE_AUTH_USER?.id&&generation===SITE_SESSION_GENERATION&&token===BOOKING_FILE_TOKEN;
 BOOKING_BUSY=true;bookingNode('booking-save').disabled=true;bookingNode('booking-file').disabled=true;
 const request=async body=>{if(!current())throw Error('Session or selected file changed.');const result=await SB.request('rfd/booking',body);if(result.error)throw result.error;if(!current())throw Error('Session changed.');return result.data;};
 try{
  const digest=await crypto.subtle.digest('SHA-256',preview.buffer),hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
  const job=await request({action:'begin',file_name:file.name,headers:[...BOOKING_HEADERS],expected_rows:preview.rows.length,file_sha256:hash});
  let offset=0;
  while(offset<preview.rows.length){const part=[];let bytes=0;while(offset+part.length<preview.rows.length&&part.length<250){const row=preview.rows[offset+part.length],size=new TextEncoder().encode(JSON.stringify(row)).length;if(size>2000000)throw Error('A source row exceeds the safe upload size.');if(part.length&&bytes+size>2000000)break;part.push(row);bytes+=size;}
   const received=await request({action:'chunk',id:job.id,start_row:offset+2,rows:part});offset+=part.length;if(received.received_rows!==offset)throw Error('Booking received-row count did not match.');bookingMessage('Saving source rows… '+offset.toLocaleString()+' / '+preview.rows.length.toLocaleString());
  }
  const saved=await request({action:'finalize',id:job.id});if(saved.status!=='SUCCESS'||saved.rows!==preview.rows.length)throw Error('Booking activation audit did not match.');
  const read=verifyBookingRead(await request({action:'read'}));
  if(read.report?.id===job.id&&(read.rows.length!==preview.rows.length||read.rows.some((row,i)=>row.some((value,j)=>value!==preview.rows[i][j]))))throw Error('Saved Booking cells did not match the original CSV. Refresh before using this report.');
  BOOKING_PREVIEW=null;bookingNode('booking-file').value='';BOOKING_LOADED_AT=Date.now();setBookingRows(read.rows,read.report,'sql');bookingMessage(read.report?.id===job.id?'Saved and verified: every source cell matches the CSV.':'Upload saved. A newer Booking report is now active.');bookingNode('booking-upload').open=false;
 }catch(error){if(current())bookingMessage('Upload not verified: '+(error?.message||error)+'. Previous completed SQL report stays available; Refresh saved report to view it.');}
 finally{if(owner===SITE_AUTH_USER?.id&&generation===SITE_SESSION_GENERATION){BOOKING_BUSY=false;bookingNode('booking-save').disabled=false;bookingNode('booking-file').disabled=false;}}
}
function exportBookingCSV(event){if(typeof rfdPlanExportAllowed!=='function'||!rfdPlanExportAllowed()){event.preventDefault();return false;}
 if(!SITE_AUTH_USER||!canAccessSlide(22)||CURRENT_SLIDE!==22||BOOKING_OWNER!==SITE_AUTH_USER.id||BOOKING_GENERATION!==SITE_SESSION_GENERATION){event.preventDefault();return false;}
 clearTimeout(BOOKING_SEARCH_TIMER);bookingFilter();if(!BOOKING_FILTERED.length){event.preventDefault();return false;}
 const quote=v=>'"'+String(v).replace(/"/g,'""')+'"',csv=[BOOKING_HEADERS,...BOOKING_FILTERED.map(x=>x.row)].map(row=>row.map(quote).join(',')).join('\r\n');
 clearBookingExport();const link=event.currentTarget,url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));BOOKING_EXPORT_URL=url;link.href=url;link.download=(BOOKING_REPORT?.file_name||'Booking.csv').replace(/\.csv$/i,BOOKING_FILTERED.length<BOOKING_ROWS.length?'_filtered.csv':'.csv').replace(/[^\p{L}\p{N}_.-]+/gu,'_');setTimeout(()=>{URL.revokeObjectURL(url);if(BOOKING_EXPORT_URL===url)clearBookingExport();},30000);return true;
}
function resetBookingModule(){rfdResetTableTools('booking');clearBookingExport();++BOOKING_TOKEN;++BOOKING_FILE_TOKEN;clearTimeout(BOOKING_SEARCH_TIMER);BOOKING_ROWS=[];BOOKING_FILTERED=[];BOOKING_PAGE=1;BOOKING_REPORT=null;BOOKING_PREVIEW=null;BOOKING_LOADED_AT=0;BOOKING_OWNER='';BOOKING_GENERATION=-1;BOOKING_LOAD=null;BOOKING_BUSY=false;const file=bookingNode('booking-file');if(file){file.value='';file.disabled=false;}if(bookingNode('booking-save'))bookingNode('booking-save').disabled=false;for(const id of ['booking-table','booking-source','booking-count','booking-page-label'])bookingNode(id)?.replaceChildren();bookingMessage('Waiting for sign in…');if(bookingNode('booking-upload'))bookingNode('booking-upload').hidden=true;}
document.addEventListener('DOMContentLoaded',()=>{bookingNode('booking-search')?.addEventListener('input',()=>{clearTimeout(BOOKING_SEARCH_TIMER);BOOKING_SEARCH_TIMER=setTimeout(bookingFilter,180);});});
