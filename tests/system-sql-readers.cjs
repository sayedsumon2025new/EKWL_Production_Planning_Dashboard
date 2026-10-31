const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const cache=fs.readFileSync('data-cache.js','utf8'),bridge=fs.readFileSync('order-execution-bridge.js','utf8');
function setup(){
 let now=1000;const calls=[],messages=[],listeners={},frame={style:{},dataset:{ready:'1'},contentWindow:{postMessage:m=>messages.push(m)}};
 const source={size:[{source_row_no:2,row_data:{EWO:'123',Color:'Blue'},file_name:'source.csv'}],accessories:[],embellishment:[],orderbank:[{upload_batch_id:7,source_columns:['EWO','OrderQty'],source_data:{EWO:'CURRENT',OrderQty:'12'}}]};
 const c={console,Date:class extends Date{static now(){return now;}},URLSearchParams,window:{location:{search:''},addEventListener:(n,f)=>listeners[n]=f},location:{search:''},document:{getElementById:()=>frame,body:{classList:{contains:()=>false}}},SITE_AUTH_USER:{id:'A'},SITE_SESSION_GENERATION:1,CURRENT_SLIDE:16,ACTIVE_PLAN_UPLOAD:{id:'P',revision:2},EFF15_METRIC_UPLOAD_ID:'P',EFF15_METRIC_DAILY:[{record_id:1,date:'2026-11-01',value:12}],ORDER_BANK_RAW_ROWS:[{EWO:'STALE',OrderQty:99}],canAccessSlide:()=>true,startDashboardTiming:()=>()=>{},dashboardPerfEnabled:()=>false,
 SB:{from(){throw Error('Paged SQL was unexpectedly used');},async reportSnapshot(kind,options){calls.push({kind,options});const rows=kind==='planning-records'?[{id:1,criteria:'Plan/Day',ewo:'CURRENT'}]:(source[kind]||[]);return {data:{format:'report-rows-v1',kind,rows,integrity:{complete:true,row_count:rows.length,...(kind==='planning-records'?{upload_id:'P',revision:2}:{})}},error:null};}}};
 vm.createContext(c);vm.runInContext(cache,c);
 return {c,calls,source,messages,listeners,frame,advance:n=>now+=n};
}
(async()=>{
 const x=setup(),c=x.c;
 const a=c.loadOrderBankSnapshot(),b=c.loadOrderBankSnapshot();assert.equal(a,b);await a;assert.equal(x.calls.length,1);assert.equal(x.calls[0].kind,'orderbank');
 x.advance(60001);await c.loadOrderBankSnapshot();assert.equal(x.calls.length,2,'Order Bank expires rather than persisting forever');
 await Promise.all([c.loadActiveModuleRows('size'),c.loadEwoSource('size')]);assert.equal(x.calls.filter(x=>x.kind==='size').length,1,'module and follow-up share one SQL read');
 c.invalidateEwoSources(['size']);x.source.size=[{source_row_no:2,row_data:{EWO:'123',Color:'NEW'}}];
 assert.equal((await c.loadEwoSource('size'))[0].row_data.Color,'NEW');assert.equal(x.calls.filter(x=>x.kind==='size').length,2,'explicit source refresh cannot reuse fenced old module rows');
 x.advance(60001);await c.loadActiveModuleRows('size');assert.equal(x.calls.filter(x=>x.kind==='size').length,3);
 const broken=setup();broken.c.SB.reportSnapshot=async kind=>({data:{format:'report-rows-v1',kind,rows:[],integrity:{complete:true,row_count:9}},error:null});await assert.rejects(broken.c.loadOrderBankSnapshot(),/did not complete/);
 const mixed=setup();mixed.source.orderbank=[{upload_batch_id:1},{upload_batch_id:2}];await assert.rejects(mixed.c.loadOrderBankSnapshot(),/mixed/);
 console.log('PASS direct SQL Order Bank, single-flight, expiry, module/follow-up reuse, explicit freshness fence, partial/mixed rejection');
 const oe=setup();vm.runInContext(bridge,oe.c);await oe.c.loadOrderExecutionSlide();
 const payload=oe.messages.find(m=>m.type==='ekwl-execution-data');assert.ok(payload);assert.equal(payload.orders[0].EWO,'CURRENT','ignore stale global Order Bank table');assert.equal(payload.orders[0].OrderQty,'12','preserve exact flexible source cells');assert.equal(payload.records[0].ewo,'CURRENT');
 oe.listeners.message({source:oe.frame.contentWindow,data:{type:'ekwl-execution-rendered',key:payload.key}});
 const count=oe.calls.length;await oe.c.loadOrderExecutionSlide();assert.equal(oe.calls.length,count);oe.advance(60001);await oe.c.loadOrderExecutionSlide();assert.equal(oe.calls.length,count+2,'Order Execution refreshes both SQL inputs after expiry');
 const bad=setup();vm.runInContext(bridge,bad.c);bad.c.SB.reportSnapshot=async kind=>kind==='orderbank'?{data:{format:'report-rows-v1',kind,rows:[],integrity:{complete:true,row_count:0}},error:null}:{data:null,error:Error('revision mismatch')};await bad.c.loadOrderExecutionSlide();assert.equal(bad.messages.find(m=>m.type==='ekwl-execution-data').planningReady,false);
 console.log('PASS Order Execution two consistent SQL readers, exact source cells, source/revision failure, rendered-view expiry and stale global prevention');
 for(const [file,kind,prefix,fn] of [['size-set-module.js','size','SS','loadSizeSetModule'],['accessories-module.js','accessories','AC','loadAccessoriesModule'],['embellishment-module.js','embellishment','EM','loadEmbellishmentModule']]){
  const y=setup(),q=y.c;let loads=0;const oldRows=[{row_data:{EWO:'OLD'}}];await q.loadVersionedData('snapshot:'+kind,()=>oldRows);
  Object.assign(q,{[prefix+'_ROWS']:oldRows,[prefix+'_MODE']:'sql',[prefix+'_LOAD_TOKEN']:0,siteIsAdmin:()=>false,renderSizeSetModule(){},renderAccessoriesModule(){},renderEmbellishmentModule(){},ssMessage(){},acMessage(){},emMessage(){},populateSizeSetFilters(){},loadActiveModuleRows:async()=>{loads++;return [{row_data:{EWO:'NEW'}}];},accessoriesSetRows(){},embellishmentSetRows(){}});
  const source=fs.readFileSync(file,'utf8'),start=source.indexOf('async function '+fn+'('),end=source.indexOf('\n}',start)+2;vm.runInContext(source.slice(start,end),q);
  await q[fn]();assert.equal(loads,0);y.advance(60001);await q[fn]();assert.equal(loads,1,kind+' UI shortcut must honor SQL cache expiry');
 }
 console.log('PASS Size Set, Accessories and Embellishment UI shortcuts honor freshness bounds');
 const settings=setup();vm.runInContext(fs.readFileSync('frontend-runtime.js','utf8'),settings.c);let reads=0;const query=()=>{reads++;return {data:[],error:null};};await settings.c.readTinySetting('abp',query);await settings.c.readTinySetting('abp',query);assert.equal(reads,1);settings.advance(60001);await settings.c.readTinySetting('abp',query);assert.equal(reads,2);
 console.log('PASS admin/ABP/ladder/floor shared settings recheck SQL after expiry');
})().catch(e=>{console.error(e);process.exitCode=1;});
