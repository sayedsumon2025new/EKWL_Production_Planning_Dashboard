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
