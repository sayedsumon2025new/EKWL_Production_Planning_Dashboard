"""Isolated SQL fixture: primary/supporting fabrics and raw booking evidence."""
from client import *
import hashlib
assert BASE.startswith('http://127.0.0.1:18080/')
auth=json.loads(Path(sys.argv[1]).read_text());admin=Client();admin.login(auth['email'],auth['password'])
def save(route,rows):
 h=admin.call(route,{'action':'read'})['data']['headers'];job=admin.call(route,{'action':'begin','headers':h,'file_name':'Reconciliation fixture.csv','expected_rows':len(rows),'file_sha256':hashlib.sha256(json.dumps(rows).encode()).hexdigest()})['data']['id']
 admin.call(route,{'action':'chunk','id':job,'start_row':2,'rows':rows});admin.call(route,{'action':'finalize','id':job});return job
bank=[['271080','NAVY'],['271084','RED'],['271085','TIE'],['271086','MIXED'],['271087','GREY']];token=str(uuid.uuid4());admin.query('order_bank_import_rows',op='insert',rows=[{'upload_token':token,'source_row_no':i+1,'source_data':{'EWO':e,'GmtColor':c,'Buyer':'Buyer','OrderQty':'1000'}}for i,(e,c)in enumerate(bank)]);admin.call('rpc',{'name':'finalize_order_bank_import','args':{'p_upload_token':token,'p_expected_rows':len(bank),'p_file_name':'Reconciliation master.csv','p_source_columns':['EWO','GmtColor','Buyer','OrderQty']}})
booking=[]
def b(e,c,construction,qty,gsm='180',width='72',unit='KG',ref=None,reason=''):
 booking.append([e,ref or 'BK-'+str(len(booking)+1),'Buyer','Team','Supplier',construction,'Cotton',c,gsm,width,unit,qty,reason])
b('271080','Navy','Single Jersey','1000',ref='MAIN <script>window.bad=1</script>');b('271080','Navy','Single Jersey','200',reason='Replacement <tag>');b('271080','Navy','Single Jersey','100');b('271080','Navy','Rib','150','240','42');b('271080','Navy','Single Jersey','250','200')
b('271084','RED','Rib','800','260','60');b('271084','RED','Single Jersey','200')
b('271085','TIE','Rib','500');b('271085','TIE','Single Jersey','500')
b('271086','MIXED','Rib','800',unit='YDS');b('271086','MIXED','Single Jersey','100')
b('271087','GREY','Single Jersey','500')
rfd=[]
for e,c,construction,qty in [('271080','Navy','Single Jersey','1100'),('271080','Navy','Rib','100'),('271084','RED','Rib','650'),('271084','RED','Single Jersey','150'),('271087','CHARCOAL','Single Jersey','400')]:
 r=['0']*22;r[0]='01-Nov-26';r[2]=e;r[6]=c;r[7]='Original '+construction+' fabric';r[8]=construction;r[9]='Cotton';r[10]='Buyer';r[14]=qty;r[17]='1';rfd.append(r)
save('rfd',rfd);save('rfd/booking',booking)
save('rfd/daily-cutting',[['01-Nov-26','Buyer','Team',e,'Style','Company',c,'9999','50','50']+['0']*15 for e,c in bank])
raw_before={route:admin.call(route,{'action':'read'})['data']['rows']for route in ['rfd','rfd/booking']}
d=admin.call('rfd/fabrics-details',{'action':'refresh'})['data'];assert d['report']['model_version']=='fabrics-derived-v8';assert d['booking_lines']==[{'n':i+2,'v':r}for i,r in enumerate(booking)]
assert all(r[17]=='1000' for r in d['rows']if r[1]=='271084')
assert all(r[17]=='—' for r in d['rows']if r[1]=='271087'and r[2]=='CHARCOAL')
find=lambda e,cons,gsm:next(i for i,r in enumerate(d['rows'])if r[1]==e and r[4]==cons and r[10]==gsm)
i=find('271080','Single Jersey','180');assert d['rows'][i][13]=='1300'and d['rows'][i][2]=='NAVY'and d['rows'][i][6]=='—';assert d['evidence'][i]['reconciliation']['type']=='body';assert d['evidence'][i]['receipt_candidates']==[2]
i=find('271084','Rib','260');assert d['rows'][i][13]=='800'and d['evidence'][i]['reconciliation']['type']=='body';assert d['evidence'][find('271084','Single Jersey','180')]['reconciliation']['type']=='rib'
for e in ['271085','271086']:
 assert all(d['evidence'][i]['reconciliation']['type']=='review'for i,r in enumerate(d['rows'])if r[1]==e)
assert any(r[1]=='271087'and r[2]=='CHARCOAL'and d['evidence'][i]['reconciliation']['type']=='review'for i,r in enumerate(d['rows']))
for route,rows in raw_before.items():assert admin.call(route,{'action':'read'})['data']['rows']==rows
again=admin.call('rfd/fabrics-details',{'action':'refresh'})['data'];assert again['report']['id']==d['report']['id']and again['evidence']==d['evidence']
Client().call('rfd/fabrics-details',{'action':'read'},expected=401)
print(json.dumps({'rows':len(d['rows']),'body_or_review':sum(e['reconciliation']['type']!='rib'for e in d['evidence']),'supporting':sum(e['reconciliation']['type']=='rib'for e in d['evidence']),'primary_rib':800,'master_color':'NAVY','source_booking_lines':len(booking),'spec_receipts_unresolved':True,'materialization_verified':True,'raw_sources_unchanged':True}))
