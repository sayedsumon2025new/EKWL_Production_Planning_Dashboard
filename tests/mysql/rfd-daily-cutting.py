"""Isolated localhost DCS exact-cell and atomic activation regression; optional original CSV never leaves local test DB."""
from client import *
import csv,hashlib,os
assert BASE.startswith('http://127.0.0.1:18080/')
auth=json.loads(Path(sys.argv[1]).read_text());admin=Client();admin.login(auth['email'],auth['password'])
H=['Date', 'EWO No.', 'Style', 'Color', 'Buyer', 'Order Qty\nPcs', 'GSM', 'Width', 'UOM', 'Received \nfor Cutting', 'Input/Cut Fabrics', 'Cutting No', 'Measurement \nUnit', 'Qty Ready \nfor Next Process']
private=os.environ.get('DCS_TEST_CSV')
if private:
 with open(private,encoding='utf-8-sig',newline='')as f:records=list(csv.reader(f));assert records.pop(0)==H
else:
 records=[['01-Nov-26',str(i).zfill(7),'Style',' Blue ','Buyer','1000','160','60','KG','12.5000',' Fabric, \"quoted\"\nবাংলা & <text> ','001','PCS','0'] for i in range(500)]+[['']*14]
assert all(len(r)==14 for r in records)
rfd_before=admin.call('rfd',{'action':'read'})['data'];booking_before=admin.call('rfd/booking',{'action':'read'})['data']
def call(c,body,expected=200):return c.call('rfd/daily-cutting',body,expected=expected)
def begin(rows,name='DCS.csv'):
 return call(admin,{'action':'begin','file_name':name,'headers':H,'expected_rows':len(rows),'file_sha256':hashlib.sha256(json.dumps(rows).encode()).hexdigest()})['data']['id']
Client().call('rfd/daily-cutting',{'action':'read'},expected=401)
admin.call('rfd/daily-cutting',{'action':'begin'},csrf=False,expected=403)
email='dcs-'+secrets.token_hex(5)+'@fixture.invalid';password='Fixture-'+secrets.token_hex(12)
admin.call('users',{'action':'create','email':email,'password':password,'role':'user','status':'active','permissions':{'slide_22':True}})
reader=Client();reader.login(email,password)
call(reader,{'action':'read'})
call(reader,{'action':'begin'},expected=403)
# Save an old completed report; an unfinished new one cannot replace it.
old=begin([['old']*14]);call(admin,{'action':'chunk','id':old,'start_row':2,'rows':[['old']*14]});call(admin,{'action':'finalize','id':old})
job=begin(records)
call(admin,{'action':'finalize','id':job},expected=409)
assert call(reader,{'action':'read'})['data']['report']['id']==old
call(admin,{'action':'chunk','id':job,'start_row':3,'rows':[records[0]]},expected=409)
call(admin,{'action':'chunk','id':job,'start_row':2,'rows':[[123]*14]},expected=400)
for start in range(0,len(records),250):
 part=records[start:start+250];result=call(admin,{'action':'chunk','id':job,'start_row':start+2,'rows':part})['data'];assert result['received_rows']==start+len(part)
 if start==0:
  assert call(admin,{'action':'chunk','id':job,'start_row':2,'rows':part})['data']['retry']
  bad=[list(r) for r in part];bad[0][0]+='changed';call(admin,{'action':'chunk','id':job,'start_row':2,'rows':bad},expected=409)
assert call(reader,{'action':'read'})['data']['report']['id']==old
final=call(admin,{'action':'finalize','id':job})['data'];assert final['status']=='SUCCESS' and final['rows']==len(records)
assert call(admin,{'action':'finalize','id':job})['data']==final
result=call(reader,{'action':'read'})['data'];assert result['rows']==records and result['headers']==H and result['integrity']['complete'] and result['integrity']['row_count']==len(records)
call(admin,{'action':'chunk','id':job,'start_row':2,'rows':[records[0]]},expected=409)
other_email='dcs-other-'+secrets.token_hex(5)+'@fixture.invalid';admin.call('users',{'action':'create','email':other_email,'password':password,'role':'admin','status':'active','permissions':{}})
other=Client();other.login(other_email,password);call(other,{'action':'finalize','id':job},expected=403)
none_email='dcs-none-'+secrets.token_hex(5)+'@fixture.invalid';admin.call('users',{'action':'create','email':none_email,'password':password,'role':'user','status':'active','permissions':{}})
none=Client();none.login(none_email,password);call(none,{'action':'read'},expected=403)
assert admin.call('rfd',{'action':'read'})['data']==rfd_before
assert admin.call('rfd/booking',{'action':'read'})['data']==booking_before
print(json.dumps({'dcs_rows':len(records),'columns':14,'exact_cells_verified':len(records)*14,'row_order_preserved':True,'partial_activation_blocked':True,'retry_idempotent':True,'read_write_permissions_checked':True,'original_file_test':bool(private)}))
