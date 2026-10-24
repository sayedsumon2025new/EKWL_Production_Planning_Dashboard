/* Staging account, private Notes and Admin archive/recovery controls. */
(()=>{
  'use strict';
  const el=(tag,text,props={})=>Object.assign(document.createElement(tag),props,text===undefined?{}:{textContent:text});
  let dialog,status,content;
  async function api(route,data){const r=await SB.request(route,data);if(r.error)throw Error(r.error.message);return r.data;}
  const button=(text,fn)=>{const b=el('button',text,{type:'button',className:'pg-btn'});b.onclick=()=>Promise.resolve().then(fn).catch(error=>status.textContent=error.message);return b;};
  function section(title){content.replaceChildren(el('h3',title));status.textContent='';}
  async function notes(){
    section('Private Planning Notes');
    content.append(el('p','These new notes are private to your migrated account. The existing Notes module has not been imported.'));
    const title=el('input',undefined,{placeholder:'Title',maxLength:255}),body=el('textarea',undefined,{placeholder:'Note',rows:6});
    const list=el('div');content.append(title,body,button('Save note',async()=>{await api('notes',{action:'save',title:title.value,content:body.value});await notes();}),list);
    const data=await api('notes',{action:'list'});
    for(const note of data.notes){
      const item=el('article');item.append(el('h4',note.title),el('p',note.content));
      item.append(button('Edit',()=>{title.value=note.title;body.value=note.content;
        item.append(button('Save changes',async()=>{await api('notes',{action:'save',id:note.id,title:title.value,content:body.value});await notes();}));
      }));
      item.append(button('Delete',async()=>{if(confirm('Delete this private note?')){await api('notes',{action:'delete',id:note.id});await notes();}}));list.append(item);
    }
  }
  function password(){
    section('Change password');const current=el('input',undefined,{type:'password',placeholder:'Current password',autocomplete:'current-password'}),next=el('input',undefined,{type:'password',placeholder:'New password (12+ characters)',autocomplete:'new-password'});
    content.append(current,next,button('Change password and sign out',async()=>{await api('auth/password',{current_password:current.value,password:next.value});await siteLogout();dialog.close();}));
  }
  async function recovery(){
    section('Admin · Password reset / activation');
    const requests=await api('users',{action:'requests'});content.append(el('p','Pending reset requests: '+requests.requests.length));
    const users=await SB.from('site_users').select('id,email,status');if(users.error)throw Error(users.error.message);
    for(const user of users.data){const row=el('p',user.email+' · '+user.status+' ');row.append(button('Issue 30-minute reset link',async()=>{
      const result=await api('users',{action:'reset-link',site_user_id:user.id});const link=el('textarea',undefined,{readOnly:true,value:result.url,rows:3});row.append(link);status.textContent='Share this one-use link through a trusted private channel. It is not emailed automatically.';
    }));content.append(row);}
  }
  async function archives(){
    section('Admin · Quarterly Archive Management');
    content.append(el('p','Exports preserve source records. Pause writes before starting an export. Cleanup is disabled until a separately reviewed restore and deletion procedure is approved.'));
    const quarter=el('input',undefined,{placeholder:'2026-Q4',value:'2026-Q4'}),result=el('pre');
    content.append(quarter,button('Estimate rows',async()=>{result.textContent=JSON.stringify(await api('archive',{action:'estimate',quarter:quarter.value}),null,2);}),button('Start or resume quarter',async()=>{
      const data=await api('archive',{action:'begin',quarter:quarter.value});status.textContent='Archive ID: '+(data.id||data.job.id);await archives();
    }),result);
    const data=await api('archive',{action:'list'});
    for(const job of data.jobs){
      const row=el('article');row.append(el('h4',job.quarter+' · '+job.state));
      row.append(button('Export next batch',async()=>{const value=await api('archive',{action:'step',id:job.id});status.textContent=value.state;await archives();}));
      row.append(button('Verify checksums and counts',async()=>{await api('archive',{action:'verify',id:job.id});await archives();}));
      const manifest=JSON.parse(job.manifest);
      if(['exported','verified'].includes(job.state))for(const file of ['manifest.json',...manifest.files.map(f=>f.name)]){
        const url=new URL(SB.endpoint);url.searchParams.set('route','archive/download');url.searchParams.set('id',job.id);url.searchParams.set('file',file);
        row.append(el('a','Download '+file,{href:url.href,download:file}));
      }
      content.append(row);
    }
  }
  async function imports(){
    section('Import recovery');content.append(el('p','Enter the import ID from an interrupted report upload. Staged rows remain hidden until finalization. Retrying the same chunk is safe.'));
    const id=el('input',undefined,{placeholder:'Import ID'}),result=el('pre');
    content.append(id,button('Check received chunks',async()=>{result.textContent=JSON.stringify(await api('imports',{action:'status',id:id.value}),null,2);}),button('Finalize verified import',async()=>{result.textContent=JSON.stringify(await api('imports',{action:'finalize',id:id.value}),null,2);}),button('Abort incomplete import',async()=>{result.textContent=JSON.stringify(await api('imports',{action:'abort',id:id.value}),null,2);}),result);
  }
  window.openMySQLTools=async()=>{
    if(!SITE_AUTH_USER)return;
    const nav=dialog.querySelector('nav');nav.replaceChildren(button('My Notes',notes),button('Password',password),button('Import recovery',imports));
    if(SITE_USER_PROFILE?.role==='admin')nav.append(button('Reset / activation',recovery),button('Quarterly archives',archives),button('Runtime check',async()=>{section('Hosting runtime');content.append(el('pre',JSON.stringify(await api('runtime',{}),null,2)));}));
    dialog.showModal();try{await notes();}catch(error){status.textContent=error.message;}
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const anchor=document.getElementById('site-user-pill');if(!anchor)return;
    const launch=button('Account & Data',()=>openMySQLTools());anchor.before(launch);
    dialog=el('dialog',undefined,{id:'mysql-tools'});dialog.style.cssText='width:min(900px,92vw);max-height:85vh;overflow:auto;background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:20px';
    const close=button('Close',()=>dialog.close());status=el('p',undefined,{role:'status'});content=el('section');const nav=el('nav');nav.style.cssText='display:flex;gap:8px;flex-wrap:wrap';dialog.append(close,el('h2','Account & Data'),nav,status,content);document.body.append(dialog);
    const style=el('style');style.textContent='#mysql-tools input,#mysql-tools textarea{display:block;width:95%;padding:8px;margin:8px 0;background:var(--card);color:var(--text);border:1px solid var(--border)}#mysql-tools article{border-bottom:1px solid var(--border);padding:10px 0}#mysql-tools a{display:block;margin:6px 0}#mysql-tools pre{white-space:pre-wrap;overflow-wrap:anywhere}';document.head.append(style);
  });
})();
