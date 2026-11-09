"""Body-only approval isolation against original SQL sources and persistent Master IDs."""
from client import *
import hashlib
assert BASE.startswith('http://127.0.0.1:18080/')
auth=json.loads(Path(sys.argv[1]).read_text());admin=Client();admin.login(auth['email'],auth['password'])
def save(route,rows):
 h=admin.call(route,{'action':'read'})['data']['headers'];j=admin.call(route,{'action':'begin','headers':h,'file_name':'Body scope.csv','expected_rows':len(rows),'file_sha256':hashlib.sha256(json.dumps(rows).encode()).hexdigest()})['data']['id'];admin.call(route,{'action':'chunk','id':j,'start_row':2,'rows':rows});admin.call(route,{'action':'finalize','id':j})
colors=['Carbon Navy','Old Navy','Deep Carbon'];token=str(uuid.uuid4());bank=[{'EWO':'271080','GmtColor':c,'OrderQty':'1000'}for c in colors];admin.query('order_bank_import_rows',op='insert',rows=[{'upload_token':token,'source_row_no':i+1,'source_data':r}for i,r in enumerate(bank)]);admin.call('rpc',{'name':'finalize_order_bank_import','args':{'p_upload_token':token,'p_expected_rows':len(bank),'p_file_name':'Body bank.csv','p_source_columns':list(bank[0])}})
rfd=[]
for detail,construction,qty in [('Body','Rib main fabric','100'),('Rib','Single Jersey','50'),('Cuff','Single Jersey','25')]:
 r=['0']*22;r[0]='01-Nov-26';r[2]='271080';r[6]='C. Navy';r[7]=detail;r[8]=construction;r[9]='Cotton';r[10]='Buyer';r[14]=qty;r[17]='1';rfd.append(r)
books=[['271080','BK-'+str(i),'Buyer','Team','Supplier','Single Jersey'if c=='Old Navy'else'Rib main fabric','Cotton',c,'180','72','KG','1000','']for i,c in enumerate(colors)]
save('rfd',rfd);save('rfd/booking',books)
def read():return admin.call('rfd/converter',{'action':'read'})['data']
def approve(target,detail='Body',source='rfd',expected=200):return admin.call('rfd/converter',{'action':'approve','ewo':'271080','source':source,'from_color':'C. Navy','to_color':target,'fabric_details':detail,'confirmed':True,'expected_digest':read()['integrity']['digest']},expected=expected)['data']
approve('Carbon Navy',source='booking',expected=400);approve('Carbon Navy',detail='Rib',expected=400)
d=approve('Carbon Navy');scoped=next(m for m in d['mappings']if m.get('fabric_details')=='Body');assert scoped['valid'];assert any(r['source']=='rfd'and r['details']=='Rib'for issue in d['issues']for r in issue['records']);assert not any(r['source']=='rfd'and r['details']=='Body'for issue in d['issues']for r in issue['records'])
def report():return admin.call('rfd/fabrics-details',{'action':'read'})['data']
r=report();assert r['report']['model_version']=='fabrics-derived-v8';body=next(x for x in r['rows']if x[2]=='Carbon Navy'and x[3]=='Body');assert body[6]=='100';rib=next(x for x in r['rows']if x[2]=='C. Navy'and x[4]=='Single Jersey');assert rib[6]=='75';assert all(not e['color_mappings']for i,e in enumerate(r['evidence'])if r['rows'][i][2]=='C. Navy')
m=admin.call('rfd/master-id',{'action':'read'})['data'];master=next(x for x in m['records']if x['master_colour']=='Carbon Navy');master_id=master['id'];alias=next(a for a in master['aliases']if a['source_name']=='rfd'and a['is_active']);assert alias['source_references']['fabric_details_scope']=='Body';assert alias['source_references']['approval']['fabric_details']=='Body';assert alias['source_references']['rows']==[2]
# A full-colour mapping can coexist, but a scoped approval always wins for Body only.
approve('Old Navy',detail=None);r=report();assert any(x[2]=='Carbon Navy'and x[3]=='Body'and x[6]=='100'for x in r['rows']);rib_before=[x for x in r['rows']if x[2]=='Old Navy'and x[4]=='Single Jersey'];assert rib_before[0][6]=='75'
approve('Deep Carbon');assert [x for x in report()['rows']if x[2]=='Old Navy'and x[4]=='Single Jersey']==rib_before
approve('Carbon Navy');assert next(x for x in admin.call('rfd/master-id',{'action':'read'})['data']['records']if x['master_colour']=='Carbon Navy')['id']==master_id
# Future uploads reuse the Body approval without changing its scope or ID.
future=[list(x)for x in rfd];future[0][7]=' BODY ';save('rfd',future);admin.call('rfd/master-id',{'action':'sync'});assert next(x for x in admin.call('rfd/master-id',{'action':'read'})['data']['records']if x['master_colour']=='Carbon Navy')['id']==master_id
# Removing only Body evidence invalidates that approval despite the same colour in Rib.
save('rfd',future[1:]);assert not next(m for m in read()['mappings']if m.get('fabric_details')=='Body')['valid'];save('rfd',rfd)
# Scoped revoke preserves the broad mapping and the Rib row.
d=read();scoped=next(m for m in d['mappings']if m.get('fabric_details')=='Body');admin.call('rfd/converter',{'action':'revoke','id':scoped['id'],'expected_digest':d['integrity']['digest']});assert [x[:14]for x in report()['rows']if x[2]=='Old Navy'and x[4]=='Single Jersey']==[x[:14]for x in rib_before]
# Repeated EWO-colour totals can change when revoked Body rejoins the wide colour; Rib grain remains unchanged.
assert admin.call('rfd',{'action':'read'})['data']['rows']==rfd
# Leave unmatched source names for the actual browser test.
d=read();wide=next(m for m in d['mappings']if m.get('fabric_details')is None);admin.call('rfd/converter',{'action':'revoke','id':wide['id'],'expected_digest':d['integrity']['digest']});assert not read()['mappings']
print(json.dumps({'literal_body_only':True,'rib_cuff_unchanged':True,'booking_body_scope_denied':True,'body_scope_in_sql_and_master_evidence':True,'future_upload_same_master_id':True,'missing_body_invalidates_scope':True,'scoped_revoke_keeps_broad_mapping':True,'original_source_rows_unchanged':True}))
