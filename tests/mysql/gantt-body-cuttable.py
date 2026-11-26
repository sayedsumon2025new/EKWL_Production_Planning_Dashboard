"""Body-only Gantt snapshot from isolated SQL; no source rows changed by reads."""
from client import *
import hashlib
assert BASE.startswith('http://127.0.0.1:18080/')
auth=json.loads(Path(sys.argv[1]).read_text());admin=Client();admin.login(auth['email'],auth['password'])
def save(route,rows):
 headers=admin.call(route,{'action':'read'})['data']['headers'];job=admin.call(route,{'action':'begin','headers':headers,'file_name':'Body cuttable fixture.csv','expected_rows':len(rows),'file_sha256':hashlib.sha256(json.dumps(rows).encode()).hexdigest()})['data']['id']
 admin.call(route,{'action':'chunk','id':job,'start_row':2,'rows':rows});admin.call(route,{'action':'finalize','id':job})
bank=[{'EWO':'299901','GmtColor':'Navy','OrderQty':'5000'}];token=str(uuid.uuid4());admin.query('order_bank_import_rows',op='insert',rows=[{'upload_token':token,'source_row_no':1,'source_data':bank[0]}]);admin.call('rpc',{'name':'finalize_order_bank_import','args':{'p_upload_token':token,'p_expected_rows':1,'p_file_name':'Body bank.csv','p_source_columns':list(bank[0])}})
rfd=[]
for detail,construction,qty in [('Body','Single Jersey','600'),('Body','Single Jersey','400'),('Rib','Rib','9000')]:
 r=['0']*22;r[0]='01-Nov-26';r[2]='299901';r[6]='Navy';r[7]=detail;r[8]=construction;r[9]='Cotton';r[14]=qty;rfd.append(r)
books=[['299901','B'+str(i),'Buyer','Team','Supplier',construction,'Cotton','Navy','180','72','KG',qty,'']for i,(construction,qty)in enumerate([('Single Jersey','1000'),('Rib','9000')])]
daily=[]
for date,total in [('01-Nov-26','1000'),('02-Nov-26','3000'),('02-Nov-26','3000')]:
 r=['0']*25;r[0]=date;r[3]='299901';r[6]='Navy';r[8]='1000';r[9]=total;daily.append(r)
for route,rows in [('rfd',rfd),('rfd/booking',books),('rfd/daily-cutting',daily)]:save(route,rows)
before=[admin.call(route,{'action':'read'})['data']for route in ['rfd','rfd/booking','rfd/daily-cutting']]
def read(client):return client.call('reports/snapshot',{'kind':'gantt-cutting'})['data']
data=read(admin);body=data['body_cuttable'];r=body['rows'][0]
assert data['rows']==daily and body['integrity']=={'complete':True,'row_count':1}
assert r['cuttable']==2000 and r['body_received']=='1000' and r['body_booking']=='1000' and r['body_consumption']=='0.2' and r['total_cut']=='3000'
assert r['evidence']['rfd_rows']==[2,3] and r['evidence']['booking_rows']==[2] and r['evidence']['cutting_rows']==[3,4]
assert before==[admin.call(route,{'action':'read'})['data']for route in ['rfd','rfd/booking','rfd/daily-cutting']]
for permission in ['slide_7','slide_20']:
 email='body-'+secrets.token_hex(5)+'@fixture.invalid';password='Fixture-'+secrets.token_hex(12);admin.call('users',{'action':'create','email':email,'password':password,'role':'user','status':'active','permissions':{permission:True}});viewer=Client();viewer.login(email,password);assert read(viewer)==data;viewer.call('rfd',{'action':'begin'},expected=403)
Client().call('reports/snapshot',{'kind':'gantt-cutting'},expected=401)
print('PASS SQL Body-only cuttable snapshot, exact source rows, latest cumulative cutting once, Gantt/Load Analysis read permissions, original data immutable')
