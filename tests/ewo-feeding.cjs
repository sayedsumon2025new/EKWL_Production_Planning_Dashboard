const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('function buildS6Rows('),html.indexOf('/* ══ SLIDE 7:',html.indexOf('function buildS6Rows(')));
const nodes=new Map();
const document={getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',dataset:{}});return nodes.get(id);}};
const upload={id:'P04',planning_month:'2026-09'};
const api=new Function('N','document','ACTIVE_PLAN_UPLOAD','uploadMonthKey','planningMonthLabel','fmt','esc',source+';return {buildS6Rows,renderS6};')(
 x=>Number(x)||0,document,upload,u=>u.planning_month,m=>m,String,String);
const data=[
 {ewo:'A',line:2,startdate:'2026-09-05',buyer:'Buyer A',style:'Hoody',po:'P1',color:'Black',orderqty:3000,planqty:2000},
 {ewo:'A',line:2,startdate:'2026-09-05',buyer:'Buyer A',style:'Hoody',po:'P2',color:'Blue',orderqty:1000,planqty:500},
 {ewo:'A',line:2,startdate:'2026-09-12',buyer:'Buyer A',style:'Hoody',orderqty:2000,planqty:1500},
 {ewo:'A',line:5,startdate:'2026-10-02',buyer:'Other',style:'Other',orderqty:9000,planqty:8000},
 {ewo:'B',line:8,startdate:'2026-09-15',buyer:'Buyer B',style:'Polo',orderqty:6000,planqty:4500},
 {ewo:'C',line:12,startdate:'2026-10-03',orderqty:5000,planqty:2500},
 {ewo:'D',line:1,startdate:'',orderqty:100,planqty:100},
 {ewo:'E',line:1,startdate:'2026-08-31',orderqty:100,planqty:100}
];
const rows=api.buildS6Rows(data,'2026-09');
assert.equal(rows.length,2);assert.equal(rows[0].ewo,'A');assert.equal(rows[0].feeding,2);
assert.equal(rows[0].lines.length,1);assert.equal(rows[0].orderqty,6000);assert.equal(rows[0].planqty,4000);
assert.equal(rows[0].splits[0],4000);assert.equal(rows[0].buyers.size,1);
api.renderS6(data);
const filter=document.getElementById('s6-feeding-filter');filter.value='2';api.renderS6(data);
assert.match(document.getElementById('s6-count').textContent,/1 of 2/);
assert.match(document.getElementById('s6-kpi').innerHTML,/6000/);
assert.doesNotMatch(document.getElementById('s6-body').innerHTML,/Buyer B|Other|2026-09-05/);
upload.id='P05';api.renderS6(data);assert.equal(filter.value,'');
upload.planning_month='2026-10';api.renderS6(data);
assert.equal(document.getElementById('s6-month').textContent,'2026-10');
assert.equal(api.buildS6Rows(data,'2026-10').length,2);
const split=api.buildS6Rows([{ewo:'X',line:12,startdate:'2026-09-02',planqty:40},{ewo:'X',line:2,startdate:'2026-09-03',planqty:60}],'2026-09')[0];
assert.equal(split.lines.join('|'),'2|12');assert.equal(split.splits.join('|'),'60|40');
console.log('PASS PSD month exclusion, EWO aggregation, distinct feeding, aligned splits, filter KPIs and planning switch reset');
