"""Local API fixture integration. Requires an isolated populated test runtime."""
from client import *
auth=json.loads(Path(sys.argv[1]).read_text());admin=Client()
admin.query('plan_uploads',expected=401)
admin.login(auth['email'],auth['password'])
admin.call('runtime',{},csrf=False,expected=403)
admin.call('runtime',{},origin='https://wrong.invalid',expected=403)
assert admin.call('runtime')['data']['pdo_mysql']
admin.call('users',dict(action='create',email='too-long@fixture.invalid',password='x'*73,role='user',status='active',permissions={}),expected=400)
# All dynamic SQL identifiers are allowlisted; values are parameterized.
admin.query('site_users` UNION SELECT password_hash FROM ekwl_users --',expected=404)
admin.query('site_users',fields='password_hash',expected=400)
admin.query('site_users',filters=[['eq','email',"' OR 1=1 --"]])
password='Fixture-'+secrets.token_hex(15)
users=[]
for i in range(30):
    r=admin.call('users',dict(action='create',email=f'user{i}@fixture.invalid',password=password,role='user',status='active',permissions={'slide_6':True}))
    users.append(r['data']['auth_user_id'])
user=Client();user.login('user0@fixture.invalid',password)
assert len(user.query('site_users')['data'])==1
user.call('users',dict(action='create'),expected=403)
user.query('fabric_cutting_info',expected=403)
user.query('plan_uploads',op='insert',rows=[{'row_count':1}],expected=403)
user.call('archive',dict(action='estimate',quarter='2026-Q4'),expected=403)
# Private notes cannot be read, updated or deleted by another account, including Admin.
note=user.call('notes',dict(action='save',title='<script>inert</script>',content='private'))['data']['id']
admin.call('notes',dict(action='save',id=note,title='steal',content='x'),expected=404)
admin.call('notes',dict(action='delete',id=note),expected=404)
assert admin.call('notes',dict(action='list'))['data']['notes']==[]
assert user.call('notes',dict(action='list'))['data']['notes'][0]['content']=='private'
print('PASS authentication, CSRF, origin enforcement, allowlisted SQL, role restrictions and Notes isolation')
# Planning staging remains invisible until exact records and daily cells are present.
upload=admin.query('plan_uploads',op='insert',rows=[dict(file_name='fixture.csv',row_count=2,expected_daily_rows=4,planning_month='2026-10-01',sequence_no=1,planning_id='P01')],fields='id',single='required')['data']['id']
rows=[dict(upload_id=upload,source_row=i+2,is_summary_row=False,line_no='Line 1',buyer='Buyer',ewo='00123',col='Blue',criteria=crit,total='100.12500000',psd='2026-10-15') for i,crit in enumerate(['Plan/Day','SAH/Day'])]
records=admin.query('plan_records',op='insert',rows=rows,fields='id,source_row')['data']
assert admin.query('plan_records',filters=[['eq','upload_id',upload]])['data']==[]
admin.query('plan_uploads',op='update',filters=[['eq','id',upload]],values={'status':'complete'},expected=409)
cells=[dict(upload_id=upload,record_id=r['id'],plan_date=d,value='10.12345678') for r in records for d in ['2026-10-15','2026-10-16']]
admin.query('plan_daily',op='insert',rows=cells)
admin.query('plan_uploads',op='update',filters=[['eq','id',upload]],values={'status':'complete'})
assert admin.query('plan_daily',filters=[['eq','upload_id',upload]])['data'][0]['value']=='10.12345678'
assert user.query('plan_records',filters=[['eq','upload_id',upload]])['data'][0]['ewo']=='00123'
admin.query('plan_records',op='insert',rows=rows,expected=403)
print('PASS planning source identifiers, decimal precision, foreign-key model and incomplete snapshot visibility')
# Resumable report chunks: exact replay is harmless; changed retry fails; atomic pointer swap.
def report(kind,rows,replace=True):
    job=admin.call('imports',dict(action='begin',kind=kind,expected_rows=len(rows),replace=replace))['data']['id']
    admin.call('imports',dict(action='chunk',id=job,chunk_no=0,rows=rows))
    return job
job=report('fabric',[dict(ewo='00123',color_name='Blue',total_cut_qty='80.25000000')])
assert admin.query('fabric_cutting_info')['data']==[]
assert admin.call('imports',dict(action='chunk',id=job,chunk_no=0,rows=[dict(ewo='00123',color_name='Blue',total_cut_qty='80.25000000')]))['data']['duplicate']
admin.call('imports',dict(action='chunk',id=job,chunk_no=0,rows=[dict(ewo='CHANGED')]),expected=409)
admin.call('imports',dict(action='finalize',id=job))
assert len(admin.query('fabric_cutting_info')['data'])==1
job2=report('fabric',[dict(ewo='new',color_name='Red',total_cut_qty='5')])
assert admin.query('fabric_cutting_info')['data'][0]['ewo']=='00123'
admin.call('imports',dict(action='finalize',id=job2))
assert [r['ewo'] for r in admin.query('fabric_cutting_info')['data']]==['new']
job3=report('fabric',[dict(ewo='append',color_name='Green',total_cut_qty='2')],False)
admin.call('imports',dict(action='finalize',id=job3))
assert len(admin.query('fabric_cutting_info')['data'])==2
for date,ewo in [('2026-10-15','old15'),('2026-10-16','keep16'),('2026-10-15','new15')]:
    j=report('production',[dict(output_date=date,ewo=ewo,total_qty='10')]);admin.call('imports',dict(action='finalize',id=j))
assert sorted(r['ewo'] for r in admin.query('date_wise_production')['data'])==['keep16','new15']
print('PASS report chunk recovery, retry protection, snapshot activation, append and date-specific production replacement')
# Module snapshots and exact unusual CSV headings.
for table,rpc_name in [('size_set_rows','finalize_size_set_upload'),('accessories_rows','finalize_accessories_upload'),('embellishment_send_receive_rows','finalize_embellishment_upload')]:
    batch=str(uuid.uuid4());row=dict(batch_id=batch,source_row_no=2,file_name='source.csv')
    if table=='embellishment_send_receive_rows':row.update({'Code':'0001','Today Print Send Qty\n':'0010',' Today Print Receive Qty':'0008'})
    else:row['row_data']={'EWO':'00123','Buyer':'Buyer','PSD':'2026-10-15'}
    if table=='accessories_rows':row['report_date']='2026-10-15'
    admin.query(table,op='insert',rows=[row])
    admin.call('rpc',dict(name=rpc_name,args=dict(p_batch_id=batch,p_expected_rows=2,p_file_name='source.csv')),expected=409)
    admin.call('rpc',dict(name=rpc_name,args=dict(p_batch_id=batch,p_expected_rows=1,p_file_name='source.csv')))
    got=admin.query(table,filters=[['eq','is_active',True]])['data'][0]
    if table=='embellishment_send_receive_rows':assert got['Today Print Send Qty\n']=='0010'
    else:assert got['row_data']['EWO']=='00123'
    if table=='accessories_rows':
        next_batch=str(uuid.uuid4());next_row={**row,'batch_id':next_batch,'report_date':'16-Oct','row_data':{**row['row_data'],'PSD':'16-Oct'}}
        admin.query(table,op='insert',rows=[next_row])
        admin.call('rpc',dict(name=rpc_name,args=dict(p_batch_id=next_batch,p_expected_rows=1,p_file_name='source.csv')))
        active=admin.query(table,filters=[['eq','is_active',True]])['data']
        assert len(active)==1 and active[0]['report_date']=='16-Oct'

# Flexible Order Bank columns, blanks and quoted/newline source values.
token=str(uuid.uuid4());headers=['EWO','New Column','Quoted'];source={'EWO':'00123','New Column':'','Quoted':'x, y\nnext line'}
admin.query('order_bank_import_rows',op='insert',rows=[dict(upload_token=token,source_row_no=1,source_data=source)])
rpcargs=dict(p_upload_token=token,p_expected_rows=1,p_file_name='bank.csv',p_source_columns=headers)
result=admin.call('rpc',dict(name='finalize_order_bank_import',args=rpcargs))['data']
assert result['raw_rows']==1
assert admin.call('rpc',dict(name='finalize_order_bank_import',args=rpcargs))['data']['batch_id']==result['batch_id']
got=admin.query('order_bank_latest_all')['data'][0]
assert got['source_data']==source and got['source_columns']==headers
print('PASS module snapshot activation, source headings/newlines, flexible Order Bank cells and finalization retries')
# Recovery tokens grant password-reset access only, never dataset access.
profile=admin.query('site_users',filters=[['eq','auth_user_id',users[0]]])['data'][0]
link=admin.call('users',dict(action='reset-link',site_user_id=profile['id']))['data']['url']
token=urllib.parse.parse_qs(urllib.parse.urlparse(link).query)['token'][0]
recover=Client();recover.call('auth/recovery',dict(token=token));recover.query('plan_uploads',expected=401)
recover.call('auth/password',dict(password=password+'-new'))
recover.call('auth/recovery',dict(token=token),expected=401)
user.query('plan_uploads',expected=401) # Old sessions revoked by auth_version.
user=Client();user.login('user0@fixture.invalid',password+'-new')
admin.call('users',dict(action='update',site_user_id=profile['id'],role='user',status='disabled',permissions={}))
user.query('plan_uploads',expected=401)
print('PASS one-use password recovery, restricted recovery sessions, password-change revocation and deactivation')
# Missing evidence remains unknown; derived reports are independently permission checked.
board=admin.query('ewo_readiness_board',filters=[['eq','upload_id',upload]])['data']
assert len(board)==1 and board[0]['readiness_score'] is None
assert board[0]['print_status']=='unknown'
assert admin.call('rpc',dict(name='get_ready_input_coverage',args={'p_upload_id':upload}))['data']==[]
Client().query('ewo_readiness_board',filters=[['eq','upload_id',upload]],expected=401)
board_profile=admin.query('site_users',filters=[['eq','auth_user_id',users[1]]])['data'][0]
admin.call('users',dict(action='update',site_user_id=board_profile['id'],role='user',status='active',permissions={'slide_21':True}))
board_user=Client();board_user.login('user1@fixture.invalid',password)
assert len(board_user.query('ewo_readiness_board',filters=[['eq','upload_id',upload]])['data'])==1
stage_id=str(uuid.uuid4());admin.query('size_set_rows',op='insert',rows=[dict(batch_id=stage_id,source_row_no=2,file_name='staging.csv',row_data={'EWO':'00123','Color':'Blue','T & A Closed':'Closed'})])
assert board_user.query('size_set_rows',filters=[['eq','batch_id',stage_id]])['data']==[]
assert board_user.query('ewo_readiness_board',filters=[['eq','upload_id',upload]])['data'][0]['size_set_status']=='unknown'
print('PASS actual MySQL readiness/coverage routes, board-only permissions, inactive-evidence exclusion and source-text Accessories dates')
# Thirty independent active-user sessions approximate request concurrency, not shared-host capacity.
def concurrent_read(i):
    c=Client();c.login(f'user{i}@fixture.invalid',password);return len(c.query('plan_uploads')['data'])
start=time.monotonic()
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:results=list(pool.map(concurrent_read,range(1,30)))
assert all(n==1 for n in results)
print(json.dumps({'fixture_registered_users':31,'independent_sessions_tested':29,'concurrency':10,'elapsed_seconds':round(time.monotonic()-start,3),'hosting_capacity_verified':False}))
print('PASS API integration; live production parity remains unverified')
