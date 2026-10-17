const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const runtime=fs.readFileSync(__dirname+'/../frontend-runtime.js','utf8');
const html=require('./dashboard-source.js').readDashboardHTML();
function fn(name){const start=html.search(new RegExp('^(?:async )?function '+name+'\\(','m'));assert.ok(start>=0,name);return html.slice(start,html.indexOf('\n}',start)+2);}
function context(options={}){
  const urls=[],events={};
  const window={location:{search:options.perf?'?ekwlPerf=1':''}};window.parent=window;
  const document={addEventListener(name,callback){events[name]=callback;},createElement(){return {remove(){}};},head:{appendChild(node){
    urls.push(node.src);
    queueMicrotask(()=>{
      if(options.failCDN&&node.src.startsWith('https:'))node.onerror();
      else if(options.failAll)node.onerror();
      else{window[node.src.includes('three.min')?'THREE':'html2canvas']=node.src.includes('three.min')?{REVISION:'128'}:()=>{};node.onload();}
    });
  }}};
  const c={window,location:window.location,document,performance,URLSearchParams,setTimeout,clearTimeout,queueMicrotask,
    SITE_SESSION_GENERATION:0,SITE_AUTH_USER:{id:'A'},console};
  vm.createContext(c);vm.runInContext(runtime,c);
  return {c,urls,events};
}
(async()=>{
  const libs=context({failCDN:true,perf:true});
  const a=libs.c.ensureHtml2Canvas(),b=libs.c.ensureHtml2Canvas();assert.equal(a,b);
  const values=await Promise.all([a,b]);assert.equal(values[0],values[1]);
  assert.deepEqual(libs.urls,['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js','html2canvas.min.js']);
  await libs.c.ensureHtml2Canvas();assert.equal(libs.urls.length,2);
  const child=context();child.c.window.parent=libs.c.window;child.c.window.parent.location.origin='same';child.c.location.origin='same';
  assert.equal(child.c.ensureHtml2Canvas(),a);assert.equal(child.urls.length,0);
  assert.equal(libs.c.window.EKWL_TIMINGS[0].name,'library.html2canvas');assert.equal(libs.c.window.EKWL_TIMINGS[0].requests,2);
  const offline=context({failAll:true});await assert.rejects(offline.c.ensureThreeJS(),/load failed/);
  await assert.rejects(offline.c.ensureThreeJS(),/load failed/);assert.equal(offline.urls.length,4);
  console.log('PASS shared library promise, same-origin frame sharing, CDN/local fallback, opt-in marks and retry after failure');

  const settings=context();let reads=0;
  const query=()=>{reads++;return {data:[{item:'T-Shirt',day_1:40}],error:null};};
  const results=await Promise.all([settings.c.readTinySetting('ladder',query),settings.c.readTinySetting('ladder',query)]);
  assert.equal(reads,1);assert.equal(results[0],results[1]);
  await settings.c.readTinySetting('ladder',query);assert.equal(reads,1);
  settings.c.invalidateTinySettings(['ladder']);await settings.c.readTinySetting('ladder',query);assert.equal(reads,2);
  settings.c.SITE_AUTH_USER={id:'B'};await settings.c.readTinySetting('ladder',query);assert.equal(reads,3);
  let resolve;const stale=settings.c.readTinySetting('strength',()=>new Promise(r=>resolve=r));await Promise.resolve();
  settings.c.invalidateTinySettings(['strength']);await settings.c.readTinySetting('strength',query);
  resolve({data:[{old:true}],error:null});await assert.rejects(stale,/superseded/);
  let failed=0;const failure=()=>{failed++;return {error:Error('denied')};};
  await assert.rejects(settings.c.readTinySetting('chassis',failure),/denied/);await assert.rejects(settings.c.readTinySetting('chassis',failure),/denied/);assert.equal(failed,2);
  console.log('PASS tiny settings in-flight/success cache, save invalidation, owner isolation and stale/error eviction');

  const filters=context({perf:true});let calls=[];
  filters.c.CURRENT_SLIDE=7;filters.c.canAccessSlide=()=>true;
  filters.c.renderHome=()=>{calls.push('home');filters.c.recordDashboardRender('home');};
  filters.c.renderSlide=n=>{calls.push(n);filters.c.recordDashboardRender(n);};
  vm.runInContext(fn('applyFilter'),filters.c);
  filters.c.applyFilter();assert.deepEqual(calls,[7]);assert.equal(filters.c.window.EKWL_FILTER_RENDER_COUNT,1);
  calls=[];filters.c.CURRENT_SLIDE=0;filters.c.applyFilter();assert.deepEqual(calls,['home']);
  const element={id:'search',isConnected:true};let count=0;
  const callback=()=>{count++;filters.c.recordDashboardRender('search');};
  filters.c.debounceDashboardInput(element,callback);filters.c.debounceDashboardInput(element,callback);filters.c.debounceDashboardInput(element,callback);
  await new Promise(r=>setTimeout(r,180));assert.equal(count,0);
  await new Promise(r=>setTimeout(r,130));assert.equal(count,1);
  filters.c.debounceDashboardInput(element,callback);filters.c.flushDashboardInput(element,callback);
  await new Promise(r=>setTimeout(r,300));assert.equal(count,2);
  filters.c.debounceDashboardInput(element,callback);filters.c.SITE_SESSION_GENERATION++;
  await new Promise(r=>setTimeout(r,300));assert.equal(count,2);
  assert.ok(filters.c.window.EKWL_TIMINGS.some(t=>t.name==='filter.render'&&t.renders===1));
  console.log('PASS one affected render per applyFilter, 275-ms trailing debounce, immediate flush and session cancellation');

  const actual=fs.readFileSync(__dirname+'/../index.html','utf8');
  assert.match(actual,/<link rel="preconnect" href="https:\/\/rdslpcazdzqjlenbezaf.supabase.co" crossorigin>/);
  const scripts=[...actual.matchAll(/<script([^>]*)src="([^"]+)"/g)];
  const sdk=scripts.findIndex(m=>m[2].includes('@supabase/supabase-js'));
  const main=scripts.findIndex(m=>m[2].includes('dashboard-main.js'));assert.ok(sdk<main);
  assert.match(scripts[sdk][1],/defer/);assert.match(scripts[main][1],/defer/);
  assert.doesNotMatch(scripts.find(m=>m[2].includes('dashboard-theme.js'))[1],/defer|async/);
  assert.ok(actual.indexOf('dashboard-theme.js')<actual.indexOf('<body'));
  assert.doesNotMatch(actual,/<script[^>]*src="[^"]*html2canvas/);
  assert.doesNotMatch(fs.readFileSync(__dirname+'/../order-execution-plan.html','utf8'),/<script[^>]*src="[^"]*three.min/);
  console.log('PASS SDK/runtime dependency order, synchronous head theme, preconnect and no upfront heavy-library tags');
})().catch(error=>{console.error(error);process.exitCode=1;});
