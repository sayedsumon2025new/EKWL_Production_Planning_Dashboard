const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const XLSX=require('../xlsx.full.min.js');
const elements=new Map(),chunks=[];
const context={XLSX,console,setTimeout,clearTimeout,crypto:{randomUUID:()=> 'excel-test'},
  esc:String,SITE_SESSION_GENERATION:1,SITE_AUTH_USER:{id:1},siteHasPerm:()=>true,
  refreshDashboardAfterSuccessfulUpload:async()=>{},
  document:{getElementById(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',disabled:false});return elements.get(id);}},
  SB:{from(){return {async insert(rows){chunks.push(...rows);return {error:null};}};},
    async rpc(name,args){assert.equal(name,'finalize_embellishment_upload');assert.equal(args.p_expected_rows,9462);return {data:{status:'SUCCESS',uploaded_rows:9462,report_dates:1},error:null};}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../embellishment-module.js'),'utf8'),context);
vm.runInContext(String.raw`
  const cells=['000123','01-Jul-26','000045','  style,"quoted"\nnext  ','Buyer','Team','বাংলা',
    '0000600','0','','1','2','3','4','5','6','7','8','9','10','=1+1'];
  const originalRows=Array.from({length:9462},(_,index)=>({source_row_no:index+2,
    ...Object.fromEntries(EM_HEADERS.map((header,i)=>[i===20?'csv_column_21':header,cells[i]]))}));
  embellishmentSetRows(originalRows,'Embellishment Send Receive.csv');
  // Export must include the whole source despite filters and pagination.
  document.getElementById('em-buyer').value='No matching buyer';EM_PAGE=9;renderEmbellishmentModule();
`,context);
(async()=>{
  let downloaded;
  context.XLSX={...XLSX,writeFile(workbook,name,options){downloaded={name,bytes:XLSX.write(workbook,{...options,type:'buffer'})};}};
  context.exportEmbellishmentExcel();
  assert.equal(downloaded.name,'Embellishment Send Receive.xlsx');
  const book=XLSX.read(downloaded.bytes,{type:'buffer'}),sheet=book.Sheets[book.SheetNames[0]];
  assert.equal(sheet['!ref'],'A1:U9463');assert.equal(sheet.U2.t,'s');assert.equal(sheet.U2.f,undefined);
  const headers=Array.from(vm.runInContext('EM_HEADERS',context));
  assert.deepEqual(XLSX.utils.sheet_to_json(sheet,{header:1,raw:true})[0],headers);
  const file={name:downloaded.name,arrayBuffer:async()=>downloaded.bytes};
  const restored=await context.readEmbellishmentFile(file);
  assert.equal(JSON.stringify(restored),vm.runInContext('JSON.stringify(originalRows)',context));
  elements.get('em-file')||context.document.getElementById('em-file');
  elements.get('em-file').files=[file];
  await context.previewEmbellishmentFile();
  assert.match(elements.get('em-upload-msg').textContent,/9,462 source rows/);
  // Use the existing upload path, including chunking and SQL activation audit.
  context.loadEmbellishmentModule=async()=>{};
  await context.uploadEmbellishmentFile();
  assert.equal(chunks.length,9462);assert.equal(chunks[0].Code,'000123');assert.equal(chunks[0].csv_column_21,'=1+1');
  assert.match(elements.get('em-upload-msg').textContent,/verified and activated/);
  context.resetEmbellishmentModule();assert.equal(elements.get('em-export-btn').disabled,true);
  context.exportEmbellishmentExcel();assert.match(elements.get('em-export-msg').textContent,/No report rows/);
  const csv='\uFEFF'+[headers,...XLSX.utils.sheet_to_json(sheet,{header:1,raw:true}).slice(1,2)]
    .map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  assert.equal((await context.readEmbellishmentFile({name:'report.csv',text:async()=>csv}))[0].Code,'000123');
  console.log('PASS Excel: 9,462 rows, 21 exact headings/cells, text/formula safety, unfiltered export, preview, upload activation, reset and CSV compatibility');
})().catch(error=>{console.error(error);process.exitCode=1;});
