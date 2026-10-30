const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const calls=[];
const context={queueMicrotask,window:{},document:{baseURI:'https://fixture.test/ekwl-staging/index.html'},location:{href:'https://fixture.test/ekwl-staging/index.html'},URL,URLSearchParams,FormData,history:{replaceState(){}},sessionStorage:{setItem(){},removeItem(){}},
fetch:async(url,options)=>{
  const route=url.searchParams.get('route'),payload=options.body&&typeof options.body==='string'?JSON.parse(options.body):null;
  calls.push({route,options,payload,url:String(url)});
  let data;
  if(route==='auth/session')data={csrf:'fixture-csrf',session:{user:{id:'fixture',email:'fixture@example.invalid'},access_token:'cookie-session'}};
  else if(route==='query'&&payload.table==='expire-fixture')return {status:401,json:async()=>({data:null,error:{message:'Session expired'}})};
  else if(route==='query')return {status:200,json:async()=>({data:[{ewo:'00123'}],error:null})};
  else if(route==='imports')data=payload.action==='begin'?{id:'fixture-job'}:payload.action==='finalize'?{success:true,inserted_rows:301}:{received_rows:Math.min((payload.chunk_no+1)*150,301)};
  else data={success:true};
  return {status:200,json:async()=>({data,error:null})};
}};
vm.createContext(context);vm.runInContext(fs.readFileSync('mysql-api-client.js','utf8'),context);
(async()=>{
 const api=context.window.EKWLData.createClient();
 assert.ok((await api.auth.getSession()).data.session.user);
 const result=await api.from('plan_records').select('ewo').eq('upload_id','version').order('source_row').range(1000,1999);
 assert.equal(result.data[0].ewo,'00123');
 const query=calls.at(-1);assert.equal(query.payload.offset,1000);assert.equal(query.payload.limit,1000);
 assert.equal(query.options.credentials,'same-origin');assert.equal(query.options.headers['X-CSRF-Token'],'fixture-csrf');assert.ok(query.url.startsWith('https://fixture.test/ekwl-staging/api/index.php'));
 assert.deepEqual(JSON.parse(JSON.stringify(query.payload.filters)),[['eq','upload_id','version']]);
 await api.planningSnapshot('version');assert.equal(calls.at(-1).route,'planning/snapshot');assert.equal(calls.at(-1).payload.upload_id,'version');
 await api.reportSnapshot('fabric');assert.equal(calls.at(-1).route,'reports/snapshot');assert.equal(calls.at(-1).payload.kind,'fabric');
 await api.rpc('ekwl_save_report',{p_kind:'production',p_replace:true,p_rows:Array.from({length:301},(_,i)=>({ewo:String(i),total_qty:1}))});
 const imports=calls.filter(c=>c.route==='imports');assert.equal(imports.length,5);assert.deepEqual(imports.slice(1,4).map(c=>c.payload.rows.length),[150,150,1]);
 assert.equal(imports.at(-1).payload.action,'finalize');
 assert.ok(!calls.some(c=>c.url.includes('supabase.co')));
 const invoke=await api.functions.invoke('admin-create-user',{body:{action:'update',site_user_id:1}});assert.ok(invoke.data.success);
 const events=[];api.auth.onAuthStateChange(e=>events.push(e));await api.from('expire-fixture').select();await Promise.resolve();assert.ok(events.includes('SESSION_EXPIRED'));
 console.log('PASS same-origin cookie/CSRF adapter, query paging/filter semantics, chunked report transport and local user operations; no hosted-service calls');
})().catch(e=>{console.error(e);process.exitCode=1});
