"""Isolated registry lifecycle; no live or original source data."""
from client import *
import hashlib,subprocess
assert BASE.startswith('http://127.0.0.1:18080/')
auth=json.loads(Path(sys.argv[1]).read_text());admin=Client();admin.login(auth['email'],auth['password'])
def save(route,rows):
 h=admin.call(route,{'action':'read'})['data']['headers'];j=admin.call(route,{'action':'begin','headers':h,'file_name':'Master fixture.csv','expected_rows':len(rows),'file_sha256':hashlib.sha256(json.dumps(rows).encode()).hexdigest()})['data']['id'];admin.call(route,{'action':'chunk','id':j,'start_row':2,'rows':rows});admin.call(route,{'action':'finalize','id':j})
def bank(colors):
 token=str(uuid.uuid4());rows=[{'EWO':e,'GmtColor':c,'OrderQty':'1000'}for e,c in colors];admin.query('order_bank_import_rows',op='insert',rows=[{'upload_token':token,'source_row_no':i+1,'source_data':r}for i,r in enumerate(rows)]);admin.call('rpc',{'name':'finalize_order_bank_import','args':{'p_upload_token':token,'p_expected_rows':len(rows),'p_file_name':'Master bank.csv','p_source_columns':list(rows[0])}})
colors=[('271084','Red'),('271080','Carbon Navy'),('271090','Black')];bank(colors)
rfd=[];books=[]
for e,c in colors:
 for fabric,qty,gsm,width in ([('Rib','800','240','60'),('Single Jersey','200','180','72')]if e=='271084'else[('Single Jersey','1000','180','72')]):
  if e!='271090':
   r=['0']*22;r[0]='01-Nov-26';r[2]=e;r[6]='C. Navy'if e=='271080'else c;r[7]='Neck rib <original>'if fabric=='Rib'else'Body fabric';r[8]=fabric;r[9]='Cotton';r[10]='Buyer';r[14]='100';r[17]='1';rfd.append(r)
  books.append([e,e+'-'+fabric,'Buyer','Team','Supplier',fabric,'Cotton',c,gsm,width,'KG',qty,''])
save('rfd',rfd);save('rfd/booking',books)
# A pre-existing approval is imported without asking the user to repeat their review.
code=r'''require '/app/backend/src/bootstrap.php';require '/app/backend/src/rfd-converter.php';if(Ekwl\config()['environment']!=='staging'||!str_contains(Ekwl\config()['dsn'],'dbname=ekwl_test_'))exit(9);Ekwl\rcPrepare();$u=Ekwl\run("SELECT auth_user_id FROM ekwl_site_users WHERE role='admin' LIMIT 1")->fetchColumn();Ekwl\run('INSERT INTO ekwl_rfd_color_mappings(id,scope_key,ewo,source_name,from_color,to_color,approved_by,source_digest) VALUES(?,?,?,?,?,?,?,?)',[Ekwl\uuid(),Ekwl\rcScope('271080','rfd','C. Navy'),'271080','rfd','C. Navy','Carbon Navy',$u,str_repeat('a',64)]);'''
subprocess.run(['docker','exec','ekwl-migration-api','php','-r',code],check=True)
Client().call('rfd/master-id',expected=401)
admin.call('rfd/master-id',{'action':'sync'},csrf=False,expected=403)
def registry(action='sync'):return admin.call('rfd/master-id',{'action':action})['data']
d=registry();assert 'OrderQty'not in json.dumps(d)and'order_qty'not in json.dumps(d);assert len(d['records'])==2;assert len(d['pending'])==1
ids={r['ewo']:r['id']for r in d['records']};codes={r['ewo']:r['master_code']for r in d['records']};assert len(set(codes.values()))==2
nav=next(r for r in d['records']if r['ewo']=='271080');assert nav['match_method']=='admin_reviewed';a=next(a for a in nav['aliases']if a['source_name']=='rfd');assert a['original_colour']=='C. Navy'and a['source_references']['approval']['approved_by'];assert all(a['source_name']!='cutting'for r in d['records']for a in r['aliases'])
events=len(d['events']);assert registry()['events']==d['events'],'Unchanged refresh must not add history or IDs'
read=admin.call('rfd/converter',{'action':'read'})['data'];assert set(read['sources'])=={'rfd','booking','orderbank'};assert [r['ewo']for r in read['issues']]==['271090'];before_digest=read['integrity']['digest']
save('rfd/daily-cutting',[['01-Nov-26','Buyer','Team','999999','Style','Company','Completely unrelated','1000','10','10']+['0']*15]);assert admin.call('rfd/converter',{'action':'read'})['data']['integrity']['digest']==before_digest
assert registry()['events']==d['events'],'Daily Production must not affect registry'
report=admin.call('rfd/fabrics-details',{'action':'read'})['data'];assert report['report']['model_version']=='fabrics-derived-v7'
assert {report['evidence'][i]['master_identity']['master_id']for i,r in enumerate(report['rows'])if r[1]=='271084'}=={ids['271084']},'Body and supporting share one identity'
original_rfd=admin.call('rfd',{'action':'read'})['data']['rows'];save('rfd',original_rfd);d=registry();assert {r['ewo']:r['id']for r in d['records']}==ids;assert len(d['events'])>events
# Reference removed: retain historical ID but never use it as confirmed.
bank([('271084','Red'),('271080','Changed Navy'),('271090','Black')]);d=registry();assert next(r for r in d['records']if r['ewo']=='271080')['status']=='review'
report=admin.call('rfd/fabrics-details',{'action':'read'})['data'];assert all(report['evidence'][i]['master_identity']['master_id']is None for i,r in enumerate(report['rows'])if r[1]=='271080')
bank(colors);assert next(r for r in registry()['records']if r['ewo']=='271080')['id']==ids['271080']
read=admin.call('rfd/converter',{'action':'read'})['data'];m=read['mappings'][0];admin.call('rfd/converter',{'action':'revoke','id':m['id'],'expected_digest':read['integrity']['digest']});assert next(r for r in registry('read')['records']if r['ewo']=='271080')['status']=='review'
read=admin.call('rfd/converter',{'action':'read'})['data'];admin.call('rfd/converter',{'action':'approve','ewo':'271080','source':'rfd','from_color':'C. Navy','to_color':'Carbon Navy','confirmed':True,'expected_digest':read['integrity']['digest']});d=registry('read');assert next(r for r in d['records']if r['ewo']=='271080')['id']==ids['271080']
assert admin.call('rfd',{'action':'read'})['data']['rows']==original_rfd
pwd='Fixture-'+secrets.token_hex(12);email='master-reader-'+secrets.token_hex(5)+'@fixture.invalid';admin.call('users',{'action':'create','email':email,'password':pwd,'role':'user','status':'active','permissions':{'slide_22':True}});reader=Client();reader.login(email,pwd);reader.call('rfd/master-id',{'action':'sync'},expected=403);assert len(reader.call('rfd/master-id',{'action':'read'})['data']['records'])==2
print(json.dumps({'stable_ids':ids,'legacy_approval_preserved':True,'daily_production_excluded':True,'body_rib_same_id':True,'source_upload_reuses_ids':True,'removed_reference_blocks_identity':True,'revoke_and_reapprove_same_id':True,'original_sources_unchanged':True,'reader_write_denied':True}))
