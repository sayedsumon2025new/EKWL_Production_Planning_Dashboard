const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const main=fs.readFileSync('dashboard-main.js','utf8'),start=main.indexOf('function parseRecords('),parse=main.slice(start,main.indexOf('\n}',start)+2);
const c={document:{addEventListener(){},getElementById(){return null;}},console};vm.createContext(c);vm.runInContext(parse+'\n'+fs.readFileSync('rfd-daily-cutting.js','utf8'),c);vm.runInContext('headers=()=>[...DCS_HEADERS]',c);
const headers=c.headers(),quote=v=>'"'+v.replace(/"/g,'""')+'"',row=Array.from({length:14},(_,i)=>i===0?'000123':i===5?'  Fabric, "quoted"\nবাংলা & <source>  ':i===11?'12.5000':'');
const csv='\ufeff'+[headers,row,row,Array(14).fill('')].map(r=>r.map(quote).join(',')).join('\r\n');
assert.deepEqual(JSON.parse(JSON.stringify(c.parseDcsCSV(csv))),[row,row,Array(14).fill('')]);
assert.throws(()=>c.parseDcsCSV(csv.replace('EWO No.','EWO')),/14 source headers/);assert.throws(()=>c.parseDcsCSV(headers.map(quote).join(',')+'\nshort,row'),/expected 14/);
const report={headers:[...headers],rows:[row],report:{id:'batch',expected_rows:'1',received_rows:'1'},integrity:{complete:true,row_count:1,batch_id:'batch'}};
assert.equal(c.verifyDcsRead(report),report);
for(const change of [r=>r.integrity.complete=false,r=>r.integrity.row_count=2,r=>r.report.id='other',r=>r.rows[0][11]=12.5,r=>r.report=null]){const bad=structuredClone(report);change(bad);assert.throws(()=>c.verifyDcsRead(bad));}
console.log('PASS DCS exact 14-header contract, quoted Unicode/newlines/spaces/decimals/zeros, duplicate/empty preservation and incomplete/type/version rejection');
