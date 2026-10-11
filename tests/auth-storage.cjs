const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const start=html.indexOf('function createResilientAuthStorage(');
const source=html.slice(start,html.indexOf('\nconst SB =',start));
const c={console:{warn(){}}};vm.createContext(c);vm.runInContext(source,c);
function storage(block=false){const m=new Map();return {m,getItem:k=>m.get(k)??null,setItem(k,v){if(block)throw Error('QuotaExceededError');m.set(k,v)},removeItem:k=>m.delete(k)}}
for(const [localBlocked,sessionBlocked] of [[false,false],[true,false],[true,true]]){
 const root={localStorage:storage(localBlocked),sessionStorage:storage(sessionBlocked)};
 root.localStorage.m.set('auth','old');root.localStorage.m.set('unrelated','keep');
 let s=c.createResilientAuthStorage(root);s.setItem('auth','new');assert.equal(s.getItem('auth'),'new');
 if(!sessionBlocked){s=c.createResilientAuthStorage(root);assert.equal(s.getItem('auth'),'new')}
 s.removeItem('auth');assert.equal(s.getItem('auth'),null);assert.equal(root.localStorage.m.get('unrelated'),'keep');
 assert.equal(c.createResilientAuthStorage(root).getItem('auth'),null);
}
const blocked={};for(const name of ['localStorage','sessionStorage'])Object.defineProperty(blocked,name,{get(){throw Error('SecurityError')}});
const s=c.createResilientAuthStorage(blocked);s.setItem('auth','new');assert.equal(s.getItem('auth'),'new');s.removeItem('auth');assert.equal(s.getItem('auth'),null);
let count=0;for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(match[1].trim()){new vm.Script(match[1]);count++}}
console.log('PASS normal, local quota, both quotas, blocked storage, refresh, logout, unrelated data; '+count+' inline scripts parse');
