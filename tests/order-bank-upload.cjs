const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=require('./dashboard-source.js').readDashboardHTML();
const parser=html.slice(html.indexOf('function parseRecords('),html.indexOf('\nfunction chassisOf('));
const upload=html.slice(html.indexOf('let ORDER_BANK_UPLOADING='),html.indexOf('\n\n\nfunction selectUploadReport'));
function setup(text,options={}){
 const elements=new Map(),chunks=[],calls=[],refreshes=[];
 const c={crypto:{randomUUID:()=> 'test-token'},SITE_SESSION_GENERATION:0,siteIsAdmin:()=>!options.nonadmin,esc:String,document:{getElementById(id){
  if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',disabled:false,value:0,files:[{name:'Order Bank.csv',text:async()=>text}]});return elements.get(id);
 }},SB:{from(table){assert.equal(table,'order_bank_import_rows');return {
  async insert(rows){chunks.push(rows);if(options.sessionChange)c.SITE_SESSION_GENERATION++;return {error:options.failInsert?new Error('network'):null};},
  delete(){return {async eq(k,v){calls.push(['cleanup',k,v]);return {error:null};}};}
 };},async rpc(name,args){calls.push([name,args]);assert.equal(name,'finalize_order_bank_import');return {data:{status:'SUCCESS',staging_rows:args.p_expected_rows,raw_rows:args.p_expected_rows-(options.mismatch?1:0),nonblank_rows:args.p_expected_rows,source_column_count:args.p_source_columns.length,batch_id:42},error:options.failFinalize?new Error('count mismatch'):null};}},refreshDashboardAfterSuccessfulUpload:async k=>refreshes.push(k)};
 vm.createContext(c);vm.runInContext(parser+'\n'+upload,c);
 return {c,chunks,calls,refreshes,e:id=>c.document.getElementById(id),parse:t=>c.parseOrderBankCSV(t)};
}
(async()=>{
 const x=setup('');const csv='\uFEFFEWO,Extra field\r\n00123,"  a,b \"\"quoted\"\"\nnext  "\r\n,\r\n';
 const parsed=x.parse(csv);assert.equal(parsed.rows.length,2);assert.equal(parsed.rows[0].EWO,'00123');assert.equal(parsed.rows[0]['Extra field'],'  a,b "quoted"\nnext  ');assert.equal(parsed.rows[1].EWO,'');
 assert.equal(x.parse('Only one column\nvalue').headers.length,1);
 for(const text of ['', 'EWO\n', 'EWO,New\n,', 'EWO,ewo\n1,2', ',EWO\n1,2', 'EWO,New\n1,2,3', 'EWO\n"bad'])assert.throws(()=>x.parse(text));
 for(const count of [1,500,501,1001]){
  const t=setup('New column,EWO\n'+Array.from({length:count},(_,i)=>'value,'+String(i).padStart(6,'0')).join('\n'));
  await t.c.uploadOrderBank();assert.equal(t.chunks.length,Math.ceil(count/500));
  assert.equal(t.chunks.flat().length,count);assert.deepEqual(t.chunks.flat().map(r=>r.source_row_no),Array.from({length:count},(_,i)=>i+1));
  assert.equal(t.calls[0][1].p_expected_rows,count);assert.deepEqual(Array.from(t.calls[0][1].p_source_columns),['New column','EWO']);
  assert.deepEqual(t.refreshes,['orderbank']);assert.equal(t.e('ob-progress').value,100);assert.equal(t.e('ob-upload-btn').disabled,false);
 }
 const invalid=setup('EWO,EWO\n1,2');await invalid.c.uploadOrderBank();assert.equal(invalid.chunks.length,0);
 const failed=setup('EWO\n1',{failInsert:true});await failed.c.uploadOrderBank();assert.equal(failed.calls[0][0],'cleanup');assert.equal(failed.refreshes.length,0);
 const countFail=setup('EWO\n1',{failFinalize:true});await countFail.c.uploadOrderBank();assert.equal(countFail.calls[1][0],'cleanup');assert.equal(countFail.refreshes.length,0);
 const mismatch=setup('EWO\n1',{mismatch:true});await mismatch.c.uploadOrderBank();assert.match(mismatch.e('ob-msg').textContent,/verification\/refresh failed/);assert.equal(mismatch.refreshes.length,0);
 const denied=setup('EWO\n1',{nonadmin:true});await denied.c.uploadOrderBank();assert.equal(denied.chunks.length,0);
 const session=setup('EWO\n1',{sessionChange:true});await session.c.uploadOrderBank();assert.equal(session.calls.length,0);
 const double=setup('EWO\n1');await Promise.all([double.c.uploadOrderBank(),double.c.uploadOrderBank()]);assert.equal(double.chunks.length,1);
 if(process.argv[2]){
  const supplied=x.parse(fs.readFileSync(process.argv[2],'utf8'));assert.equal(supplied.headers.length,37);assert.equal(supplied.rows.length,29625);
  assert.equal(supplied.rows.filter(r=>Object.values(r).every(v=>!v.trim())).length,10);
  const full=setup(fs.readFileSync(process.argv[2],'utf8'));await full.c.uploadOrderBank();assert.equal(full.chunks.length,60);assert.equal(full.calls[0][1].p_expected_rows,29625);assert.match(full.e('ob-msg').textContent,/dashboard refreshed/);
  console.log('PASS supplied CSV: 37 columns, 29,625 rows including 10 blank rows, 60 upload chunks');
 }
 console.log('PASS variable columns/rows, exact cells, CSV errors, chunking/count checks, cleanup, admin/session checks, double click');
})().catch(e=>{console.error(e);process.exitCode=1;});
