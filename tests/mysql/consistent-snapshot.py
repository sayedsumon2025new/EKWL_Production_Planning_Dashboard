"""Read/write SYNTHETIC localhost fixture only; never configure for a hosted database."""
from client import *
import gzip, subprocess
assert BASE.startswith('http://127.0.0.1:18080/')
auth=json.loads(Path(sys.argv[1]).read_text());c=Client();c.login(auth['email'],auth['password'])
def sql(code,memory_limit=None):
    prefix="require '/app/backend/src/bootstrap.php';require '/app/backend/src/auth.php';require '/app/backend/src/query.php';require '/app/backend/src/imports.php';if(Ekwl\\config()['environment']!=='staging'||!str_contains(Ekwl\\config()['dsn'],'dbname=ekwl_test_'))exit(9);"
    command=['docker','exec','ekwl-migration-api','php']
    if memory_limit:command+=['-d','memory_limit='+memory_limit]
    return subprocess.check_output(command+['-r',prefix+code],text=True)
seed=r'''
$u=Ekwl\run("SELECT auth_user_id FROM ekwl_site_users WHERE role='admin' LIMIT 1")->fetchColumn();$id=Ekwl\uuid();
Ekwl\transaction(function()use($u,$id){
 Ekwl\insertRows('plan_uploads',[['id'=>$id,'file_name'=>'synthetic-90-days.csv','row_count'=>1000,'expected_daily_rows'=>90000,'status'=>'processing','uploaded_by'=>$u,'revision'=>1]]);
 for($i=0;$i<1000;$i++)Ekwl\insertRows('plan_records',[['upload_id'=>$id,'source_row'=>$i+2,'line_no'=>'Line 1','buyer'=>'Synthetic','ewo'=>sprintf('%08d',$i),'col'=>'Blue','criteria'=>['Plan/Day','SAH/Day','Clock Hour/Day','Effi/Day'][$i%4],'is_summary_row'=>false,'total'=>'90.00360000','psd'=>'2026-11-01']]);
 $records=Ekwl\run('SELECT id FROM ekwl_plan_records WHERE upload_id=? ORDER BY source_row',[$id])->fetchAll(PDO::FETCH_COLUMN);
 $args=[];$marks=[];
 foreach($records as $r)for($d=0;$d<90;$d++){
  $args[]=$id;$args[]=$r;$args[]=(new DateTimeImmutable('2026-11-01'))->modify('+'.$d.' days')->format('Y-m-d');$args[]='1.00004000';$marks[]='(?,?,?,?)';
  if(count($marks)===500){Ekwl\run('INSERT INTO ekwl_plan_daily (upload_id,record_id,plan_date,value) VALUES '.implode(',',$marks),$args);$args=[];$marks=[];}
 }
 Ekwl\finalizePlan($id,['auth_user_id'=>$u]);
});echo json_encode(['id'=>$id,'uid'=>$u]);'''
f=json.loads(sql(seed));uid=f['id']
Client().call('planning/snapshot',{'upload_id':uid},expected=401)
c.call('planning/snapshot',{'upload_id':uid},csrf=False,expected=403)
c.call('planning/snapshot',{'upload_id':"x' OR 1=1"},expected=400)
t=time.monotonic();data=c.call('planning/snapshot',{'upload_id':uid})['data'];elapsed=time.monotonic()-t
assert data['integrity']['complete'] and data['integrity']['totals_reconciled']
assert data['integrity']['daily_count']==len(data['daily'])==90000
assert len(data['records'])==1000 and len({tuple(r[:2]) for r in data['daily']})==90000
assert data['records'][0]['ewo']=='00000000' and all(x[2]=='1.00004000' for x in data['daily'])
cli=json.loads(sql("require '/app/backend/src/planning-snapshot.php';Ekwl\\planningSnapshotRead(Ekwl\\profile("+repr(f['uid'])+"),['upload_id'=>"+repr(uid)+"]);",'32M'))
assert cli['data']==data
expected=[]
for offset in range(0,90000,1000):expected+=c.query('plan_daily',fields='record_id,plan_date,value',filters=[['eq','upload_id',uid]],orders=[['plan_date',True],['record_id',True]],offset=offset,limit=1000)['data']
assert data['daily']==[[r['record_id'],r['plan_date'],r['value']] for r in expected]
req=urllib.request.Request(BASE+'?route=planning/snapshot',data=json.dumps({'upload_id':uid}).encode(),headers={'Origin':'http://127.0.0.1:18080','X-CSRF-Token':c.csrf,'Content-Type':'application/json','Accept-Encoding':'gzip'})
with c.opener.open(req,timeout=60) as r:
    encoded=r.read();assert r.headers.get('Content-Encoding')=='gzip';decoded=gzip.decompress(encoded);assert json.loads(decoded)['data']==data
sql("Ekwl\\run('UPDATE ekwl_plan_uploads SET expected_daily_rows=89999 WHERE id=?',["+repr(uid)+"]);")
c.call('planning/snapshot',{'upload_id':uid},expected=409)
sql("Ekwl\\run('UPDATE ekwl_plan_uploads SET expected_daily_rows=90000 WHERE id=?',["+repr(uid)+"]);Ekwl\\run('UPDATE ekwl_plan_records SET total=999 WHERE upload_id=? AND source_row=2',["+repr(uid)+"]);")
c.call('planning/snapshot',{'upload_id':uid},expected=409)
sql("Ekwl\\run('UPDATE ekwl_plan_records SET total=90.0036 WHERE upload_id=? AND source_row=2',["+repr(uid)+"]);")
# More than one internal page, preserving exact decimals and source order.
job=c.call('imports',{'action':'begin','kind':'fabric','expected_rows':1201,'replace':True})['data']['id']
for start in range(0,1201,150):
    c.call('imports',{'action':'chunk','id':job,'chunk_no':start//150,'rows':[{'ewo':str(i).zfill(7),'color_name':'Blue','total_cut_qty':'12.50000000'} for i in range(start,min(start+150,1201))]})
c.call('imports',{'action':'finalize','id':job})
fabric=c.call('reports/snapshot',{'kind':'fabric'})['data']
assert len(fabric['rows'])==fabric['integrity']['row_count']==1201
assert [r['ewo'] for r in fabric['rows']]==[str(i).zfill(7) for i in range(1201)]
assert all(r['total_cut_qty']=='12.50000000' for r in fabric['rows'])
limited_password='Fixture-'+secrets.token_hex(12);limited_email='snapshot-'+secrets.token_hex(5)+'@fixture.invalid'
c.call('users',{'action':'create','email':limited_email,'password':limited_password,'role':'user','status':'active','permissions':{}})
limited=Client();limited.login(limited_email,limited_password)
limited.call('reports/snapshot',{'kind':'fabric'},expected=403)
# Anonymous report reads are denied before any body is streamed.
# Shared reports use the same authorization and output values as the existing query.
for kind,table in [('fabric','fabric_cutting_info'),('sewing','sewing_input_output'),('production','date_wise_production'),('size','size_set_rows'),('accessories','accessories_rows'),('embellishment','embellishment_send_receive_rows')]:
    d=c.call('reports/snapshot',{'kind':kind})['data'];assert d['kind']==kind and d['integrity']['complete'] and len(d['rows'])==d['integrity']['row_count']
c.call('reports/snapshot',{'kind':'users'},expected=400)
Client().call('reports/snapshot',{'kind':'fabric'},expected=401)
print(json.dumps({'synthetic_daily_values':90000,'snapshot_requests':1,'legacy_daily_requests':90,'exact_value_order_parity':True,'php_32mb_stream_passed':True,'snapshot_seconds_local':round(elapsed,3),'gzip_bytes':len(encoded),'json_bytes':len(decoded),'metadata_mismatch_blocked':True,'totals_mismatch_blocked':True,'private_production_data_verified':False}))
