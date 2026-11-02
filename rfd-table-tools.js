/* Shared view-only filters and quantity totals. Original source rows are never changed. */
const RFD_TABLE_VIEWS={
 rfd:{filters:[['rfd-buyer',10,'All buyers'],['rfd-place',1,'All places'],['rfd-color',6,'All colors']],rules:{14:{unit:'KG'},15:{unit:'PCS'},16:{unit:'YDS'},17:{unit:'ROLLS'}}},
 booking:{filters:[['booking-buyer',2,'All buyers'],['booking-place',4,'All suppliers'],['booking-color',7,'All colors']],rules:{11:{unitColumn:10}}},
 dcs:{filters:[['dcs-buyer',1,'All buyers'],['dcs-place',0,'All dates'],['dcs-color',6,'All colors']],rules:Object.fromEntries(Array.from({length:18},(_,i)=>i+7).map(i=>[i,{unit:'PCS',unique:[8,10,12,14,16,18,20,22].includes(i)?'production-day':'production-latest',strictMissing:true}]))},
 fdr:{filters:[['fdr-buyer',0,'All buyers'],['fdr-place',2,'All colors']],rules:{6:{unit:'KG'},7:{unit:'PCS'},8:{unit:'YDS'},9:{unit:'ROLLS'},13:{unitColumn:12},14:{unitColumn:12,unique:'pair'},15:{unitColumn:12,unique:'pair'},17:{unit:'PCS',unique:'pair'},19:{unit:'PCS',unique:'pair'},20:{unit:'PCS',unique:'pair'},21:{unit:'PCS',unique:'pair'},22:{unit:'PCS',unique:'pair'},23:{unit:'PCS',unique:'pair'},24:{unit:'PCS',unique:'pair'},25:{unit:'PCS',unique:'pair'},26:{unit:'PCS',unique:'pair'},27:{unit:'PCS',unique:'pair'},28:{unit:'PCS',unique:'pair'},29:{unit:'PCS',unique:'pair'}},excluded:{16:'MCD Live Stock remains blank pending a formula.',18:'Consumption is a rate, not an additive quantity.'}}
};
// Presentation only: retain the exact source identifier for matching, totals and export.
const RFD_EWO_COLUMNS={rfd:2,booking:0,dcs:3,fdr:1};
function rfdEwoView(value){const original=String(value??''),codes=[...new Set(original.match(/(?<!\d)\d{6}(?!\d)/g)||[])],text=codes.length?codes.join('\n'):original;return{original,text,changed:text!==original};}
function rfdEwoCell(value,focusable=true){const view=rfdEwoView(value);if(!view.changed)return esc(view.text);const attr=esc(view.original).replace(/\r/g,'&#13;').replace(/\n/g,'&#10;');return '<span class="rfd-ewo-original" '+(focusable?'tabindex="0" ':'')+'data-rfd-ewo-original="'+attr+'" aria-label="'+esc(view.text)+'; original EWO available on hover or focus">'+esc(view.text)+'</span>';}
let RFD_EWO_TOOLTIP=null,RFD_EWO_ANCHOR=null;
function rfdHideEwoTooltip(){if(RFD_EWO_ANCHOR)RFD_EWO_ANCHOR.removeAttribute('aria-describedby');RFD_EWO_ANCHOR=null;if(RFD_EWO_TOOLTIP){RFD_EWO_TOOLTIP.remove();RFD_EWO_TOOLTIP=null;}}
function rfdShowEwoTooltip(anchor){
 rfdHideEwoTooltip();if(!anchor||CURRENT_SLIDE!==22||!SITE_AUTH_USER||!canAccessSlide(22))return;
 const tip=document.createElement('div');tip.id='rfd-ewo-tooltip';tip.className='rfd-ewo-tooltip';tip.setAttribute('role','tooltip');const label=document.createElement('strong');label.textContent='Original EWO';const value=document.createElement('span');value.textContent=anchor.getAttribute('data-rfd-ewo-original');tip.append(label,value);document.body.append(tip);RFD_EWO_TOOLTIP=tip;RFD_EWO_ANCHOR=anchor;anchor.setAttribute('aria-describedby',tip.id);
 const box=anchor.getBoundingClientRect(),size=tip.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(box.left,innerWidth-size.width-8))+'px';tip.style.top=Math.max(8,box.top-size.height-8>=8?box.top-size.height-8:Math.min(box.bottom+8,innerHeight-size.height-8))+'px';
}
if(typeof document.addEventListener==='function'){
 document.addEventListener('pointerover',e=>{const a=e.target?.closest?.('#s22 [data-rfd-ewo-original]');if(a&&a!==RFD_EWO_ANCHOR)rfdShowEwoTooltip(a);});
 document.addEventListener('pointerout',e=>{if(RFD_EWO_ANCHOR?.contains(e.target)&&!RFD_EWO_ANCHOR.contains(e.relatedTarget))rfdHideEwoTooltip();});
 document.addEventListener('focusin',e=>{const a=e.target?.closest?.('#s22 [data-rfd-ewo-original]')||e.target?.closest?.('#s22 button[data-fdr-column="1"]')?.querySelector('[data-rfd-ewo-original]');if(a)rfdShowEwoTooltip(a);});
 document.addEventListener('focusout',e=>{if(RFD_EWO_ANCHOR&&(RFD_EWO_ANCHOR.contains(e.target)||e.target?.contains?.(RFD_EWO_ANCHOR)))rfdHideEwoTooltip();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')rfdHideEwoTooltip();});
 document.addEventListener('scroll',rfdHideEwoTooltip,true);
 document.addEventListener('click',e=>{if(RFD_EWO_ANCHOR&&!RFD_EWO_ANCHOR.contains(e.target))rfdHideEwoTooltip();});
}
const RFD_CASCADE_CACHE=new Map(),RFD_TOTAL_CACHE=new Map();
const rfdFacetKey=v=>String(v??'').trim().replace(/\s+/gu,' ').toLowerCase();
function rfdResetTableTools(prefix){rfdHideEwoTooltip();if(RFD_LAYOUT_FRAMES.has(prefix)){cancelAnimationFrame(RFD_LAYOUT_FRAMES.get(prefix));RFD_LAYOUT_FRAMES.delete(prefix);}RFD_LAYOUT_CACHE.delete(prefix);RFD_CASCADE_CACHE.delete(prefix);RFD_TOTAL_CACHE.delete(prefix);for(const[id,,label]of RFD_TABLE_VIEWS[prefix].filters){const node=document.getElementById(id);if(node){node.innerHTML='<option value="">'+esc(label)+'</option>';node.value='';delete node._rfdOptions;}}const search=document.getElementById(prefix+'-search');if(search)search.value='';}
function rfdCascadeRows(prefix,rows){
 const config=RFD_TABLE_VIEWS[prefix],query=(document.getElementById(prefix+'-search')?.value||'').trim().toLowerCase();
 const state=()=>JSON.stringify([query,...config.filters.map(([id])=>document.getElementById(id)?.value||'')]);const before=state(),cached=RFD_CASCADE_CACHE.get(prefix);
 if(cached?.rows===rows&&cached.length===rows.length&&cached.state===before)return cached.items;
 let scope=rows.map((row,i)=>({row,i})).filter(({row})=>!query||row.some(v=>String(v).toLowerCase().includes(query)));
 // Upstream filters retain all valid choices; changing one clears only incompatible descendants.
 for(const[id,column,label]of config.filters){const node=document.getElementById(id);if(!node)continue;const options=new Map();for(const{row}of scope){const raw=String(row[column]??''),key=rfdFacetKey(raw);if(key&&key!=='—'&&!options.has(key))options.set(key,raw);}
  let selected=rfdFacetKey(node.value);if(!options.has(selected))selected='';const values=[...options.entries()].sort((a,b)=>a[0].localeCompare(b[0])),signature=JSON.stringify(values);
  if(node._rfdOptions!==signature){node.innerHTML='<option value="">'+esc(label)+'</option>'+values.map(([,raw])=>'<option value="'+esc(raw).replace(/\r/g,'&#13;').replace(/\n/g,'&#10;')+'">'+esc(raw.trim())+'</option>').join('');node._rfdOptions=signature;}
  node.value=selected?options.get(selected):'';if(selected)scope=scope.filter(({row})=>rfdFacetKey(row[column])===selected);
 }
 RFD_CASCADE_CACHE.set(prefix,{rows,length:rows.length,state:state(),items:scope});return scope;
}
function rfdTotalNumber(value){const text=String(value??'').trim();if(!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,8})?$/.test(text)||text.length>80)return null;const clean=text.replace(/,/g,''),negative=clean[0]==='-',parts=clean.replace(/^[+-]/,'').split('.');return (negative?-1n:1n)*BigInt(parts[0]+(parts[1]||'').padEnd(8,'0'));}
function rfdTotalFormat(value){const negative=value<0n,n=negative?-value:value,whole=(n/100000000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,','),fraction=(n%100000000n).toString().padStart(8,'0').replace(/0+$/,'');return(negative?'-':'')+whole+(fraction?'.'+fraction:'');}
function rfdTotalUnit(value){const u=String(value??'').trim().toUpperCase();if(['KG','KGS','KILOGRAM'].includes(u))return'KG';if(['PC','PCS','PIECE','PIECES'].includes(u))return'PCS';if(['YD','YDS','YARD','YARDS'].includes(u))return'YDS';if(['M','MTR','METER','METRE','METERS','METRES'].includes(u))return'M';return u==='—'?'':u;}
function rfdTotalDate(value){const s=String(value??'').trim();let y,m,d,match;if((match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s))){[,y,m,d]=match;}else if((match=/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/.exec(s))){d=match[1];m=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].toLowerCase())+1;y=match[3];}else if((match=/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s))){d=match[1];m=match[2];y=match[3];}else return null;y=Number(y);if(y<100)y+=y<70?2000:1900;m=Number(m);d=Number(d);const date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'):null;}
// Cumulative source columns are snapshots: use the newest selected date, never sum dates.
function rfdProductionScope(items,latest){
 if(!latest)return items;const newest=new Map(),unknown=new Set();for(const item of items){const r=item.row;if(r.every(v=>String(v??'').trim()===''))continue;const pair=JSON.stringify([rfdFacetKey(r[3]),rfdFacetKey(r[6])]),date=rfdTotalDate(r[0]);if(!date)unknown.add(pair);else if(!newest.has(pair)||date>newest.get(pair))newest.set(pair,date);}
 return items.filter(({row:r})=>{const pair=JSON.stringify([rfdFacetKey(r[3]),rfdFacetKey(r[6])]);return unknown.has(pair)?!rfdTotalDate(r[0]):rfdTotalDate(r[0])===newest.get(pair);});
}
function rfdTotalKey(prefix,item,rule,data){const r=item.row;if(rule.unique?.startsWith('production-')){const date=rfdTotalDate(r[0]);return rfdFacetKey(r[3])&&rfdFacetKey(r[6])&&date?JSON.stringify([rfdFacetKey(r[3]),rfdFacetKey(r[6]),date]):null;}if(rule.unique==='pair')return typeof data?.evidence?.[item.i]?.pair==='string'&&data.evidence[item.i].pair?data.evidence[item.i].pair:null;return String(item.i);}
function rfdQuantityTotals(prefix,items,data=null){
 const latest=prefix==='dcs'?rfdProductionScope(items,true):null,productionKeys=prefix==='dcs'?new Map(items.map(item=>[item,rfdTotalKey(prefix,item,{unique:'production-day'},data)])):null;
 const result={};for(const[col,rule]of Object.entries(RFD_TABLE_VIEWS[prefix].rules)){const groups=new Map();let missing=0,conflicts=0,valid=0;const totals=new Map();
  for(const item of (prefix==='dcs'&&rule.unique==='production-latest'?latest:items)){if(item.row.every(v=>String(v??'').trim()===''))continue;const key=productionKeys?productionKeys.get(item):rfdTotalKey(prefix,item,rule,data),number=rfdTotalNumber(item.row[Number(col)]),unit=rule.unit||rfdTotalUnit(item.row[rule.unitColumn]);if(key===null){missing++;continue;}if(!groups.has(key))groups.set(key,{numbers:new Map(),units:new Set(),missing:false});const g=groups.get(key);if(number===null||!unit)g.missing=true;else{g.numbers.set(number.toString(),number);g.units.add(unit);}}
  for(const g of groups.values()){if(g.numbers.size>1||g.units.size>1){conflicts++;continue;}if(!g.numbers.size||g.missing&&rule.strictMissing){missing++;continue;}if(g.missing)missing++;const unit=[...g.units][0],n=[...g.numbers.values()][0];totals.set(unit,(totals.get(unit)||0n)+n);valid++;}
  const partial=missing>0||conflicts>0,entries=[...totals].sort((a,b)=>a[0].localeCompare(b[0]));let text=!items.length?'0':!valid?'—':entries.map(([unit,n])=>rfdTotalFormat(n)+(rule.unit?'':' '+unit)).join('\n');if(valid&&partial)text+='*';
  const scope=rule.unique==='production-latest'?'Latest selected source date per EWO + Color; cumulative values are never summed across dates.':rule.unique==='production-day'?'Daily movements counted once per EWO + Color + date.':rule.unique==='pair'?'Each EWO + Color counted once.':'All matching source/fabric rows.';
  result[col]={text,state:!valid&&items.length?'unavailable':partial?'partial':'complete',valid,missing,conflicts,title:scope+' '+items.length+' matching rows across all pages. '+(partial?'Available subtotal only: '+missing+' missing/invalid groups; '+conflicts+' conflicting groups. These are not counted as zero.':'Complete quantity total.')+(rule.unit?' Unit: '+rule.unit+'.':' Units are kept separate.')};
 }return result;
}
function rfdTotalsFooter(prefix,headers,items,enabled=true,data=null){
 const cached=RFD_TOTAL_CACHE.get(prefix);if(cached?.items===items&&cached.enabled===enabled&&cached.data===data)return cached.html;const totals=enabled?rfdQuantityTotals(prefix,items,data):{},config=RFD_TABLE_VIEWS[prefix];
 const hasPartial=Object.values(totals).some(t=>t.state==='partial');
 const html='<tfoot><tr class="rfd-total-row" aria-label="Filtered quantity totals">'+headers.map((_,i)=>{const total=totals[i],excluded=config.excluded?.[i],text=i===0?('Filtered totals'+(hasPartial?'\n* available subtotal':'')):total?.text||(excluded||!enabled&&config.rules[i]?'—':''),title=i===0?'All matching rows, not just this page. * = available subtotal with missing or conflicting values.':total?.title||excluded||(!enabled&&config.rules[i]?'No verified report data available.':'Identifiers, dimensions and text are not added.');return'<td data-total-column="'+i+'" data-total-state="'+(total?.state||(!enabled&&config.rules[i]?'unavailable':'not-additive'))+'" title="'+esc(title)+'">'+esc(text)+'</td>';}).join('')+'</tr></tfoot>';
 RFD_TOTAL_CACHE.set(prefix,{items,enabled,data,html});return html;
}

/* Size columns from the filtered data, with readable caps for wrapped long text. */
const RFD_LAYOUT_CACHE=new Map(),RFD_LAYOUT_FRAMES=new Map();let RFD_RESIZE_TIMER=0;
function rfdColumnBounds(prefix,column,header){const h=String(header).toLowerCase();if(RFD_TABLE_VIEWS[prefix].rules[column]||prefix==='fdr'&&[16,18].includes(column))return{min:90,max:150,flex:false};if(/gsm|height/.test(h))return{min:75,max:110,flex:false};if(/^width$/.test(h))return{min:68,max:100,flex:false};if(/^uom$|measurement.*unit/.test(h))return{min:65,max:100,flex:false};if(/date/.test(h))return{min:105,max:135,flex:false};if(/fabric details/.test(h))return{min:140,max:340,flex:true};if(/construction|composition/.test(h))return{min:115,max:230,flex:true};if(/reason|remark/.test(h))return{min:145,max:300,flex:true};if(/buyer|supplier|place/.test(h))return{min:95,max:220,flex:true};if(/colo[u]?r/.test(h))return{min:95,max:210,flex:true};if(/ewo|batch|tag|lock|challan|vehicle|\bno\b|number/.test(h))return{min:85,max:150,flex:false};return{min:80,max:190,flex:true};}
function rfdFitTable(prefix,table,headers,items){
 if(!table?.parentElement||!table.getBoundingClientRect().width)return;const box=table.parentElement,available=Math.max(200,box.clientWidth),cached=RFD_LAYOUT_CACHE.get(prefix);let widths;
 if(cached?.items===items&&cached.available===available)widths=cached.widths;else{
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),measured=new Map(),bounds=headers.map((h,i)=>rfdColumnBounds(prefix,i,h));
  const measure=(value,bold=false)=>{let max=0;for(const line of String(value??'').split(/\r\n|\r|\n/)){if(line.length>2048)return 20000;const key=(bold?'b':'r')+line.replace(/[0-9]/g,'0');let w=measured.get(key);if(w===undefined){if(ctx){ctx.font=(bold?'700':'500')+' 11px Arial';w=ctx.measureText(line).width;}else w=line.length*7;if(measured.size<4000)measured.set(key,w);}max=Math.max(max,w);}return Math.ceil(max+20);};
  widths=headers.map((h,i)=>Math.max(bounds[i].min,Math.min(bounds[i].max,measure(h,true))));
  for(const{row}of items)for(let i=0;i<headers.length;i++){if(widths[i]>=bounds[i].max)continue;const value=i===RFD_EWO_COLUMNS[prefix]?rfdEwoView(row[i]).text:String(row[i]??'');if(value.length*12+20<=widths[i])continue;widths[i]=Math.min(bounds[i].max,Math.max(widths[i],measure(value)));}
  const foot=table.tFoot?.rows?.[0];if(foot)for(let i=0;i<headers.length;i++)widths[i]=Math.min(bounds[i].max,Math.max(widths[i],measure(foot.cells[i]?.textContent||'',true)));
  let extra=Math.max(0,available-widths.reduce((a,b)=>a+b,0));const flexible=bounds.map((b,i)=>b.flex?i:-1).filter(i=>i>=0);while(extra>0){const active=flexible.filter(i=>widths[i]<bounds[i].max);if(!active.length)break;const portion=Math.max(1,Math.floor(extra/active.length));for(const i of active){const add=Math.min(portion,bounds[i].max-widths[i],extra);widths[i]+=add;extra-=add;}}
  RFD_LAYOUT_CACHE.set(prefix,{items,available,widths});
 }
 const cols=table.querySelectorAll('col');widths.forEach((w,i)=>{if(cols[i])cols[i].style.width=w+'px';});table.style.width=widths.reduce((a,b)=>a+b,0)+'px';
 const top=box.getBoundingClientRect().top,pager=box.parentElement.querySelector('[class$="-pagination"]'),reserve=(pager?.getBoundingClientRect().height||28)+30;box.style.maxHeight=Math.max(140,Math.floor(window.innerHeight-top-reserve))+'px';const first=cols[0]?.getBoundingClientRect().width||widths[0],second=cols[1]?.getBoundingClientRect().width||widths[1];table.style.setProperty('--rfd-sticky-2',first+'px');table.style.setProperty('--rfd-sticky-3',(first+second)+'px');
}
if(typeof window!=='undefined')window.addEventListener('resize',()=>{rfdHideEwoTooltip();clearTimeout(RFD_RESIZE_TIMER);RFD_RESIZE_TIMER=setTimeout(()=>{if(typeof CURRENT_SLIDE==='undefined'||CURRENT_SLIDE!==22)return;const prefix=RFD_ACTIVE_TAB,table=document.getElementById(prefix+'-table'),cache=RFD_CASCADE_CACHE.get(prefix);if(table?.tHead&&cache)rfdFitTable(prefix,table,[...table.tHead.rows[0].cells].map(e=>e.textContent),cache.items);},80);});

function rfdScheduleFit(prefix){if(typeof requestAnimationFrame!=='function'||RFD_LAYOUT_FRAMES.has(prefix))return;RFD_LAYOUT_FRAMES.set(prefix,requestAnimationFrame(()=>{RFD_LAYOUT_FRAMES.delete(prefix);if(CURRENT_SLIDE!==22||RFD_ACTIVE_TAB!==prefix)return;const table=document.getElementById(prefix+'-table'),cache=RFD_CASCADE_CACHE.get(prefix);if(table?.tHead&&cache)rfdFitTable(prefix,table,[...table.tHead.rows[0].cells].map(e=>e.textContent),cache.items);}));}

if(typeof document.addEventListener==='function')document.addEventListener('toggle',event=>{if(event.target?.matches?.('details')&&event.target.closest('#s22'))rfdScheduleFit(RFD_ACTIVE_TAB);},true);
