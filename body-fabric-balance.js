/* Live Body-only balance table; all facts come from one verified read-only snapshot. */
const BB_HEADERS=['EWO No','Buyer','Color','Body Fabric','Booking No','Fabric Booking\nKG','Order Qty\nPCS','Body Consumption\nKG / PCS','Net Received\nKG','Total Cutting\nPCS','Fabric Used\nKG','Fabric Balance\nKG','Remaining Cuttable\nPCS','Gap / Surplus\nKG'];
let BB_STATE={active:false,data:null,filtered:[],page:1,owner:'',generation:-1,token:0,promise:null,loaded:0,url:null,timer:0};
RFD_TABLE_VIEWS.bb={filters:[['bb-buyer',1,'All buyers'],['bb-color',2,'All colors']],rules:{5:{unit:'KG'},6:{unit:'PCS',unique:'pair'},8:{unit:'KG'},9:{unit:'PCS',unique:'pair'},10:{unit:'KG'},11:{unit:'KG'}},excluded:{7:'Consumption is not additive.',12:'Cuttable pieces belong to separate EWO/Color/fabric stock; not pooled.',13:'Surplus of one color cannot cover another color shortage.'}};
RFD_EWO_COLUMNS.bb=0;
const bbNode=id=>document.getElementById(id);
function bbClearExport(){if(BB_STATE.url)URL.revokeObjectURL(BB_STATE.url);BB_STATE.url=null;const link=bbNode('bb-export');if(link){link.href='#';link.removeAttribute('download');}}
function verifyBodyBalance(data){
 if(data?.model!=='body-fabric-balance-v1'||!Array.isArray(data.headers)||data.headers.length!==14||data.headers.some((h,i)=>h!==BB_HEADERS[i])||!Array.isArray(data.rows)||!Array.isArray(data.evidence)||data.evidence.length!==data.rows.length||data.integrity?.complete!==true||data.integrity.row_count!==data.rows.length||!/^[a-f0-9]{64}$/.test(data.digest||''))throw Error('Body balance snapshot verification failed.');
 data.rows.forEach((row,i)=>{const e=data.evidence[i];if(!Array.isArray(row)||row.length!==14||row.some(v=>typeof v!=='string')||e?.body_only!==true||!Array.isArray(e.issues)||!Array.isArray(e.grain?.rfd_rows)||!Array.isArray(e.grain?.booking_rows)||!Array.isArray(e.booking_lines)||typeof e.pair!=='string')throw Error('Body balance source rows or evidence are incomplete.');});return data;
}
function bbShowBody(){BB_STATE.active=true;if(bbNode('bb-view'))bbNode('bb-view').hidden=false;if(bbNode('fdr-source-view'))bbNode('fdr-source-view').hidden=true;}
function bbShowSource(){BB_STATE.active=false;++BB_STATE.token;BB_STATE.promise=null;if(bbNode('bb-view'))bbNode('bb-view').hidden=true;if(bbNode('fdr-source-view'))bbNode('fdr-source-view').hidden=false;}
function openFdrSourceReport(){bbShowSource();return loadFdrModule(true);}
function bbValue(row,column){const text=row[column],n=rfdTotalNumber(text);if(n===null||column<5)return text;return rfdRoundedNumber(n,column===7?4:[6,9,12].includes(column)?0:2,true);}
function bbRow({row,i}){const e=BB_STATE.data.evidence[i];return '<tr>'+row.map((value,j)=>'<td class="'+(j>=5?'bb-number ':'')+([11,13].includes(j)&&rfdTotalNumber(value)!==null?(rfdTotalNumber(value)<0n?'bb-short':j===13?'bb-surplus':''):'')+'"><button type="button" class="bb-value" data-bb-row="'+i+'" data-bb-column="'+j+'" title="'+esc(e.issues.join(' ')||'Click for saved source rows and calculation evidence')+'">'+esc(bbValue(row,j))+'</button></td>').join('')+'</tr>';}
function renderBodyBalance(){
 const table=bbNode('bb-table');if(!table||CURRENT_SLIDE!==22||RFD_ACTIVE_TAB!=='fdr'||!BB_STATE.active)return;
 if(!SITE_AUTH_USER||BB_STATE.owner!==SITE_AUTH_USER.id||BB_STATE.generation!==SITE_SESSION_GENERATION||!canAccessSlide(22)){table.replaceChildren();return;}
 bbShowBody();bbClearExport();const data=BB_STATE.data;BB_STATE.filtered=rfdCascadeRows('bb',data?.rows||[]);const pages=Math.max(1,Math.ceil(BB_STATE.filtered.length/100));BB_STATE.page=Math.max(1,Math.min(BB_STATE.page,pages));
 const part=BB_STATE.filtered.slice((BB_STATE.page-1)*100,BB_STATE.page*100);
 table.innerHTML='<colgroup>'+BB_HEADERS.map(()=>'<col>').join('')+'</colgroup><thead><tr>'+BB_HEADERS.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+(part.length?part.map(bbRow).join(''):'<tr><td colspan="14">'+(data?'No saved Body fabric rows match this plan/filter.':'Loading verified Body receipts, bookings and cutting…')+'</td></tr>')+'</tbody>'+rfdTotalsFooter('bb',BB_HEADERS,BB_STATE.filtered,!!data,data);
 bbNode('bb-count').textContent=BB_STATE.filtered.length.toLocaleString()+' / '+rfdPlanRowCount('bb').toLocaleString()+' Body fabric rows · KG only · 14 columns';
 bbNode('bb-page').textContent='Page '+BB_STATE.page+' / '+pages;for(const id of ['bb-first','bb-prev'])bbNode(id).disabled=BB_STATE.page<=1;for(const id of ['bb-next','bb-last'])bbNode(id).disabled=BB_STATE.page>=pages;
 bbNode('bb-export').setAttribute('aria-disabled',String(!data||!BB_STATE.filtered.length||!rfdPlanExportAllowed()));
 if(data)bbNode('bb-status').textContent='Saved source snapshots verified. '+data.excluded_non_kg+' non-KG Body specifications excluded. Missing/conflicting values show —; click a value for evidence.';
 rfdFitTable('bb',table,BB_HEADERS,BB_STATE.filtered);bbFitHeight();
}
function bbFitHeight(){const box=bbNode('bb-scroll');if(box&&BB_STATE.active&&CURRENT_SLIDE===22&&RFD_ACTIVE_TAB==='fdr')box.style.maxHeight=Math.max(180,innerHeight-box.getBoundingClientRect().top-100)+'px';}
function bbFilter(){BB_STATE.page=1;renderBodyBalance();}
function clearBodyBalanceFilters(){rfdResetTableTools('bb');bbFilter();}
function bbPage(n){const pages=Math.max(1,Math.ceil(BB_STATE.filtered.length/100));BB_STATE.page=n==='first'?1:n==='last'?pages:BB_STATE.page+Number(n);renderBodyBalance();bbNode('bb-scroll')?.scrollTo({top:0});}
async function loadBodyBalance(force=false){
 if(!SITE_AUTH_USER||!canAccessSlide(22))return;bbShowBody();const owner=SITE_AUTH_USER.id,generation=SITE_SESSION_GENERATION;
 if(BB_STATE.owner===owner&&BB_STATE.generation===generation&&!force&&BB_STATE.data&&Date.now()-BB_STATE.loaded<60000){renderBodyBalance();return;}
 if(!force&&BB_STATE.promise&&BB_STATE.owner===owner&&BB_STATE.generation===generation)return BB_STATE.promise;
 const token=++BB_STATE.token;BB_STATE.owner=owner;BB_STATE.generation=generation;BB_STATE.data=null;BB_STATE.page=1;rfdResetTableTools('bb');renderBodyBalance();bbNode('bb-status').textContent='Reading verified Body receipts, matching bookings, Order Bank and latest cutting…';
 const current=()=>BB_STATE.active&&token===BB_STATE.token&&owner===SITE_AUTH_USER?.id&&generation===SITE_SESSION_GENERATION&&canAccessSlide(22);
 const promise=Promise.resolve().then(async()=>{try{const{data,error}=await SB.request('rfd/body-balance',{action:'read'});if(error)throw error;if(!current())return;BB_STATE.data=verifyBodyBalance(data);BB_STATE.loaded=Date.now();renderBodyBalance();}catch(e){if(current()){BB_STATE.data=null;renderBodyBalance();bbNode('bb-status').textContent='Body balances unavailable: '+(e?.message||e);}}finally{if(BB_STATE.promise===promise)BB_STATE.promise=null;}});BB_STATE.promise=promise;return promise;
}
function showBodyBalanceEvidence(index,column){
 if(!SITE_AUTH_USER||BB_STATE.owner!==SITE_AUTH_USER.id||BB_STATE.generation!==SITE_SESSION_GENERATION||!canAccessSlide(22)||!BB_STATE.data)return;
 const row=BB_STATE.data.rows[index],e=BB_STATE.data.evidence[index];if(!row||!e)return;
 const formulas={5:'Sum only matching Body fabric Booking Qty KG, including active additional source lines.',6:'Current Order Bank order quantity for this EWO + Color.',7:'This Body fabric Booking KG / Order PCS; full source precision.',8:'Net Delivery KG from only matching literal Body receipt rows.',9:'Latest dated cumulative Cutting Total once per EWO + Color, never sum cumulative dates.',10:'Cutting PCS × this Body fabric consumption.',11:'Net Received KG − Fabric Used KG.',12:'max(0, floor(Fabric Balance KG / full-precision Body consumption)).',13:'Fabric Balance KG − max(0, Order PCS − Cutting PCS) × Body consumption.'};
 bbNode('fdr-evidence-title').textContent=BB_HEADERS[column].replace(/\n/g,' ')+' · '+row[column];bbNode('fdr-evidence-body').textContent=JSON.stringify({formula:formulas[column]||'Original saved source text; no inferred Main/Additional classification.',values:Object.fromEntries(BB_HEADERS.map((h,i)=>[h.replace(/\n/g,' '),row[i]])),source_reports:BB_STATE.data.sources,evidence:e},null,2);
 const box=bbNode('fdr-booking-breakdown');box.hidden=true;box.replaceChildren();bbNode('fdr-evidence').showModal();
}
function exportBodyBalance(event){let host;try{
 if(!BB_STATE.active||!BB_STATE.data||!SITE_AUTH_USER||BB_STATE.owner!==SITE_AUTH_USER.id||BB_STATE.generation!==SITE_SESSION_GENERATION||CURRENT_SLIDE!==22||RFD_ACTIVE_TAB!=='fdr'||!canAccessSlide(22)||!rfdPlanExportAllowed()||document.body.classList.contains('site-locked'))throw Error('Open a verified Body balance report first.');
 clearTimeout(BB_STATE.timer);renderBodyBalance();if(!BB_STATE.filtered.length)throw Error('No matching Body rows to export.');
 const original=bbNode('bb-table'),table=original.cloneNode(true);table.removeAttribute('id');table.tBodies[0].innerHTML=BB_STATE.filtered.map(bbRow).join('');host=document.createElement('div');host.className='bb-scroll';host.style.cssText='position:fixed;left:-100000px;top:0;overflow:visible;max-height:none';host.setAttribute('aria-hidden','true');host.append(table);original.parentElement.parentElement.append(host);
 const out=ChassisExcel.workbook(table,'Body Fabric Balance',4),url=URL.createObjectURL(out.blob);BB_STATE.url=url;event.currentTarget.href=url;event.currentTarget.download='Body_Fabric_Booking_Balance.xlsx';setTimeout(()=>{URL.revokeObjectURL(url);if(BB_STATE.url===url)bbClearExport();},30000);return true;
 }catch(e){event.preventDefault();bbNode('bb-status').textContent='Excel export failed: '+(e?.message||e);return false;}finally{host?.remove();}}
function invalidateBodyBalance(){++BB_STATE.token;bbClearExport();BB_STATE.data=null;BB_STATE.promise=null;BB_STATE.loaded=0;if(BB_STATE.active&&CURRENT_SLIDE===22&&RFD_ACTIVE_TAB==='fdr')void loadBodyBalance(true);}
function resetBodyBalance(){++BB_STATE.token;bbClearExport();clearTimeout(BB_STATE.timer);BB_STATE={...BB_STATE,active:false,data:null,filtered:[],page:1,owner:'',generation:-1,promise:null,loaded:0};rfdResetTableTools('bb');for(const id of ['bb-table','bb-count','bb-page'])bbNode(id)?.replaceChildren();}
document.addEventListener('DOMContentLoaded',()=>{bbNode('bb-search')?.addEventListener('input',()=>{clearTimeout(BB_STATE.timer);BB_STATE.timer=setTimeout(bbFilter,180);});bbNode('bb-table')?.addEventListener('click',event=>{const button=event.target.closest('[data-bb-row]');if(button)showBodyBalanceEvidence(Number(button.dataset.bbRow),Number(button.dataset.bbColumn));});});
window.addEventListener('resize',bbFitHeight);
