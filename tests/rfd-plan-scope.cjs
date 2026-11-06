const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements={'planning-sequence-filter':{value:'p1'}};
const c={document:{body:{dataset:{planningState:'ready'}},getElementById:id=>elements[id]||null},ACTIVE_PLAN_UPLOAD:{id:'p1',file_name:'Plan 1'},DATA:[{ewo:'271080',color:'Blue'},{ewo:'001234',color:'Black'}],EFF15_METRIC_UPLOAD_ID:'p1',SITE_AUTH_USER:{id:'owner'},SITE_SESSION_GENERATION:1,canAccessSlide:()=>true};vm.createContext(c);vm.runInContext(fs.readFileSync('rfd-plan-scope.js','utf8'),c);
const snap=JSON.stringify(c.DATA),s=c.getRfdPlanScope();assert(s.ready);assert(s.matches('271080'));assert(s.matches('271080-FBR'));assert(s.matches('EWO 001234 revised'));assert(!s.matches('1234'));assert(!s.matches('271081'));assert(!s.matches('1234567'));assert(!s.matches(''));assert(s.matches('271080 / 001234'));assert(!s.matches('271080 / 271081'));assert.equal(c.getRfdPlanScope(),s);assert.equal(JSON.stringify(c.DATA),snap);
// Membership uses EWO only; Color is deliberately irrelevant.
c.DATA=[{ewo:'271080',color:'Different color'}];assert(c.getRfdPlanScope().matches('271080'));
for(const state of ['loading','error','']){c.document.body.dataset.planningState=state;assert(!c.getRfdPlanScope().matches('271080'));}
c.document.body.dataset.planningState='ready';elements['planning-sequence-filter'].value='p2';assert(!c.getRfdPlanScope().ready);c.ACTIVE_PLAN_UPLOAD={id:'p2'};assert(!c.getRfdPlanScope().ready);c.EFF15_METRIC_UPLOAD_ID='p2';c.DATA=[{ewo:'272205'}];assert(c.getRfdPlanScope().matches('272205'));assert(!c.getRfdPlanScope().matches('271080'));
elements['planning-sequence-filter'].value='';assert(!c.getRfdPlanScope().ready);elements['planning-sequence-filter'].value='p2';c.DATA=[];assert(c.getRfdPlanScope().ready);assert.equal(c.getRfdPlanScope().ewos.size,0);assert(!c.getRfdPlanScope().matches('272205'));
c.SITE_AUTH_USER=null;assert(!c.getRfdPlanScope().ready);c.SITE_AUTH_USER={id:'next-owner'};c.canAccessSlide=()=>false;assert(!c.getRfdPlanScope().ready);
console.log('PASS selected-plan identity, verified upload/rows, all colors by EWO, suffixes/leading zeros, conservative mixed identifiers, loading/error/empty/permission fences and cache invalidation');
// Explicit All is independent of planning readiness, but never of actor permission.
c.canAccessSlide=()=>true;c.SITE_AUTH_USER={id:'mode-owner'};c.ACTIVE_PLAN_UPLOAD={id:'modes'};elements['planning-sequence-filter'].value='modes';c.EFF15_METRIC_UPLOAD_ID='modes';c.DATA=[{ewo:'271080',color:'Blue'}];c.document.body.dataset.planningState='ready';
c.setRfdPlanMode('without');let scope=c.getRfdPlanScope();assert.equal(scope.mode,'without');assert(!scope.matches('271080'));assert(scope.matches('272205-FBR'));assert(!scope.matches('271080 / 272205'));assert(!scope.matches(''));
c.setRfdPlanMode('all');scope=c.getRfdPlanScope();assert(scope.ready);for(const value of ['271080','272205','271080 / 272205',''])assert(scope.matches(value));
c.document.body.dataset.planningState='loading';assert(c.getRfdPlanScope().matches('271080'));elements['planning-sequence-filter'].value='';c.ACTIVE_PLAN_UPLOAD=null;assert(c.getRfdPlanScope().matches(''));
c.setRfdPlanMode('without');assert(!c.getRfdPlanScope().ready);assert(!c.rfdPlanExportAllowed());c.setRfdPlanMode('all');assert(c.rfdPlanExportAllowed());
c.canAccessSlide=()=>false;assert(!c.getRfdPlanScope().matches('271080'));c.canAccessSlide=()=>true;c.SITE_SESSION_GENERATION++;assert.equal(c.getRfdPlanScope().mode,'within');assert(!c.getRfdPlanScope().ready);
c.setRfdPlanMode('invalid');assert.equal(c.getRfdPlanScope().mode,'within');
console.log('PASS Within/Without/All modes; suffixes, conservative mixed/blank identifiers, explicit All without a plan, scope caching, export readiness, actor permissions and session reset');
