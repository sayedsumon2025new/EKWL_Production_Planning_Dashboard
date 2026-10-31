/* Same-origin PDO API adapter. No external SDK, database key or browser bearer token. */
(()=>{
  'use strict';
  function createClient(){
    const endpoint=new URL('api/index.php',document.baseURI);
    let csrf='',session=null,initial=null;
    const listeners=new Set();
    const request=async(route,payload,method='POST')=>{
      let readTimer,readController;
      try{
        if(method==='POST'&&!csrf)await bootstrap();
        const url=new URL(endpoint);url.searchParams.set('route',route);
        const multipart=typeof FormData!=='undefined'&&payload instanceof FormData;
        const readOnly=method==='GET'||['planning/snapshot','reports/snapshot'].includes(route)||(route==='query'&&(payload?.op||'select')==='select');
        if(readOnly&&typeof AbortController!=='undefined'&&typeof setTimeout==='function'){
          readController=new AbortController();readTimer=setTimeout(()=>readController.abort(),60000);
        }
        const response=await fetch(url,{...(readController?{signal:readController.signal}:{}),method,credentials:'same-origin',cache:'no-store',
          headers:method==='GET'?{}:{'X-CSRF-Token':csrf,...(multipart?{}:{'Content-Type':'application/json'})},
          ...(method==='POST'?{body:multipart?payload:JSON.stringify(payload??{})}:{})});
        const requestId=response.headers?.get?.('X-Request-ID');
        const contentType=response.headers?.get?.('Content-Type');
        if(contentType&&!contentType.includes('application/json'))throw Error('MySQL returned a non-JSON response (HTTP '+response.status+').'+(requestId?' Request ID: '+requestId:''));
        let result;
        try{result=await response.json();}catch(error){
          if(readController?.signal.aborted)throw error;
          throw Error('MySQL response was incomplete or invalid (HTTP '+response.status+').'+(requestId?' Request ID: '+requestId:''));
        }
        if(result.data?.csrf)csrf=result.data.csrf;
        if(result.error){
          result.error.status=response.status;
          if(response.status===401&&!route.startsWith('auth/')&&session){session=null;csrf='';initial=null;queueMicrotask(()=>listeners.forEach(fn=>fn('SESSION_EXPIRED',null)));}
          return result;
        }
        return result;
      }catch(error){return {data:null,error:{message:readController?.signal.aborted?'MySQL read timed out. No incomplete report was loaded. Retry.':error.message||'API connection failed.'}};}
      finally{if(readTimer)clearTimeout(readTimer);}
    };
    async function bootstrap(){
      if(!initial)initial=(async()=>{
        const result=await request('auth/session',undefined,'GET');
        if(result.error){initial=null;return result;}
        session=result.data.session;
        const token=new URL(location.href).searchParams.get('token');
        if(token){
          const recovery=await request('auth/recovery',{token});
          if(recovery.error)return recovery;
          session=recovery.data.session;
          // Remove the secret from URL/history immediately; it remains in the PHP session.
          const url=new URL(location.href);url.searchParams.delete('token');history.replaceState({},'',url.pathname+url.search+url.hash);
          listeners.forEach(fn=>fn('PASSWORD_RECOVERY',session));
        }
        return {data:{session},error:null};
      })();
      return initial;
    }
    class Query{
      constructor(table,name,args){this.q=table?{table,op:'select'}:{name,args};this.route=table?'query':'rpc';this.q.filters=[];this.q.orders=[];this.promise=null;}
      select(fields='*'){this.q.fields=fields;return this;}
      insert(rows){this.q.op='insert';this.q.rows=Array.isArray(rows)?rows:[rows];return this;}
      upsert(rows){this.q.op='upsert';this.q.rows=Array.isArray(rows)?rows:[rows];return this;}
      update(values){this.q.op='update';this.q.values=values;return this;}
      delete(){this.q.op='delete';return this;}
      eq(key,value){this.q.filters.push(['eq',key,value]);return this;}
      in(key,value){this.q.filters.push(['in',key,value]);return this;}
      ilike(key,value){this.q.filters.push(['ilike',key,value]);return this;}
      order(key,options={}){this.q.orders.push([key,options.ascending!==false]);return this;}
      range(from,to){this.q.offset=from;this.q.limit=to-from+1;return this;}
      limit(value){this.q.limit=value;return this;}
      single(){this.q.single='required';this.q.limit=2;return this;}
      maybeSingle(){this.q.single='optional';this.q.limit=2;return this;}
      then(resolve,reject){
        if(!this.promise)this.promise=this.execute();return this.promise.then(resolve,reject);
      }
      async execute(){
        if(this.route==='rpc'&&this.q.name==='ekwl_save_report'&&this.q.args.p_kind!=='chassis'){
          const args=this.q.args;
          const begin=await request('imports',{action:'begin',kind:args.p_kind,expected_rows:args.p_rows.length,replace:args.p_replace});
          if(begin.error)return begin;const id=begin.data.id;
          // Preserve the job ID locally so interrupted work is discoverable in Import Management.
          try{sessionStorage.setItem('ekwl-import:'+id,JSON.stringify({kind:args.p_kind,rows:args.p_rows.length}));}catch(_){}
          for(let i=0;i<args.p_rows.length;i+=150){
            let result;
            for(let attempt=0;attempt<2;attempt++){
              result=await request('imports',{action:'chunk',id,chunk_no:i/150,rows:args.p_rows.slice(i,i+150)});
              if(!result.error||result.error.status&&result.error.status<500)break;
            }
            if(result.error)return {...result,error:{...result.error,message:result.error.message+' · Recoverable import ID: '+id}};
          }
          const result=await request('imports',{action:'finalize',id});
          if(!result.error)try{sessionStorage.removeItem('ekwl-import:'+id);}catch(_){}
          return result;
        }
        return request(this.route,this.q);
      }
    }
    const auth={
      getSession:()=>bootstrap(),
      async getUser(){const r=await request('auth/session',undefined,'GET');return {data:{user:r.data?.session?.user??null},error:r.error};},
      onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe(){listeners.delete(fn);}}}};},
      async signInWithPassword(args){const r=await request('auth/login',args);if(!r.error){session=r.data.session;initial=Promise.resolve({data:{session},error:null});listeners.forEach(fn=>fn('SIGNED_IN',session));}return {data:{session,user:session?.user},error:r.error};},
      async signOut(){const r=await request('auth/logout',{});session=null;initial=null;listeners.forEach(fn=>fn('SIGNED_OUT',null));return r;},
      resetPasswordForEmail:(email)=>request('auth/reset-request',{email}),
      updateUser:(args)=>request('auth/password',args)
    };
    return {from:name=>new Query(name),rpc:(name,args)=>new Query(null,name,args),auth,
      functions:{invoke:(name,options)=>name==='admin-create-user'?request('users',options.body):Promise.resolve({data:null,error:{message:'Unsupported user operation.'}})},
      storage:{from:bucket=>({upload:async(path,file)=>{if(bucket!=='plan-data')return {data:null,error:{message:'Unsupported file store.'}};const form=new FormData();form.append('file',file);return request('files/upload',form);}})},
      reportSnapshot:(kind,options={})=>request('reports/snapshot',{...options,kind}),
      planningSnapshot:uploadId=>request('planning/snapshot',{upload_id:String(uploadId)}),
      request,endpoint:endpoint.href};
  }
  window.EKWLData=Object.freeze({createClient});
})();
