"""Isolated local SQL integration for automatic Fabrics Details; synthetic sources only."""
from client import *
import hashlib,subprocess,base64
assert BASE.startswith('http://127.0.0.1:18080/')
auth=json.loads(Path(sys.argv[1]).read_text());admin=Client();admin.login(auth['email'],auth['password'])
def sql(code):
 pre="require '/app/backend/src/bootstrap.php';require '/app/backend/src/auth.php';require '/app/backend/src/query.php';if(Ekwl\\config()['environment']!=='staging'||!str_contains(Ekwl\\config()['dsn'],'dbname=ekwl_test_'))exit(9);"
 return subprocess.check_output(['docker','exec','ekwl-migration-api','php','-r',pre+code],text=True)
def save(kind,rows):
 route={'rfd':'rfd','booking':'rfd/booking','cutting':'rfd/daily-cutting'}[kind];headers=admin.call(route,{'action':'read'})['data']['headers'];job=admin.call(route,{'action':'begin','file_name':'Synthetic-'+kind+'.csv','headers':headers,'expected_rows':len(rows),'file_sha256':hashlib.sha256(json.dumps(rows).encode()).hexdigest()})['data']['id']
 for i in range(0,len(rows),250):admin.call(route,{'action':'chunk','id':job,'start_row':i+2,'rows':rows[i:i+250]})
 admin.call(route,{'action':'finalize','id':job});return job
rfd=[];booking=[];cut=[]
for e,construction,qty in [('000123','Body','400'),('000123','Body','100'),('000123','Rib','100')]+[('FDR'+str(i).zfill(6),'Body','10')for i in range(110)]:
 r=['0']*22;r[2]=e;r[6]='Blue';r[7]=('Second matching fabric detail' if len(rfd)==1 else 'Long fabric description <source> '+('Cotton, soft fabric details. '*12));r[8]=construction;r[9]='Cotton';r[10]='Buyer';r[14]=qty;r[17]='1';rfd.append(r)
for e,construction,qty in [('000123','Body','400'),('000123','Rib','200')]+[('FDR'+str(i).zfill(6),'Body','20')for i in range(110)]:booking.append([e,'B','Buyer','Team','Supplier',construction,'Cotton','Blue','160','60','kg',qty,'Additional reason\nSecond line'])
for e,date,batch,issued,ready in [('000123','01-Nov-26','C1','200','400'),('000123','01-Nov-26','C1','100','400'),('000123','02-Nov-26','C2','50','100')]+[('FDR'+str(i).zfill(6),'01-Nov-26','C'+str(i),'2','5')for i in range(110)]:cut.append([date,'Buyer','Team',e,'Style','Company','Blue','1000','0','500' if date=='02-Nov-26' else ready]+['0']*15)
heads={k:save(k,r) for k,r in [('rfd',rfd),('booking',booking),('cutting',cut)]}
sql(r'''$plan=Ekwl\run("SELECT id FROM ekwl_plan_uploads WHERE status='complete' ORDER BY uploaded_at DESC,id DESC LIMIT 1")->fetchColumn();Ekwl\run("UPDATE ekwl_plan_records SET ewo='000123',col='Blue',`print`='Yes',emb='No' WHERE upload_id=? AND criteria='Plan/Day' ORDER BY source_row LIMIT 1",[$plan]);$uid=Ekwl\run("SELECT auth_user_id FROM ekwl_site_users WHERE role='admin' LIMIT 1")->fetchColumn();$b=Ekwl\uuid();Ekwl\run("DELETE FROM ekwl_report_heads WHERE kind='sewing'");Ekwl\run("INSERT INTO ekwl_report_heads VALUES ('sewing','all',?)",[$b]);foreach([['100','80','20'],['100','70','30']]as $n)Ekwl\insertRows('sewing_input_output',[['ewo'=>'000123','color'=>'Blue','total_input_qty'=>$n[0],'total_output_qty'=>$n[1],'total_wip_qty'=>$n[2],'report_batch_id'=>$b,'uploaded_by'=>$uid]]);Ekwl\run('UPDATE ekwl_embellishment_send_receive_rows SET is_active=0 WHERE is_active=1');Ekwl\insertRows('embellishment_send_receive_rows',[['batch_id'=>Ekwl\uuid(),'source_row_no'=>2,'is_active'=>true,'Date'=>'01-Nov-26','EWO No'=>'000123','Color'=>'Blue','Today Print Send Qty' . chr(10)=>'400',' Today Print Receive Qty'=>'300','Today EMB Send Qty'=>'0','Today EMB Receive Qty'=>'0','uploaded_by'=>$uid]]);''')
Client().call('rfd/fabrics-details',{'action':'read'},expected=401)
admin.call('rfd/fabrics-details',{'action':'refresh'},csrf=False,expected=403)
r=admin.call('rfd/fabrics-details',{'action':'refresh'})['data'];assert r['integrity']['complete'] and len(r['rows'])==112 and len(r['headers'])==31
main=[row for row in r['rows'] if row[1]=='000123'];assert len(main)==2
body=next(row for row in main if row[4]=='Body');assert 'Second matching fabric detail' in body[3] and 'Long fabric description' in body[3];assert r['report']['model_version']=='fabrics-derived-v5'
for i,row in enumerate(r['rows']):
 if row[1]=='000123':assert r['evidence'][i]['fabric_details_match']['status']=='matched'
for row in main:
 for i,v in {14:'600',15:'600',16:'—',17:'1000',18:'0.6',19:'1000',20:'500',21:'400',22:'300',23:'100',24:'0',25:'0',26:'0',27:'200',28:'100',29:'50'}.items():assert row[i]==v,(i,row[i])
assert r['report']['materialized'];again=admin.call('rfd/fabrics-details',{'action':'refresh'})['data'];assert again['rows']==r['rows'] and again['report']['id']==r['report']['id']
for k,route in [('rfd','rfd'),('booking','rfd/booking'),('cutting','rfd/daily-cutting')]:assert admin.call(route,{'action':'read'})['data']['report']['id']==heads[k]
email='fdr-reader-'+secrets.token_hex(5)+'@fixture.invalid';pwd='Fixture-'+secrets.token_hex(12);admin.call('users',{'action':'create','email':email,'password':pwd,'role':'user','status':'active','permissions':{'slide_22':True}});reader=Client();reader.login(email,pwd)
assert reader.call('rfd/fabrics-details',{'action':'read'})['data']['rows']==r['rows'];reader.call('rfd/fabrics-details',{'action':'refresh'},expected=403)
admin.call('rfd/fabrics-details',{'action':'begin'},expected=400)
id=r['report']['id'];sql("Ekwl\\run(\"UPDATE ekwl_rfd_fabrics_details_rows SET cells=JSON_SET(cells,'$[0]','tampered') WHERE report_id=? AND row_no=1\",["+repr(id)+"]);")
admin.call('rfd/fabrics-details',{'action':'refresh'},expected=409)
encoded=base64.b64encode(json.dumps(r['rows'][0]).encode()).decode();sql("Ekwl\\run('UPDATE ekwl_rfd_fabrics_details_rows SET cells=? WHERE report_id=? AND row_no=1',[base64_decode('"+encoded+"'),"+repr(id)+"]);")
changed=[list(x)for x in booking];changed[0][11]='500';heads['booking']=save('booking',changed)
new=admin.call('rfd/fabrics-details',{'action':'refresh'})['data'];assert new['report']['dependency_digest']!=r['report']['dependency_digest'];assert [x for x in new['rows'] if x[1]=='000123'][0][14]=='700'
# Leave the known baseline for browser assertions.
save('booking',booking);admin.call('rfd/fabrics-details',{'action':'refresh'})
print(json.dumps({'derived_rows':len(r['rows']),'columns':31,'source_heads_verified':True,'exact_formulas':True,'materialized_cell_tampering_blocked':True,'changed_sources_recomputed':True,'source_tables_unchanged_by_calculation':True,'permissions':True}))
