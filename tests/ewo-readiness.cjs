const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../ewo-readiness.js','utf8');
function setup(options={}){
  const calls=[];
  const c={console,SITE_SESSION_GENERATION:1,SITE_AUTH_USER:{id:'user'},ACTIVE_PLAN_UPLOAD:{id:'A'},
    PLAN_UPLOAD_CATALOG:[],canAccessSlide:()=>c.allowed,allowed:true,
    document:{getElementById:()=>null,addEventListener(){}},esc:String};
  c.SB={from(table){
    const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},order(){return q;},
      limit(){return Promise.resolve({data:[{id:'latest'}],error:null});},
      async range(start,end){
        calls.push({table,filters:{...filters},start,end});
        if(options.before)await options.before(table,filters,start);
        if(options.fail&&start>=1000)return {data:null,error:Error('page failed')};
        const count=options.count??1;
        return {data:Array.from({length:Math.max(0,Math.min(count-start,end-start+1))},(_,i)=>({
          ewo:String(start+i),upload_id:filters.upload_id,sewing_status:'green',readiness_score:100
        })),error:null};
      }};return q;
  }};
  vm.createContext(c);vm.runInContext(source,c);
  vm.runInContext('snapshot=()=>JSON.parse(JSON.stringify({rows:RD_ROWS,upload:RD_UPLOAD_ID,busy:RD_BUSY,error:RD_ERROR}));',c);
  return {c,calls};
}
(async()=>{
  const {c,calls}=setup({count:1001});await c.loadEWOReadinessBoard();
  assert.equal(c.snapshot().rows.length,1001);assert.equal(calls.length,2);
  assert.equal(calls[0].filters.upload_id,'A');assert.equal(c.snapshot().busy,false);
  assert.equal(c.rdFmt(null),'—');assert.equal(c.rdFmt(0),'0');assert.equal(c.rdFmt('invalid'),'—');
  assert.match(c.rdLight('evil'),/Unknown/);assert.match(c.rdRisk('evil'),/Unknown/);
  let release;const wait=new Promise(resolve=>release=resolve);
  const stale=setup({before:async(_table,filter)=>{if(filter.upload_id==='A')await wait;}});
  const old=stale.c.loadEWOReadinessBoard();stale.c.ACTIVE_PLAN_UPLOAD={id:'B'};
  await stale.c.loadEWOReadinessBoard();release();await old;
  assert.equal(stale.c.snapshot().rows[0].upload_id,'B');
  const failed=setup({count:1001,fail:true});await failed.c.loadEWOReadinessBoard();
  assert.equal(failed.c.snapshot().rows.length,0);assert.match(failed.c.snapshot().error,/page failed/);
  let unlock;const delayed=new Promise(resolve=>unlock=resolve);
  const logout=setup({before:()=>delayed});const pending=logout.c.loadEWOReadinessBoard();
  logout.c.SITE_SESSION_GENERATION++;logout.c.SITE_AUTH_USER=null;logout.c.resetEWOReadinessBoard();
  unlock();await pending;assert.equal(logout.c.snapshot().rows.length,0);assert.equal(logout.c.snapshot().busy,false);
  const forbidden=setup();forbidden.c.allowed=false;await forbidden.c.loadEWOReadinessBoard();assert.equal(forbidden.calls.length,0);
  const fallback=setup();fallback.c.ACTIVE_PLAN_UPLOAD=null;await fallback.c.loadEWOReadinessBoard();
  assert.equal(fallback.calls[0].filters.upload_id,'latest');
  console.log('PASS readiness pagination, zero/missing formatting, upload/session races, failed-page isolation, permission gate and latest-upload fallback');
})().catch(error=>{console.error(error);process.exitCode=1;});
