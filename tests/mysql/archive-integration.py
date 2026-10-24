"""Local fixture quarterly export/checksum/restore tests; never target hosting."""
from client import *
import os,subprocess
container=os.environ.get('EKWL_TEST_CONTAINER','ekwl-migration-api')
def php(script,env=None):
    cmd=['docker','exec']
    if env:cmd+=['-e','EKWL_CONFIG_FILE='+env]
    return subprocess.check_output(cmd+[container,'php','-r',script],text=True)
def cli(tool,*args,config=None):
    cmd=['docker','exec']
    if config:cmd+=['-e','EKWL_CONFIG_FILE='+config]
    return subprocess.check_output(cmd+[container,'php','tools/mysql/'+tool,*args],text=True)
auth=json.loads(Path(sys.argv[1]).read_text());c=Client();c.login(auth['email'],auth['password'])
quarter='2026-Q4';estimate=c.call('archive',dict(action='estimate',quarter=quarter))['data']
assert estimate['total_rows']>0
c.call('archive',dict(action='begin',quarter=quarter),expected=409)
php("$p='/app/backend/config/config.local.php';$c=require $p;$c['maintenance']=true;$c['archive_attestation_key']=bin2hex(random_bytes(32));file_put_contents($p,'<?php return '.var_export($c,true).';');")
try:
    for _ in range(12):
        if c.call('runtime')['data']['maintenance']:break
        time.sleep(0.5)
    else:raise AssertionError('Write-pause configuration not active')
    job=c.call('archive',dict(action='begin',quarter=quarter))['data']['id']
    assert c.call('archive',dict(action='begin',quarter=quarter))['data']['job']['id']==job
    for _ in range(1000):
        data=c.call('archive',dict(action='step',id=job))['data']
        if data['state']=='exported':break
    else:raise AssertionError('Archive did not finish')
    verified=c.call('archive',dict(action='verify',id=job))['data']
    assert verified['state']=='verified' and not verified['cleanup_available']
    assert verified['manifest']['counts']==estimate['counts']
    assert not verified['manifest']['restore_tested']
    download=BASE+'?'+urllib.parse.urlencode(dict(route='archive/download',id=job,file='manifest.json'))
    assert json.load(c.opener.open(download))['verified']
    archive='/app/backend/private/archives/'+job+'/manifest.json'
    assert json.loads(cli('restore_archive.php',archive))['mode']=='validated-dry-run'
    # New empty database, separate configuration. Production/source data are preserved.
    name='ekwl_restore_'+secrets.token_hex(4)
    config='/app/backend/config/restore.local.php'
    php("require '/app/backend/src/bootstrap.php';Ekwl\\db()->exec('CREATE DATABASE "+name+" CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');$c=Ekwl\\config();$c['dsn']=preg_replace('/dbname=[^;]+/','dbname="+name+"',$c['dsn']);file_put_contents('"+config+"','<?php return '.var_export($c,true).';');")
    cli('migrate.php',config=config)
    report=json.loads(cli('restore_archive.php',archive,'--apply',config=config))
    assert report['passed'],report
    assert json.loads(cli('restore_archive.php',archive,'--apply',config=config))['passed']
    assert report.get('signature'), 'Restore evidence must be signed when configured'
    c.call('archive',dict(action='cleanup',id=job),expected=404)
    # Historical fixture: signed proof + explicit authorization + active Admin + write pause.
    old=str(uuid.uuid4());actor=php("require '/app/backend/src/bootstrap.php';echo Ekwl\\run(\"SELECT auth_user_id FROM ekwl_site_users WHERE LOWER(role)='admin' LIMIT 1\")->fetchColumn();").strip()
    php("require '/app/backend/src/bootstrap.php';Ekwl\\run(\"INSERT INTO ekwl_plan_uploads(id,file_name,row_count,status,planning_month,uploaded_at) VALUES (?, 'historical fixture',0,'complete','2025-01-01','2025-01-02')\",['"+old+"']);")
    historical=c.call('archive',dict(action='begin',quarter='2025-Q1'))['data']['id']
    for _ in range(1000):
        if c.call('archive',dict(action='step',id=historical))['data']['state']=='exported':break
    c.call('archive',dict(action='verify',id=historical))
    hm='/app/backend/private/archives/'+historical+'/manifest.json'
    fresh='ekwl_cleanup_restore_'+secrets.token_hex(4)
    php("require '/app/backend/src/bootstrap.php';Ekwl\\db()->exec('CREATE DATABASE "+fresh+" CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');$c=Ekwl\\config();$c['dsn']=preg_replace('/dbname=[^;]+/','dbname="+fresh+"',$c['dsn']);file_put_contents('"+config+"','<?php return '.var_export($c,true).';');")
    cli('migrate.php',config=config)
    signed=cli('restore_archive.php',hm,'--apply',config=config)
    proof='/app/backend/private/archives/'+historical+'/restore-test.json'
    import base64
    php("file_put_contents('"+proof+"',base64_decode('"+base64.b64encode(signed.encode()).decode()+"'));")
    assert json.loads(cli('cleanup_archive.php',hm,proof))['summary']['eligible']==1
    rejected=subprocess.run(['docker','exec',container,'php','tools/mysql/cleanup_archive.php',hm,proof,'--execute'],capture_output=True)
    assert rejected.returncode!=0
    php("$p='/app/backend/config/config.local.php';$c=require $p;$c['allow_archive_cleanup']=true;file_put_contents($p,'<?php return '.var_export($c,true).';');")
    cleaned=json.loads(cli('cleanup_archive.php',hm,proof,'--execute','--authorization=LOCAL-FIXTURE-ONLY','--admin-auth-id='+actor))
    assert cleaned['summary']['deleted']==1 and not cleaned['notes_or_identities_touched']
    assert json.loads(cli('cleanup_archive.php',hm,proof))['summary']['already_missing']==1
    print('PASS separately gated historical cleanup: signed restore evidence, default dry run, denied unauthorized execution, recorded Admin authorization, idempotence')
    print('PASS quarterly estimate, write pause, duplicate-job protection, resumable export, checksums, private downloads, isolated restore, exact field/count verification and idempotent restore; cleanup disabled')
finally:
    php("$p='/app/backend/config/config.local.php';$c=require $p;$c['maintenance']=false;$c['allow_archive_cleanup']=false;file_put_contents($p,'<?php return '.var_export($c,true).';');")
