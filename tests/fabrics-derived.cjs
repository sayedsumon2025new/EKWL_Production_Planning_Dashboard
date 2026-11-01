const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={document:{addEventListener(){},getElementById(){return null;}}};vm.createContext(c);vm.runInContext(fs.readFileSync('rfd-fabrics-details.js','utf8'),c);vm.runInContext('getHeaders=()=>[...FDR_HEADERS]',c);
const digest='a'.repeat(64),data={headers:c.getHeaders(),rows:[Array(31).fill('—')],evidence:[{pair:'x'}],report:{dependency_digest:digest},integrity:{complete:true,row_count:1,dependency_digest:digest}};
assert.equal(c.verifyFdrRead(data),data);
for(const mutate of [d=>d.integrity.complete=false,d=>d.integrity.row_count=2,d=>d.report.dependency_digest='b'.repeat(64),d=>d.headers[1]='EWO',d=>d.rows[0][6]=10,d=>d.evidence=[]]){const bad=structuredClone(data);mutate(bad);assert.throws(()=>c.verifyFdrRead(bad));}
console.log('PASS automatic Fabrics 31-column contract, complete receipt, evidence count, source digest and string-cell guards');
