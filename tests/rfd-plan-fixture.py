"""Synthetic client-side plan membership for full-source renderer regressions.
This changes only browser fixture state; it never updates a SQL planning upload.
"""
def select_fixture_plan(page,ewos):
 page.evaluate("""values=>{
  ACTIVE_PLAN_UPLOAD=ACTIVE_PLAN_UPLOAD||{id:'rfd-source-render-fixture',file_name:'Synthetic renderer plan'};
  const base=DATA[0]||{month:'Nov-26',line:1,buyer:'Fixture',style:'T-Shirt',color:'Fixture',smv:6,orderqty:1,planqty:1,startdate:'2026-11-01',enddate:'2026-11-01'};
  DATA=[...new Set(values.map(String).filter(v=>v.trim()))].map((ewo,i)=>({...base,ewo,record_id:'rfd-fixture-'+i}));
  EFF15_METRIC_UPLOAD_ID=String(ACTIVE_PLAN_UPLOAD.id);
  const select=document.getElementById('planning-sequence-filter');select.replaceChildren(new Option('Synthetic renderer plan',String(ACTIVE_PLAN_UPLOAD.id)));select.value=String(ACTIVE_PLAN_UPLOAD.id);
  setPlanningReadState('ready');
 }""",ewos)
