"""Exercise actual frontend RPC payloads against local PHP/MySQL; no source writes."""
from client import *
auth=json.loads(Path(sys.argv[1]).read_text());c=Client();c.login(auth['email'],auth['password'])
def rpc(name,rows,expected=200,**extra):return c.call('rpc',dict(name=name,args=dict(p_rows=rows,**extra)),expected=expected)['data']
rows=[{'Line':'1','Level':'L1','IE Name & Line Block':'Block A','ID':'00017'}]
assert rpc('replace_floor_allocation',rows)==dict(status='SUCCESS',inserted_rows=1)
assert c.query('floor_allocation')['data'][0]['employee_id']=='00017'
for invalid in [[dict(rows[0],Line='46')],[dict(rows[0],Level='')],rows+rows,[dict(rows[0],Line='01'),rows[0]]]:rpc('replace_floor_allocation',invalid,400)
assert len(c.query('floor_allocation')['data'])==1
strength=[dict(item_name=' Shirt ',line_strength=3.5),dict(item_name='Polo',line_strength=2)]
assert rpc('replace_slide4_chassis_strength',strength)['row_count']==2
saved=c.query('slide4_chassis_strength',orders=[['sort_order',True]])['data']
assert [r['item_name'] for r in saved]==['Shirt','Polo'] and [int(r['sort_order']) for r in saved]==[1,2]
for invalid in [[dict(item_name='Unmapped',line_strength=1)],[dict(item_name='shirt',line_strength=1),dict(item_name=' SHIRT ',line_strength=1)],[dict(item_name='shirt',line_strength=-1)],[dict(item_name='shirt',line_strength='1')]]:rpc('replace_slide4_chassis_strength',invalid,400)
assert len(c.query('slide4_chassis_strength')['data'])==2
assert rpc('ekwl_save_report',[],p_kind='chassis',p_replace=True)['inserted_rows']==0
assert rpc('ekwl_save_report',[dict(line_no=1,priority_order=1,product_name='Shirt')],p_kind='chassis')['inserted_rows']==1
assert rpc('ekwl_save_report',[dict(line_no=2,priority_order=1,product_name='Polo')],p_kind='chassis',p_replace=False)['inserted_rows']==1
assert len(c.query('line_chassis_priority')['data'])==2
# Source has no per-item uniqueness constraint: history IDs must survive import.
assert all(int(r['id'])>0 for r in c.query('abp_target')['data'])
print('PASS source/frontend Floor Allocation payload/result, validation rollback, chassis strength trim/order/duplicates/bounds, chassis clear/append and generated source IDs')
