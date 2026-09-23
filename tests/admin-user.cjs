const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync(__dirname+'/../supabase/functions/admin-create-user/index.ts','utf8')).replace(/^import[^\n]+\n/,'').replace('export default','globalThis.edge =');
function setup(role='admin',insertFails=false){
  const writes=[],authCalls=[];
  const admin={id:1,auth_user_id:'admin-id',email:'admin@example.test',role,status:'active'};
  const target={id:2,auth_user_id:'target-id',email:'target@example.test',role:'user',status:'active'};
  const db={from(){let match,operation,payload;
    const q={select(){return q;},eq(k,v){match=[k,v];return q;},update(v){operation='update';payload=v;return q;},insert(v){operation='insert';payload=v;return q;},delete(){operation='delete';return q;},async maybeSingle(){return {data:match[0]==='auth_user_id'?admin:match[0]==='id'?target:null,error:null};},then(resolve,reject){writes.push({operation,payload});return Promise.resolve({error:insertFails?new Error('profile rejected'):null}).then(resolve,reject);}};return q;
  },auth:{admin:{async createUser(v){authCalls.push(['create',v]);return {data:{user:{id:'new-id'}},error:null};},async updateUserById(...v){authCalls.push(['update',...v]);return {error:null};},async deleteUser(...v){authCalls.push(['delete',...v]);return {error:null};}}}};
  const c={Response,console:{error(){}},withSupabase:(options,handler)=>{assert.equal(options.auth,'user');return handler;}};
  vm.createContext(c);vm.runInContext(source,c);
  return {writes,authCalls,call:body=>c.edge.fetch({json:async()=>body},{userClaims:{id:'admin-id',email:admin.email},supabaseAdmin:db})};
}
(async()=>{
  const c=setup();let r=await c.call({action:'create',email:'NEW@example.test',password:'test-password',role:'user',status:'active',permissions:{slide_1:false}});
  assert.equal(r.status,200);assert.equal((await r.json()).auth_user_id,'new-id');
  assert.equal(c.writes[0].payload.permissions.slide_1,false);assert.equal(c.authCalls[0][1].email_confirm,true);
  console.log('PASS SDK userClaims.id authorizes active admin and saves linked permissions on server');
  const denied=setup('user');r=await denied.call({action:'create'});assert.equal(r.status,403);assert.equal(denied.authCalls.length,0);
  console.log('PASS non-admin denied before any Auth mutation');
  const update=setup();r=await update.call({action:'update',site_user_id:2,role:'user',status:'disabled',permissions:{slide_1:true}});
  assert.equal(r.status,200);assert.equal(update.writes[0].payload.status,'disabled');assert.equal(update.authCalls.length,0);
  console.log('PASS update changes profile permissions without resetting password or creating Auth account');
  const failed=setup('admin',true);r=await failed.call({action:'create',email:'new@example.test',password:'test-password'});
  assert.equal(r.status,500);assert.deepEqual(failed.authCalls.map(x=>x[0]),['create','delete']);
  console.log('PASS failed profile write cleans up only newly created Auth account');
  const invalid=setup();r=await invalid.call({action:'surprise'});assert.equal(r.status,400);assert.equal(invalid.authCalls.length,0);
  console.log('PASS unknown action rejected');
})().catch(e=>{console.error(e);process.exitCode=1;});

