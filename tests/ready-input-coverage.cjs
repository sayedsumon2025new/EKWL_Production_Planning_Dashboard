const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../ready-input-coverage.js','utf8');
function setup(options={}){
 const calls=[];const c={console,SITE_SESSION_GENERATION:1,SITE_AUTH_USER:{id:'user'},ACTIVE_PLAN_UPLOAD:{id:'A'},allowed:true,
   canAccessSlide:()=>c.allowed,document:{getElementById:()=>null,addEventListener(){}},esc:String,
   rdFmt:v=>v==null?'—':String(v),validDate:v=>/^\d{4}-\d{2}-\d{2}$/.test(v)};
 c.SB={from(table){const filters={};const q={select:()=>q,eq(k,v){filters[k]=v;return q;},order:()=>q,
   limit:async()=>({data:table==='plan_uploads'?[{id:'latest'}]:[{output_date:'2026-10-11'}],error:null}),
   async range(start,end){calls.push({table,filters:{...filters},start,end});if(options.before)await options.before(filters,start);
     if(options.fail&&start>=1000)return {data:null,error:Error('Failed page')};
     return {data:Array.from({length:Math.max(0,Math.min((options.count??1)-start,end-start+1))},(_,i)=>({ewo:String(start+i),upload_id:filters.upload_id})),error:null};}};return q;}};
 c.SB.rpc=(_name,args)=>c.SB.from('ready_input_coverage').eq('upload_id',args.p_upload_id);
 vm.createContext(c);vm.runInContext(source,c);vm.runInContext('snapshot=()=>JSON.parse(JSON.stringify({rows:RC_ROWS,busy:RC_BUSY,error:RC_ERROR,cutoff:RC_CUTOFF}));',c);return {c,calls};
}
(async()=>{
 const x=setup({count:1001});await x.c.loadReadyInputCoverage();assert.equal(x.c.snapshot().rows.length,1001);assert.equal(x.calls.length,2);assert.equal(x.calls[0].filters.upload_id,'A');
 assert.equal(x.c.rcDateOffset('2026-12-31',1),'2027-01-01');assert.equal(x.c.rcDateOffset('2024-02-28',1),'2024-02-29');
 assert.match(x.c.rcDayCell({day1_status:'green',day1_plan:100},1),/rc-green/);
 assert.match(x.c.rcDayCell({day1_status:'red',day1_plan:100},1),/rc-red/);
 assert.match(x.c.rcDayCell({day1_status:'bad',day1_plan:null},1),/rc-unknown.*No plan data/);
 assert.match(x.c.rcDayCell({day1_status:'green',day1_plan:0,day1_off:true},1),/Off-day/);
 let release;const gate=new Promise(r=>release=r);const race=setup({before:async(f)=>{if(f.upload_id==='A')await gate;}});
 const pending=race.c.loadReadyInputCoverage();race.c.ACTIVE_PLAN_UPLOAD={id:'B'};await race.c.loadReadyInputCoverage();release();await pending;
 assert.equal(race.c.snapshot().rows[0].upload_id,'B');
 const failure=setup({count:1001,fail:true});await failure.c.loadReadyInputCoverage();assert.equal(failure.c.snapshot().rows.length,0);assert.match(failure.c.snapshot().error,/Failed page/);
 let unlock;const wait=new Promise(r=>unlock=r);const logout=setup({before:()=>wait});const loading=logout.c.loadReadyInputCoverage();
 logout.c.SITE_SESSION_GENERATION++;logout.c.SITE_AUTH_USER=null;logout.c.resetReadyInputCoverage();unlock();await loading;assert.equal(logout.c.snapshot().rows.length,0);assert.equal(logout.c.snapshot().cutoff,'');
 const forbidden=setup();forbidden.c.allowed=false;await forbidden.c.loadReadyInputCoverage();assert.equal(forbidden.calls.length,0);
 console.log('PASS coverage pagination, cumulative day classes, calendar boundaries, no-plan/off-day labels, stale upload/logout, failed-page isolation and permissions');
})().catch(e=>{console.error(e);process.exitCode=1;});
