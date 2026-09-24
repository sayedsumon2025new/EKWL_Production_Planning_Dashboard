const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
function fn(name){const start=html.search(new RegExp('^(?:async )?function '+name+'\\(','m'));assert.ok(start>=0,name);return html.slice(start,html.indexOf('\n}',start)+2);}
function context(c,names){vm.createContext(c);for(const n of names)vm.runInContext(fn(n),c);return c;}
(async()=>{
  let release;const gate=new Promise(r=>release=r);
  const c=context({ACTIVE_PLAN_UPLOAD:{id:'A'},SITE_SESSION_GENERATION:0,EFF15_METRIC_UPLOAD_ID:null,EFF15_METRIC_DAILY:[],PLAN_VERSION_CACHE:new Map(),fetchPlanningSnapshot:async()=>{await gate;return {EFF15_METRIC_DAILY:[{ewo:'A'}]};}},['loadEff15ExactMetricSource']);
  const p=c.loadEff15ExactMetricSource();c.ACTIVE_PLAN_UPLOAD={id:'B'};release();assert.equal(await p,false);assert.equal(c.EFF15_METRIC_DAILY.length,0);
  c.EFF15_METRIC_UPLOAD_ID='B';c.fetchPlanningSnapshot=()=>{throw Error('Unexpected duplicate SQL fetch');};assert.equal(await c.loadEff15ExactMetricSource(),true);
  console.log('PASS stale Slide 15 request discarded; current snapshot avoids repeat download');
  let cleared,removed=[];const l=context({dashboardCacheKey:()=> 'user-A',fastBootCacheKey:()=> 'fast-A',SITE_SESSION_GENERATION:0,SUPABASE_LOAD_TOKEN:0,PLAN_FILTER_TOKEN:0,EFF15_FR_TOKEN:0,DATA:[1],PLAN_VERSION_CACHE:new Map([['A',1]]),SITE_AUTH_USER:{id:'A'},SITE_USER_PROFILE:{},SITE_BOOTED:true,SB:{auth:{signOut:async()=>{}}},clearDashboardCache:async key=>cleared=key,sessionStorage:{removeItem:k=>removed.push(k)},indexedDB:{deleteDatabase:k=>removed.push(k)},document:{getElementById:()=>({value:''})},showSiteLogin(){},console},['siteLogout']);
  await l.siteLogout();assert.equal(l.DATA.length,0);assert.equal(l.PLAN_VERSION_CACHE.size,0);assert.equal(l.SUPABASE_LOAD_TOKEN,1);assert.equal(l.SITE_AUTH_USER,null);assert.equal(cleared,'user-A');assert.ok(removed.includes('fast-A'));
  console.log('PASS logout invalidates in-flight loads and clears account data/cache');
  const keys=context({SITE_AUTH_USER:{id:'A'},SUPABASE_URL:'project',FAST_BOOT_KEY:'v3'},['dashboardCacheOwner','dashboardCacheKey','fastBootCacheKey']);
  const keyA=keys.fastBootCacheKey();keys.SITE_AUTH_USER={id:'B'};assert.notEqual(keys.fastBootCacheKey(),keyA);
  console.log('PASS cache names isolate users');
  let renders=[];const r=context({document:{getElementById:()=>null,querySelector:()=>null},CURRENT_SLIDE:7,canAccessSlide:()=>true,renderHome:()=>renders.push('home'),renderSlide:n=>renders.push(n),console},['renderAll','refreshPermittedSlides']);
  r.renderAll();assert.deepEqual(renders,['home',7]);renders=[];r.refreshPermittedSlides('planning');assert.deepEqual(renders,[7]);
  console.log('PASS hidden slides do not render during load');
  const button={style:{display:'inline-block'},dataset:{},textContent:'Export'};let isAdmin=false;
  const perm=context({SITE_USER_PROFILE:{},siteIsAdmin:()=>isAdmin,siteHasPerm:()=>true,CURRENT_SLIDE:0,canAccessSlide:()=>true,document:{getElementById:()=>null,querySelectorAll:s=>s==='button'?[button]:s==='[data-permission-hidden="1"]'&&button.dataset.permissionHidden==='1'?[button]:[]}},['applySitePermissions']);
  perm.applySitePermissions();assert.equal(button.style.display,'none');isAdmin=true;perm.applySitePermissions();assert.equal(button.style.display,'inline-block');
  console.log('PASS Admin login restores controls hidden for previous user');
})().catch(e=>{console.error(e);process.exitCode=1;});

