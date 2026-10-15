const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=require('./dashboard-source.js').readDashboardHTML();
const source=html.slice(html.indexOf('const ORDER_BANK_SOURCE_COLUMNS='),html.indexOf('\nlet EFF15_SUB='));
function setup(rows=[],error=null){
  const elements=new Map(),calls=[];
  const document={getElementById(id){
    if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',querySelectorAll:()=>[]});
    return elements.get(id);
  }};
  const c={document,SITE_AUTH_USER:{id:'test-admin'},SITE_SESSION_GENERATION:0,fmt:String,esc:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;'),SB:{from(table){
    assert.ok(['order_bank_latest_all','order_bank_raw'].includes(table));
    return {select(columns){assert.equal(columns,'*');const q={eq(k,v){assert.equal(k,'upload_batch_id');assert.equal(v,7);return q;},order(k){assert.equal(k,'source_row_no');return q;},async range(from,to){calls.push([from,to]);return {data:rows.slice(from,to+1),error};}};return q;}};
  }}};
  vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/../data-cache.js','utf8'),c);vm.runInContext(source,c);
  return {c,e:id=>document.getElementById(id),calls,read:s=>vm.runInContext(s,c)};
}
(async()=>{
  const empty=setup();await empty.c.loadOrderBankSlide();
  assert.notEqual(empty.e('order-bank-msg').textContent,'Load failed');
  assert.match(empty.e('order-bank-table').innerHTML,/No Order Bank rows are available/);
  assert.match(empty.e('order-bank-table').innerHTML,/colspan="40"/);
  assert.match(empty.e('order-bank-msg').textContent,/0 filtered \/ 0 total/);
  assert.equal(empty.read('ORDER_BANK_KEYMAP.size'),40);
  const columns=Array.from(empty.read('ORDER_BANK_SOURCE_COLUMNS'));
  const row=Object.fromEntries(columns.map(k=>[k,'']));Object.assign(row,{upload_batch_id:7,EWO:'123',Buyer:'Buyer A',OrderQty:'1,200',Ordervalue:'2,400',TotalFabricinKG:'300'});
  const loaded=setup(Array.from({length:1001},()=>({...row})));await loaded.c.loadOrderBankSlide();
  assert.deepEqual(loaded.calls,[[0,999],[1000,1999]]);
  assert.equal(loaded.read('ORDER_BANK_RAW_ROWS.length'),1001);
  assert.equal((loaded.e('order-bank-table').innerHTML.match(/<tr>/g)||[]).length,101);
  assert.match(loaded.e('order-bank-total-cells').innerHTML,/1201200/);
  loaded.read("ORDER_BANK_EWO_SEARCH='missing'");loaded.c.renderOrderBankView(true);
  assert.match(loaded.e('order-bank-table').innerHTML,/No orders match the current filters/);
  assert.doesNotMatch(loaded.e('order-bank-table').innerHTML,/No Order Bank rows are available/);
  const malformed=setup([{EWO:'123'}]);await malformed.c.loadOrderBankSlide();
  assert.match(malformed.e('order-bank-table').innerHTML,/SQL raw view missing source column/);
  assert.equal(malformed.read('ORDER_BANK_RAW_ROWS.length'),0);
  const denied=setup([],new Error('permission denied'));await denied.c.loadOrderBankSlide();
  assert.equal(denied.e('order-bank-msg').textContent,'Load failed');
  assert.match(denied.e('order-bank-table').innerHTML,/permission denied/);
  const stale=setup([row]);const pending=stale.c.loadOrderBankSlide();stale.c.SITE_SESSION_GENERATION++;await pending;
  assert.equal(stale.read('ORDER_BANK_RAW_ROWS.length'),0);
  const flexible=setup([{upload_batch_id:7,source_columns:['New field','EWO'],source_data:{'New field':'<unsafe>','EWO':'00123'}}]);
  await flexible.c.loadOrderBankSlide();
  assert.deepEqual(Array.from(flexible.read('ORDER_BANK_DISPLAY_COLUMNS')),['New field','EWO']);
  assert.match(flexible.e('order-bank-table').innerHTML,/&lt;unsafe>/);
  assert.match(flexible.e('order-bank-table').innerHTML,/00123/);
  assert.doesNotMatch(flexible.e('order-bank-total-cells').innerHTML,/Order Qty/);
  assert.match(flexible.e('order-bank-kpis').innerHTML,/>2</);
  console.log('PASS Order Bank: empty result, populated pagination and totals, no filter matches, schema/API errors, session change');
})().catch(e=>{console.error(e);process.exitCode=1;});
