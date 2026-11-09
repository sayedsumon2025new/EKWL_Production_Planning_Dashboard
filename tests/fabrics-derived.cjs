const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={document:{addEventListener(){},getElementById(){return null;}}};vm.createContext(c);vm.runInContext(fs.readFileSync('rfd-fabrics-details.js','utf8'),c);vm.runInContext('getHeaders=()=>[...FDR_HEADERS]',c);
const digest='a'.repeat(64),data={headers:c.getHeaders(),rows:[Array(31).fill('—')],evidence:[{pair:'x'}],report:{dependency_digest:digest},integrity:{complete:true,row_count:1,dependency_digest:digest}};
assert.equal(c.verifyFdrRead(data),data);
for(const mutate of [d=>d.integrity.complete=false,d=>d.integrity.row_count=2,d=>d.report.dependency_digest='b'.repeat(64),d=>d.headers[1]='EWO',d=>d.rows[0][6]=10,d=>d.evidence=[]]){const bad=structuredClone(data);mutate(bad);assert.throws(()=>c.verifyFdrRead(bad));}
console.log('PASS automatic Fabrics 31-column contract, complete receipt, evidence count, source digest and string-cell guards');
const bookSource=fs.readFileSync('rfd-booking.js','utf8');vm.runInContext(bookSource.slice(bookSource.indexOf('const BOOKING_HEADERS='),bookSource.indexOf('\nlet BOOKING_ROWS')),c);
const valid=structuredClone(data);valid.report.model_version='fabrics-derived-v5';valid.booking_headers=vm.runInContext('[...BOOKING_HEADERS]',c);valid.booking_lines=[{n:2,v:Array(13).fill('')}];valid.sources={booking:{rows:1}};valid.rows[0][13]='1000';valid.rows[0][12]='KG';valid.evidence[0]={pair:'A',master_identity:{matched:true},reconciliation:{type:'body',booking_qty:'1000',unit:'KG'}};
assert.equal(c.verifyFdrRead(valid),valid);
for(const change of [d=>d.booking_lines=[],d=>d.booking_lines[0].n=3,d=>d.booking_lines[0].v[11]=1000,d=>d.booking_headers[0]='Wrong',d=>d.evidence[0].reconciliation.type='other',d=>d.evidence[0].reconciliation.booking_qty='999',d=>d.evidence[0].master_identity.matched=false,d=>d.evidence[0].reconciliation.type='rib']){const bad=structuredClone(valid);change(bad);assert.throws(()=>c.verifyFdrRead(bad));}
const duplicate=structuredClone(valid);duplicate.rows.push([...duplicate.rows[0]]);duplicate.evidence.push(structuredClone(duplicate.evidence[0]));duplicate.integrity.row_count=2;assert.throws(()=>c.verifyFdrRead(duplicate));
console.log('PASS v5 booking source headings/counts/row identity/types, role evidence, master identity, primary uniqueness and supporting-to-primary guards');

const v6=structuredClone(valid);v6.report.model_version='fabrics-derived-v6';v6.rows[0][17]='1000';v6.pairs={A:{order_bank_order:{quantity:'1000'}}};assert.equal(c.verifyFdrRead(v6),v6);v6.pairs.A.order_bank_order.quantity='9999';assert.throws(()=>c.verifyFdrRead(v6));

const v7=structuredClone(valid);v7.report.model_version='fabrics-derived-v7';v7.rows[0][17]='1000';v7.pairs={A:{order_bank_order:{quantity:'1000'}}};v7.evidence[0].master_identity={matched:true,master_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',master_code:'MID-000001',registry_status:'confirmed'};assert.equal(c.verifyFdrRead(v7),v7);v7.evidence[0].master_identity.master_code=null;assert.throws(()=>c.verifyFdrRead(v7));
