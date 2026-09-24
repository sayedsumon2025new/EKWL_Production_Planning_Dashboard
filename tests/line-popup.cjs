const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('let S2_LINE_DETAILS=[];'),html.indexOf('/* ══ SLIDE 3:'));
const elements=new Map();const document={getElementById(id){if(id==='s2-line-dialog')return null;if(!elements.has(id))elements.set(id,{});return elements.get(id);}};
const ctx={document,N:x=>Number(x)||0,fmt:String,esc:x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),sortedMonths:rows=>[...new Set(rows.map(r=>r.month))],authoritativeOrderQty:rows=>rows.reduce((s,r)=>s+(Number(r.orderqty)||0),0)};
vm.createContext(ctx);vm.runInContext(source,ctx);
const rows=[
 {month:'Sep',ewo:'A',line:1,style:'Shirt',color:'Red',smv:5,orderqty:100,planqty:30},
 {month:'Sep',ewo:'A',line:1,style:'Shirt',color:'Blue',smv:6,orderqty:100,planqty:40},
 {month:'Sep',ewo:'A',line:2,style:'Shirt',color:'Red',smv:5,orderqty:100,planqty:50},
 {month:'Sep',ewo:'B',line:1,style:'<script>',color:'Green',smv:7,orderqty:9000,planqty:80}
];
ctx.renderS2(rows);
ctx.details=vm.runInContext('S2_LINE_DETAILS',ctx);
assert.equal(ctx.details.length,3);
const line=ctx.details.find(d=>d.line==='1'&&d.range==='Below 500');
assert.equal(line.rows.length,2);
const grouped=ctx.buildS2EwoRows(line.rows);
assert.equal(grouped.length,1);assert.equal(grouped[0].orderqty,200);assert.equal(grouped[0].planqty,70);
assert.equal(grouped[0].colors.size,2);assert.equal(grouped[0].smvs.size,2);
const buttons=elements.get('s2-bar').innerHTML;
assert.match(buttons,/<button type="button" class="range-line-chip"/);
assert.doesNotMatch(buttons,/onmouseover|onmouseenter/);
ctx.renderS2([rows[3]]);
assert.equal(vm.runInContext('S2_LINE_DETAILS.length',ctx),1);
assert.equal(vm.runInContext('S2_LINE_DETAILS[0].rows[0].ewo',ctx),'B');
console.log('PASS EWO grouping, line/range isolation, quantities, multiple colours/SMVs, click-only buttons and refreshed selection');

const counted=ctx.buildS2EwoRows([
 {ewo:'A',style:'Shirt',color:'Red',smv:'5.00',po:' PO1 ',orderqty:10,planqty:4},
 {ewo:'A',style:'Shirt',color:'Red',smv:5,po:'PO1',orderqty:20,planqty:6},
 {ewo:'B',style:'Polo',color:'Red',smv:6,po:'PO1',orderqty:30,planqty:8},
 {ewo:'B',style:'Polo',color:'Blue',smv:6,po:'PO2',orderqty:40,planqty:10},
 {ewo:'B',style:'Polo',color:' ',smv:'',po:' ',orderqty:0,planqty:0}
]);
assert.equal(counted[0].pos.size,1);assert.equal(counted[0].smvs.size,1);
assert.equal(counted[1].colors.size,2);assert.equal(counted[1].pos.size,2);
const totals=ctx.summarizeS2Line(counted);
assert.equal(totals.ewos,2);assert.equal(totals.colors,2);assert.equal(totals.pos,2);
assert.equal(totals.smvs.size,2);assert.equal(totals.orderqty,100);assert.equal(totals.planqty,28);
console.log('PASS unique PO/colour/SMV counts, blank exclusion, EWO products and line totals');

const demo=[
 {month:'Sep',ewo:'A',line:2,po:'P1',color:'Black',orderqty:3000,planqty:400},
 {month:'Oct',ewo:'A',line:2,po:'P2',color:'Blue',orderqty:2275,planqty:321},
 {month:'Sep',ewo:'B',line:2,po:'P3',color:'White',orderqty:6000,planqty:1500},
 {month:'Sep',ewo:'B',line:2,po:'P4',color:'Black',orderqty:3000,planqty:1000},
 {month:'Sep',ewo:'A',line:3,po:'P5',color:'Red',orderqty:4000,planqty:800}
];
ctx.renderS2(demo);
const details=vm.runInContext('S2_LINE_DETAILS',ctx);
const find=(line,range)=>details.find(d=>d.line===line&&d.range===range);
assert.equal(details.length,3);
assert.equal(find('2','Above 8000').rows.every(r=>r.ewo==='B'),true);
assert.equal(find('2','5001-8000').rows.every(r=>r.ewo==='A'),true);
assert.equal(find('3','3001-5000').rows.every(r=>r.ewo==='A'),true);
const a=ctx.summarizeS2Line(ctx.buildS2EwoRows(find('2','5001-8000').rows));
assert.equal(a.orderqty,5275);assert.equal(a.planqty,721);assert.equal(a.colors,2);assert.equal(a.pos,2);
const b=ctx.summarizeS2Line(ctx.buildS2EwoRows(find('2','Above 8000').rows));
assert.equal(b.orderqty,9000);assert.equal(b.planqty,2500);assert.equal(b.ewos,1);
const boundaries=[[0,'Below 500'],[500,'Below 500'],[501,'501-1000'],[1000,'501-1000'],[1001,'1001-2000'],[2000,'1001-2000'],[2001,'2001-3000'],[3000,'2001-3000'],[3001,'3001-5000'],[5000,'3001-5000'],[5001,'5001-8000'],[8000,'5001-8000'],[8001,'Above 8000']];
ctx.renderS2(boundaries.map(([qty],i)=>({month:'Sep',line:2,ewo:'Boundary'+i,orderqty:qty,planqty:0})));
for(const [i,[qty,range]] of boundaries.entries()){
 const matches=vm.runInContext('S2_LINE_DETAILS',ctx).filter(d=>d.rows.some(r=>r.ewo==='Boundary'+i));
 assert.equal(matches.length,1);assert.equal(matches[0].range,range);
}
console.log('PASS approved Line + EWO demo, cross-month cumulative rows, other-line isolation and 13 boundaries');
