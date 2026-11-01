"""Isolated localhost RFD exact-cell and atomic activation regression; optional original CSV never leaves local test DB."""
from client import *
import csv,hashlib,os
assert BASE.startswith('http://127.0.0.1:18080/')
auth=json.loads(Path(sys.argv[1]).read_text());admin=Client();admin.login(auth['email'],auth['password'])
H=['Receive & Delivery Date','Receive & Delivery Place','EWO No','Batch No','Re-Finish ID','Tag Number','Color','Fabric Details','Fabric Construction','Fabric Composition','Buyer Name','Vehicle Number','DC No','Re Delivery','Net Delivery Qty Kg.','Net Delivery Qty Pcs','Net Delivery Qty Yds','Total Roll','Lock No','Delivery From','Mushak Challan No','Body Fabrics']
private=os.environ.get('RFD_TEST_CSV')
if private:
 with open(private,encoding='utf-8-sig',newline='')as f:records=list(csv.reader(f));assert records.pop(0)==H
else:
 records=[['20-Jul-26','EKWL HW',str(i).zfill(7),'001','','',' White ', 'Fabric, "quoted"\nবাংলা & <text>','','','Buyer','','','','12.5000','0','0.000','03','','','',''] for i in range(1001)]
assert all(len(r)==22 for r in records)
def call(c,body,expected=200):return c.call('rfd',body,expected=expected)
def begin(rows,name='RFD.csv'):
 return call(admin,{'action':'begin','file_name':name,'headers':H,'expected_rows':len(rows),'file_sha256':hashlib.sha256(json.dumps(rows).encode()).hexdigest()})['data']['id']
Client().call('rfd',{'action':'read'},expected=401)
admin.call('rfd',{'action':'begin'},csrf=False,expected=403)
email='rfd-'+secrets.token_hex(5)+'@fixture.invalid';password='Fixture-'+secrets.token_hex(12)
admin.call('users',{'action':'create','email':email,'password':password,'role':'user','status':'active','permissions':{'slide_22':True}})
reader=Client();reader.login(email,password)
call(reader,{'action':'read'})
call(reader,{'action':'begin'},expected=403)
# Save an old completed report; an unfinished new one cannot replace it.
old=begin([['old']*22]);call(admin,{'action':'chunk','id':old,'start_row':2,'rows':[['old']*22]});call(admin,{'action':'finalize','id':old})
job=begin(records)
call(admin,{'action':'finalize','id':job},expected=409)
assert call(reader,{'action':'read'})['data']['report']['id']==old
call(admin,{'action':'chunk','id':job,'start_row':3,'rows':[records[0]]},expected=409)
call(admin,{'action':'chunk','id':job,'start_row':2,'rows':[[123]*22]},expected=400)
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
other_email='rfd-other-'+secrets.token_hex(5)+'@fixture.invalid';admin.call('users',{'action':'create','email':other_email,'password':password,'role':'admin','status':'active','permissions':{}})
other=Client();other.login(other_email,password);call(other,{'action':'finalize','id':job},expected=403)
none_email='rfd-none-'+secrets.token_hex(5)+'@fixture.invalid';admin.call('users',{'action':'create','email':none_email,'password':password,'role':'user','status':'active','permissions':{}})
none=Client();none.login(none_email,password);call(none,{'action':'read'},expected=403)
print(json.dumps({'rfd_rows':len(records),'columns':22,'exact_cells_verified':len(records)*22,'row_order_preserved':True,'partial_activation_blocked':True,'retry_idempotent':True,'read_write_permissions_checked':True,'original_file_test':bool(private)}))
