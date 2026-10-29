const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('dashboard-main.js','utf8');
const c={N:v=>Number(v)||0,S12_EM_ROWS:[]};vm.createContext(c);
vm.runInContext(src.slice(src.indexOf('function s12CuttingWipMetric('),src.indexOf('function s12EmbellishmentTotals(')),c);
const cut=new Map([['print',10000],['plain',10000],['emb',10000],['both',10000]]),sew=new Map([['print',{input:4000}],['plain',{input:8000}],['emb',{input:4000}],['both',{input:4000}]]),proc=new Map([['print',{print:true}],['emb',{emb:true}],['both',{print:true,emb:true}]]),moves=new Map([['print',{printSend:8000,printReceive:6000}],['emb',{embSend:8000,embReceive:5000}],['both',{printSend:8000,printReceive:6000,embSend:6000,embReceive:5000}]]);
const metric=keys=>c.s12CuttingWipMetric(keys,cut,sew,proc,moves);
assert.equal(metric(['print']).value,2000);assert.equal(metric(['plain']).value,2000);assert.equal(metric(['emb']).value,1000);
assert.equal(metric(['print','plain']).value,4000);assert.equal(metric(['print','plain','print']).value,4000);
assert.equal(metric(['both']).value,null);assert.match(metric(['both']).reason,/Final process/);
moves.get('print').printSend=9000;assert.equal(metric(['print']).value,2000); // Unsent and sent pieces never inflate received stock.
moves.delete('print');assert.equal(metric(['print']).value,null); // Known requirement with absent report row.
moves.set('print',{printSend:8000,printReceive:0});assert.equal(metric(['print']).value,-4000);assert.match(metric(['print']).reason,/Input exceeds/);
c.S12_EM_ROWS=null;assert.equal(metric(['print','plain']).value,null);
console.log('PASS per-color received Cutting WIP, no-process stock, mixed/unique totals, receipt independence, missing reports and signed anomalies');
