"""Isolated SQL integration: identity-only review, scoped approvals and FDR linkage; synthetic data."""
from client import *
import hashlib
assert BASE.startswith('http://127.0.0.1:18080/')
auth=json.loads(Path(sys.argv[1]).read_text());admin=Client();admin.login(auth['email'],auth['password'])
def call(b,c=admin,expected=200):return c.call('rfd/converter',b,expected=expected)['data']
def save(route,rows):
 h=admin.call(route,{'action':'read'})['data']['headers'];job=admin.call(route,{'action':'begin','headers':h,'file_name':'Synthetic identity source.csv','expected_rows':len(rows),'file_sha256':hashlib.sha256(json.dumps(rows).encode()).hexdigest()})['data']['id']
 for i in range(0,len(rows),250):admin.call(route,{'action':'chunk','id':job,'start_row':i+2,'rows':rows[i:i+250]})
 admin.call(route,{'action':'finalize','id':job});return job
def bank(rows):
 token=str(uuid.uuid4());admin.query('order_bank_import_rows',op='insert',rows=[{'upload_token':token,'source_row_no':i+1,'source_data':dict(zip(['EWO','GmtColor','Buyer','OrderQty'],row))}for i,row in enumerate(rows)])
 admin.call('rpc',{'name':'finalize_order_bank_import','args':{'p_upload_token':token,'p_expected_rows':len(rows),'p_file_name':'Synthetic bank identity.csv','p_source_columns':['EWO','GmtColor','Buyer','OrderQty']}})
colors=[('271080','Carbon Navy'),('271081','Carbon Navy'),('271444','Black'),('272205','Praline'),('271966','Dark Blue'),('271999','Blue'),('271999','Red')]
bankrows=[[e,c,'Buyer','1000']for e,c in colors];bank(bankrows)
rfd=[];booking=[];production=[]
for e,c in colors:
 if e!='271444':
  r=['0']*22;r[0]='01-Nov-26';r[2]=e;r[6]='C. Navy'if e in ['271080','271081']else'Bleu'if e=='271999'and c=='Blue'else c;r[7]='Body fabric <original> & cotton';r[8]='Single Jersey';r[9]='100% Cotton';r[10]='Buyer';r[14]='10';r[17]='1';rfd.append(r)
 booking.append([e,e+'-FBR','Buyer','Team','Supplier','Single Jersey','100% Cotton','Light Brown'if e=='272205'else c,'160','60','KG','20',''])
 production.append(['01-Nov-26','Buyer','Team',e,'Style','Company',c,'1000','100','100']+['0']*15)
r=list(rfd[0]);r[14]='5';rfd.append(r);b=list(booking[0]);b[1]+='-Add-1';b[11]='5';booking.append(b)
for route,rows in [('rfd',rfd),('rfd/booking',booking),('rfd/daily-cutting',production)]:save(route,rows)
original={route:admin.call(route,{'action':'read'})['data']for route in ['rfd','rfd/booking','rfd/daily-cutting']}
Client().call('rfd/converter',{'action':'read'},expected=401)
admin.call('rfd/converter',{'action':'read'},csrf=False,expected=403)
password='Fixture-'+secrets.token_hex(12);email='review-'+secrets.token_hex(5)+'@fixture.invalid';admin.call('users',{'action':'create','email':email,'password':password,'role':'user','status':'active','permissions':{'slide_22':True}});reader=Client();reader.login(email,password)
read=call({'action':'read'});assert read['integrity']['complete'];assert '271966'not in [r['ewo']for r in read['issues']];assert 'OrderQty'not in json.dumps(read) and 'total_input_qty'not in json.dumps(read)
navy=next(r for r in read['issues']if r['ewo']=='271080');assert navy['review_sources']==['rfd'];assert navy['records'][0]['original_color']in['C. Navy','Carbon Navy']
assert any(r['source']=='rfd'and r['original_color']=='C. Navy'for r in navy['context']);assert any(r['source']=='booking'and r['details']is None for r in navy['context']);assert any(r['source']=='orderbank'and r['composition']is None for r in navy['context'])
multi=next(r for r in read['issues']if r['ewo']=='271999');assert multi['issue']=='multiple';assert all(r['original_color']!='Red'for r in multi['records']);assert any(r['matched']and r['original_color']=='Red'for r in multi['context'])
body={'action':'approve','ewo':'271080','source':'rfd','from_color':'C. Navy','to_color':'Carbon Navy','confirmed':True,'expected_digest':read['integrity']['digest']}
call(body,reader,403);bad=dict(body,confirmed=False);call(bad,expected=400);call(dict(body,to_color='Not a source color'),expected=409);call(dict(body,from_color='Absent'),expected=409);call(dict(body,source='orderbank'),expected=400)
# Source update invalidates a previously opened form.
save('rfd',rfd);call(body,expected=409);read=call({'action':'read'});body['expected_digest']=read['integrity']['digest']
before=admin.call('rfd/fabrics-details',{'action':'refresh'})['data'];assert len([r for r in before['rows']if r[1]=='271080'])==2
after=call(body);assert '271080'not in [r['ewo']for r in after['issues']];assert '271081'in[r['ewo']for r in after['issues']];mapping=after['mappings'][0];assert mapping['valid']
report=admin.call('rfd/fabrics-details',{'action':'refresh'})['data'];assert report['report']['dependency_digest']!=before['report']['dependency_digest'];rows=[r for r in report['rows']if r[1]=='271080'];assert len(rows)==1 and rows[0][2]=='Carbon Navy'and rows[0][6]=='15'and rows[0][13]=='25';assert any(e['color_mappings']for i,e in enumerate(report['evidence'])if report['rows'][i][1]=='271080')
for route,data in original.items():now=admin.call(route,{'action':'read'})['data'];assert now['rows']==data['rows']and now['headers']==data['headers']
# Persistence on another authenticated reader, no source data writes.
assert call({'action':'read'},reader)['mappings'][0]['id']==mapping['id'];call(dict(body,expected_digest=read['integrity']['digest']),expected=409)
# Mapping cannot remain effective when its Order Bank target disappears.
changed=[list(r)for r in bankrows];changed[0][1]='Changed Navy';bank(changed);stale=call({'action':'read'});assert not stale['mappings'][0]['valid'];assert '271080'in[r['ewo']for r in stale['issues']]
report=admin.call('rfd/fabrics-details',{'action':'read'})['data'];assert len([r for r in report['rows']if r[1]=='271080'])==2
bank(bankrows);read=call({'action':'read'});assert read['mappings'][0]['valid'];revoked=call({'action':'revoke','id':mapping['id'],'expected_digest':read['integrity']['digest']});assert not revoked['mappings'];assert '271080'in[r['ewo']for r in revoked['issues']]
# Leave unapproved identities for the actual UI test.
print(json.dumps({'identity_only_response':True,'unmatched_only':True,'no_quantity_fields':True,'scoped_admin_approval':True,'confirmation_and_csrf':True,'stale_source_fence':True,'other_ewo_unchanged':True,'fdr_approved_join_and_exact_totals':True,'source_cells_unchanged':True,'stale_reference_inactive':True,'revocation':True}))
