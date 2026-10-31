/* Native .xlsx, generated from every rendered table cell, including offscreen cells. */
(()=>{'use strict';
 const xml=v=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 const col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
 const rgb=s=>{const a=String(s).match(/[\d.]+/g);return a&&a.length>=3?'FF'+a.slice(0,3).map(v=>Math.round(Number(v)).toString(16).padStart(2,'0')).join('').toUpperCase():'FF172B46';};
 const fill=el=>{for(let n=el;n;n=n.parentElement){const s=getComputedStyle(n).backgroundColor,a=s.match(/[\d.]+/g);if(a&&a.length>=3&&(a.length<4||Number(a[3])>0))return rgb(s);}return 'FFFFFFFF';};
 function inspect(table){
  const occupied=[],cells=[],merges=[],widths=[],heights=[];let columns=0;
  [...table.rows].forEach((tr,r)=>{occupied[r]??=[];let c=0;heights[r]=Math.max(15,tr.getBoundingClientRect().height*.75);
   [...tr.cells].forEach(td=>{while(occupied[r][c])c++;const rs=td.rowSpan||1,cs=td.colSpan||1,style=getComputedStyle(td),text=td.innerText.replace(/\r/g,'').trim();
    const rich=text.includes('\n')?text.split('\n').map((line,i,all)=>{const node=[...td.querySelectorAll('*')].find(n=>n.innerText?.trim()===line)||td,cs=getComputedStyle(node);return {text:line+(i<all.length-1?'\n':''),font:cs.fontFamily.split(',')[0].replace(/["']/g,''),size:parseFloat(cs.fontSize)*.75,bold:Number(cs.fontWeight)>=600,color:rgb(cs.color)};}):null;
    cells.push({r,c,text,rich,style:{font:style.fontFamily.split(',')[0].replace(/["']/g,''),size:parseFloat(style.fontSize)*.75,bold:Number(style.fontWeight)>=600,italic:style.fontStyle==='italic',color:rgb(style.color),fill:fill(td),align:['left','right','center','justify'].includes(style.textAlign)?style.textAlign:td.tagName==='TH'?'center':'left',borders:['Left','Right','Top','Bottom'].map(side=>({style:style['border'+side+'Style']!=='none'&&parseFloat(style['border'+side+'Width'])>0?(parseFloat(style['border'+side+'Width'])>1.5?'medium':'thin'):null,color:rgb(style['border'+side+'Color'])}))}});
    if(cs===1)widths[c]=Math.max(widths[c]||0,td.getBoundingClientRect().width);else for(let k=0;k<cs;k++)widths[c+k]??=td.getBoundingClientRect().width/cs;
    if(rs>1||cs>1)merges.push(col(c)+(r+1)+':'+col(c+cs-1)+(r+rs));
    for(let y=r;y<r+rs;y++){occupied[y]??=[];for(let x=c;x<c+cs;x++)occupied[y][x]=true;}c+=cs;columns=Math.max(columns,c);
   });
  });return {cells,merges,widths,heights,columns,rows:table.rows.length};
 }
 function zip(files){
  const enc=new TextEncoder(),parts=[],central=[];let offset=0;
  const crc32=bytes=>{let crc=-1;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}return(crc^-1)>>>0;};
  for(const [name,content]of files){const n=enc.encode(name),data=enc.encode(content),crc=crc32(data),local=new Uint8Array(30+n.length),h=new DataView(local.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,n.length,true);local.set(n,30);parts.push(local,data);
   const directory=new Uint8Array(46+n.length),d=new DataView(directory.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x0800,true);d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,n.length,true);d.setUint32(42,offset,true);directory.set(n,46);central.push(directory);offset+=local.length+data.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,central.reduce((n,p)=>n+p.length,0),true);e.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 }
 function workbook(table,name,freeze){
  const model=inspect(table),fonts=['<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>'],fills=['<fill><patternFill patternType="none"/></fill>','<fill><patternFill patternType="gray125"/></fill>'],borders=['<border><left/><right/><top/><bottom/><diagonal/></border>'],formats=[],styles=['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'],fontKeys=new Map(),fillKeys=new Map(),borderKeys=new Map(),styleKeys=new Map(),formatKeys=new Map();
  const intern=(map,array,key,value)=>{if(!map.has(key)){map.set(key,array.length);array.push(value);}return map.get(key);};
  const rows=Array.from({length:model.rows},()=>[]),values=[];
  for(const cell of model.cells){const s=cell.style;
   const f=intern(fontKeys,fonts,JSON.stringify([s.font,s.size,s.bold,s.italic,s.color]),'<font>'+(s.bold?'<b/>':'')+(s.italic?'<i/>':'')+'<sz val="'+s.size+'"/><color rgb="'+s.color+'"/><name val="'+xml(s.font)+'"/></font>');
   const fillId=intern(fillKeys,fills,s.fill,'<fill><patternFill patternType="solid"><fgColor rgb="'+s.fill+'"/><bgColor indexed="64"/></patternFill></fill>');
   const b=intern(borderKeys,borders,JSON.stringify(s.borders),'<border>'+s.borders.map((v,i)=>'<'+['left','right','top','bottom'][i]+(v.style?' style="'+v.style+'"><color rgb="'+v.color+'"/>':'/>')).map((v,i)=>v.endsWith('/>')&&s.borders[i].style?v+'</'+['left','right','top','bottom'][i]+'>':v).join('')+'<diagonal/></border>');
   const clean=cell.text.replace(/,/g,''),numeric=/^-?(?:0|[1-9]\d*)(?:\.\d+)?%?$/.test(clean)&&clean.replace(/[-.%]/g,'').length<=15;
   let formatId=0,value=cell.text;
   if(numeric){const percent=clean.endsWith('%'),decimals=(clean.replace('%','').split('.')[1]||'').length;value=Number(clean.replace('%',''))/(percent?100:1);const code=(cell.text.includes(',')?'#,##0':'0')+(decimals?'.'+'0'.repeat(decimals):'')+(percent?'%':'');if(!formatKeys.has(code)){formatKeys.set(code,164+formats.length);formats.push(code);}formatId=formatKeys.get(code);}
   const key=JSON.stringify([f,fillId,b,formatId,s.align]),id=intern(styleKeys,styles,key,'<xf numFmtId="'+formatId+'" fontId="'+f+'" fillId="'+fillId+'" borderId="'+b+'" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="'+s.align+'" vertical="center" wrapText="1"/></xf>');
   const inline=cell.rich?cell.rich.map(r=>'<r><rPr><rFont val="'+xml(r.font)+'"/><sz val="'+r.size+'"/><color rgb="'+r.color+'"/>'+(r.bold?'<b/>':'')+'</rPr><t xml:space="preserve">'+xml(r.text)+'</t></r>').join(''):'<t xml:space="preserve">'+xml(cell.text)+'</t>';
   const address=col(cell.c)+(cell.r+1);rows[cell.r].push('<c r="'+address+'" s="'+id+'"'+(numeric?'><v>'+value+'</v>':' t="inlineStr"><is>'+inline+'</is>')+'</c>');values.push({address,text:cell.text,value,numeric,style:s});
  }
  const stylesXml='<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="'+formats.length+'">'+formats.map((v,i)=>'<numFmt numFmtId="'+(164+i)+'" formatCode="'+xml(v)+'"/>').join('')+'</numFmts><fonts count="'+fonts.length+'">'+fonts.join('')+'</fonts><fills count="'+fills.length+'">'+fills.join('')+'</fills><borders count="'+borders.length+'">'+borders.join('')+'</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="'+styles.length+'">'+styles.join('')+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const sheet='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+col(model.columns-1)+model.rows+'"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="'+freeze+'" ySplit="1" topLeftCell="'+col(freeze)+'2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>'+Array.from({length:model.columns},(_,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+Math.max(3,((model.widths[i]||60)-5)/7).toFixed(3)+'" customWidth="1"/>').join('')+'</cols><sheetData>'+rows.map((r,i)=>'<row r="'+(i+1)+'" ht="'+model.heights[i].toFixed(2)+'" customHeight="1">'+r.join('')+'</row>').join('')+'</sheetData>'+(model.merges.length?'<mergeCells count="'+model.merges.length+'">'+model.merges.map(ref=>'<mergeCell ref="'+ref+'"/>').join('')+'</mergeCells>':'')+'<pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup orientation="landscape" paperSize="8" fitToWidth="1" fitToHeight="0"/></worksheet>';
  const files=[['[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],['xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'+xml(name)+'" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">\''+xml(name)+'\'!$1:$1</definedName></definedNames></workbook>'],['xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],['xl/styles.xml',stylesXml],['xl/worksheets/sheet1.xml',sheet]];
  return {blob:zip(files.map(([n,s])=>[n,'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+s])),values,model};
 }
 window.ChassisExcel={inspect,workbook};
 window.resetChassisExcelLinks=()=>document.querySelectorAll('.chassis-excel').forEach(link=>{if(link.dataset.excelUrl)URL.revokeObjectURL(link.dataset.excelUrl);delete link.dataset.excelUrl;link.removeAttribute('download');link.setAttribute('href','#');link.textContent='↓ Export Excel';link.removeAttribute('title');});
 window.exportChassisExcel=(event,id,name,freeze)=>{
  const link=event?.currentTarget;
  try{
   if(!link||!SITE_AUTH_USER||CURRENT_SLIDE!==10||!canAccessSlide(10)||document.body.classList.contains('site-locked'))throw Error('Sign in and open Chassis Analysis to export.');
   if(['loading','error'].includes(document.body.dataset.planningState))throw Error('Wait for verified planning data before exporting.');
   if(ACTIVE_PLAN_UPLOAD?.id&&String(EFF15_METRIC_UPLOAD_ID)!==String(ACTIVE_PLAN_UPLOAD.id))throw Error('Selected planning data changed. Reload this slide.');
   if(!['s9-cal','s9-summary-tbl'].includes(id))throw Error('Unknown Chassis report.');
   const table=document.getElementById(id);if(!table||table.rows.length<2)throw Error('No report data is available to export.');
   const out=workbook(table,name,freeze),url=URL.createObjectURL(out.blob);
   if(link.dataset.excelUrl)URL.revokeObjectURL(link.dataset.excelUrl);
   const source=String(ACTIVE_PLAN_UPLOAD?.file_name||'Selected_Plan').replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]+/gu,'_').slice(0,100);
   const dates=[...table.querySelectorAll('thead th[title]')].map(th=>th.title).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d));
   link.dataset.excelUrl=url;link.href=url;link.download='EKWL_'+name.replace(/\W+/g,'_')+'_'+source+(dates.length?'_'+dates[0]+'_'+dates.at(-1):'')+'.xlsx';link.textContent='Downloading…';link.removeAttribute('title');
   setTimeout(()=>{if(link.dataset.excelUrl===url)link.textContent='↓ Export Excel';},2500);
   setTimeout(()=>{URL.revokeObjectURL(url);if(link.dataset.excelUrl===url){delete link.dataset.excelUrl;link.removeAttribute('download');link.href='#';}},60000);
   return true; // Keep this real user-clicked anchor; embedded browsers can block detached synthetic downloads.
  }catch(error){event?.preventDefault();if(link){link.textContent='Export failed · retry';link.title=error.message;setTimeout(()=>{if(!link.dataset.excelUrl)link.textContent='↓ Export Excel';},3500);}return false;}
 };
 window.fitChassisReportTables=()=>{
  for(const id of ['s9-cal','s9-summary-tbl']){
   const table=document.getElementById(id),count=table?.rows[0]?.cells.length||0;if(!table)continue;
   if(!count||table.rows.length<2){table.style.width='100%';table.style.minWidth='0';table.querySelector('colgroup')?.remove();continue;}
   const lead=id==='s9-cal'?[40,112,112,55,62]:[134],tail=id==='s9-cal'?[]:[70,66,48],days=Math.max(0,count-lead.length-tail.length);
   let group=table.querySelector('colgroup');if(!group){group=document.createElement('colgroup');table.prepend(group);}
   group.innerHTML=[...lead,...Array(days).fill(id==='s9-cal'?65:39),...tail].map(width=>'<col style="width:'+width+'px">').join('');
   table.style.width='100%';table.style.minWidth=(lead.reduce((a,b)=>a+b,0)+tail.reduce((a,b)=>a+b,0)+days*(id==='s9-cal'?65:32))+'px';
  }
 };
 let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(typeof CURRENT_SLIDE!=='undefined'&&CURRENT_SLIDE===10)window.fitChassisReportTables();},100);});
})();
