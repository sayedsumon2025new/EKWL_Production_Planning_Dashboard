const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
function fn(name){const start=html.search(new RegExp('^(?:async )?function '+name+'\\(','m'));return html.slice(start,html.indexOf('\n}',start)+2);}
const c={};vm.createContext(c);
vm.runInContext(html.slice(html.indexOf('function validDate('),html.indexOf('\nfunction parseRecords(')),c);
for(const name of ['csvDate','parseRecords','parseRawPlanFile'])vm.runInContext(fn(name),c);
vm.runInContext(html.slice(html.indexOf('function rawDateHeader('),html.indexOf('\nasync function refreshSbAuth(')),c);
const cases=[
 ['2026-10-14','2026-10-14'],['2026/10/14','2026-10-14'],['2026.10.14','2026-10-14'],['20261014','2026-10-14'],
 ['14-Oct-26','2026-10-14'],['14/October/2026','2026-10-14'],['14 October 2026','2026-10-14'],['October 14, 2026','2026-10-14'],
 ['oCt-14-26','2026-10-14'],['14.10.2026','2026-10-14'],['10/14/2026','2026-10-14'],['14/10/26','2026-10-14'],
 ['03/04/2026',null],['03/04/2026','2026-04-03','dmy'],['03/04/2026','2026-03-04','mdy'],['11/11/26','2026-11-11'],
 ['2026-10-14T23:59:59.123456+06:00','2026-10-14'],['2026-10-14 10:30','2026-10-14'],['2026-10-14T00:30Z','2026-10-14'],
 ['2026-10-14T00:30:00-14:00','2026-10-14'],['2026-10-14T00:30:00+14:01',null],['2026-10-14T24:00:00Z',null],
 ['2026-10-14 garbage',null],['2026-10-14T01:60Z',null],['2026-10-14T01:30:60Z',null],['2026-10-14T01:30+15:00',null],
 ['2024-02-29','2024-02-29'],['2026-02-29',null],['31-Apr-26',null],['14-Bad-26',null],['14-Oct',null],['02/30/2026',null],
 ['0000-01-01',null],['0001-01-01','0001-01-01'],['9999-12-31','9999-12-31'],['2026-13-01',null],['2026-01-00',null],
 ['2026-10/14',null],['14-10/2026',null],['',null],[null,null],[' 14-Oct-26 ','2026-10-14'],
 ['1','1900-01-01','excel'],['59','1900-02-28','excel'],['60',null,'excel'],['61','1900-03-01','excel'],
 ['46309.75','2026-10-14','excel'],['2958465','9999-12-31','excel'],['2958466',null,'excel'],['0',null,'excel'],['46309',null],
 ['2026-10-14',null,'bad']
];
const quote=x=>x===null?'null':"'"+x.replace(/'/g,"''")+"'";
for(const [raw,expected,order='auto'] of cases)assert.equal(c.csvDate(raw,order),expected,JSON.stringify([raw,order]));
const sql=cases.map(([raw,expected,order='auto'],i)=>`if public.dashboard_parse_date(${quote(raw)},${quote(order)}) is distinct from ${expected?'date '+quote(expected):'null'} then raise exception 'Date parser case ${i} failed'; end if;`).join('\n');
fs.writeFileSync('/tmp/date-parser-cases.sql',"set datestyle='SQL,DMY';\ndo $$ begin\n"+sql+"\nend $$;\nset datestyle='ISO,MDY';\ndo $$ begin\n"+sql+"\nend $$;\n");
(async()=>{
 assert.equal(c.rawHeaderDate('10/11/2026'),'2026-10-11'); // Explicit legacy header convention.
 assert.equal(c.rawHeaderDate('14-Oct-26'),'2026-10-14');
 const csv='Buyer,Line #,Criteria,PSD,2026-10-14,14-Oct-26\nBuyer,Line 01,Plan/Day,14-Oct-26,10,20';
 await assert.rejects(()=>c.parseRawPlanFile({text:async()=>csv}),/Duplicate daily dates/);
 if(process.argv[2]){
   const text=fs.readFileSync(process.argv[2],'utf8'),parsed=await c.parseRawPlanFile({text:async()=>text});
   assert.equal(parsed.rows.length,5500);
   for(const row of parsed.rows)for(const key of ['PCD','PSD','PFD','Delivery'])assert.ok(c.csvDate(row[key]));
   console.log('PASS actual CSV: 5500 rows, 22000 milestone dates, 18 daily columns');
 }
 console.log('PASS',cases.length,'JS date cases; matching PostgreSQL assertions written; daily header compatibility and duplicates');
})().catch(e=>{console.error(e);process.exitCode=1;});
