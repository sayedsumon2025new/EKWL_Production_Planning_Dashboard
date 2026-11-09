const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={document:{addEventListener(){},getElementById(){return null;}},window:{addEventListener(){}}};vm.createContext(c);vm.runInContext(fs.readFileSync('rfd-converter.js','utf8'),c);
const evidence={source:'rfd',original_ewo:'271080',original_color:'C. Navy',details:'<original>',construction:'Single Jersey',composition:'100% Cotton',rows:[2],matched:false};
const issue={id:'a'.repeat(64),ewo:'271080',issue:'name',records:[evidence],context:[evidence],editable:[{source:'rfd',from_color:'C. Navy'}],targets:['Carbon Navy'],review_sources:['rfd']};
const data={issues:[issue],mappings:[],sources:Object.fromEntries(['orderbank','booking','rfd'].map(s=>[s,{head:{id:s},status:'Complete',rows:1}])),can_approve:true,integrity:{complete:true,issue_count:1,digest:'b'.repeat(64)}};
assert.equal(c.verifyRfdConverter(data),data);
for(const mutate of [v=>v.integrity.complete=false,v=>v.integrity.issue_count=2,v=>v.integrity.digest='bad',v=>delete v.sources.rfd,v=>v.sources.rfd.head=null,v=>v.issues[0].records[0].original_color=123,v=>v.issues[0].context[0].rows=[0],v=>{v.issues.push(structuredClone(issue));v.integrity.issue_count=2;}]){const bad=structuredClone(data);mutate(bad);assert.throws(()=>c.verifyRfdConverter(bad));}
assert(!fs.readFileSync('rfd-converter.js','utf8').match(/\bRC_TOKEN\b/));
console.log('PASS converter source receipt, duplicate identity, original type and completeness guards; isolated state namespace');
