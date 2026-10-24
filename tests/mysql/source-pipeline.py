"""Synthetic PostgreSQL export -> fresh MySQL import -> complete reconciliation.
Requires local Docker fixture containers and tools/mysql/requirements-export.txt.
Does not contact Supabase. No credentials are printed or committed.
"""
import json,os,secrets,subprocess,tempfile,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
PG='ekwl-migration-pg';API='ekwl-migration-api'
def pg(sql,db='postgres'):
    return subprocess.run(['docker','exec','-i',PG,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],input=sql,text=True,check=True,capture_output=True).stdout
def php(script):return subprocess.check_output(['docker','exec',API,'php','-r',script],text=True)
name='source_'+secrets.token_hex(4);role='postgres.rdslpcazdzqjlenbezaf';password=secrets.token_hex(24)
pg('CREATE DATABASE '+name+';')
# Role name contains the expected project reference only to exercise the identity guard locally.
pg('DO $$ BEGIN CREATE ROLE "'+role+'" LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; ALTER ROLE "'+role+'" PASSWORD \''+password+'\';')
uid=str(uuid.uuid4());upload=str(uuid.uuid4())
pg("""CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,created_at timestamptz);
CREATE TABLE public.site_users(id bigint PRIMARY KEY,auth_user_id uuid,email text,role text,status text,permissions jsonb,created_at timestamptz);
CREATE TABLE public.plan_uploads(id uuid PRIMARY KEY,file_name text,row_count bigint,status text,planning_month date,sequence_no bigint,planning_id text,uploaded_at timestamptz,uploaded_by uuid);
CREATE TABLE public.plan_records(id bigint PRIMARY KEY,upload_id uuid REFERENCES plan_uploads(id),source_row bigint,ewo text,order_qty numeric,psd date,is_summary_row boolean,unit text);
CREATE TABLE public.plan_daily(id bigint PRIMARY KEY,upload_id uuid,record_id bigint REFERENCES plan_records(id),plan_date date,value numeric);
INSERT INTO auth.users VALUES ('UID','source@fixture.invalid','2026-10-01T12:34:56.123456+06');
INSERT INTO site_users SELECT 1,id,email,'admin','active','{"slide21":true}',created_at FROM auth.users;
INSERT INTO plan_uploads VALUES ('UPLOAD','বাংলা.csv',1,'complete','2026-10-01',8,'P08','2026-10-17T12:00:00+06','UID');
INSERT INTO plan_records VALUES (1,'UPLOAD',2,'0000123',123456789.12345678,'2026-10-17',false,'EKWL Highway');
INSERT INTO plan_daily VALUES (1,'UPLOAD',1,'2026-10-17',0.00000001);
CREATE TABLE public.line_chassis_priority(id bigint PRIMARY KEY,line_no integer,priority_order integer,product_name text,updated_at timestamptz);
CREATE TABLE public.abp_target(id bigint PRIMARY KEY,parameter_name text UNIQUE,target_value numeric,config jsonb,updated_at timestamptz);
CREATE TABLE public.slide4_chassis_strength(id bigint PRIMARY KEY,item_name text,line_strength numeric,sort_order integer,updated_at timestamptz);
CREATE TABLE public.order_bank_staging(staging_id bigint PRIMARY KEY,"Code-EWO" text,"EWO" text);
CREATE TABLE public.fabric_cutting_info(id bigint PRIMARY KEY,pattern_received_time text,ewo text);
INSERT INTO line_chassis_priority VALUES (90001,1,1,'Shirt','2026-10-17T12:00:00Z');
INSERT INTO abp_target VALUES (90002,'Daily Capacity',10133,'{}','2026-10-17T12:00:00Z');
INSERT INTO slide4_chassis_strength VALUES (90003,'Shirt',2.5,1,'2026-10-17T12:00:00Z');
INSERT INTO order_bank_staging VALUES (90004,'001-0000123','0000123');
INSERT INTO fabric_cutting_info VALUES (90005,'Pending / 9 PM','0000123');
GRANT USAGE ON SCHEMA public,auth TO "ROLE";
GRANT SELECT ON ALL TABLES IN SCHEMA public,auth TO "ROLE";
""".replace('UID',uid).replace('UPLOAD',upload).replace('ROLE',role),name)
ip=subprocess.check_output(['docker','inspect','-f','{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',PG],text=True).strip()
with tempfile.TemporaryDirectory(prefix='ekwl-source-fixture-') as tmp:
    out=Path(tmp)/'export';env=dict(os.environ,EKWL_SOURCE_PG_DSN=f'host={ip} dbname={name} user={role} password={password}')
    subprocess.run(['python',str(ROOT/'tools/mysql/export_source.py'),'--project-id','rdslpcazdzqjlenbezaf','--out',str(out)],env=env,check=True)
    target='ekwl_source_'+secrets.token_hex(4);config='/app/backend/config/source.local.php';dest='/tmp/'+target
    php("require '/app/backend/src/bootstrap.php';Ekwl\\db()->exec('CREATE DATABASE "+target+" CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');$c=Ekwl\\config();$c['dsn']=preg_replace('/dbname=[^;]+/','dbname="+target+"',$c['dsn']);file_put_contents('"+config+"','<?php return '.var_export($c,true).';');")
    subprocess.run(['docker','cp',str(out),API+':'+dest],check=True)
    def cli(tool,*args,ok=True):
        r=subprocess.run(['docker','exec','-e','EKWL_CONFIG_FILE='+config,API,'php','tools/mysql/'+tool,*args],text=True,capture_output=True)
        if ok and r.returncode:raise RuntimeError(r.stderr)
        return r
    cli('migrate.php');manifest=dest+'/manifest.json'
    assert json.loads(cli('import_source.php',manifest).stdout)['mode']=='validated-dry-run'
    cli('import_source.php',manifest,'--apply');cli('import_source.php',manifest,'--apply')
    report=json.loads(cli('reconcile.php',manifest).stdout);assert report['passed'],report
    check="require '/app/backend/src/bootstrap.php';if(Ekwl\\run('SELECT password_hash FROM ekwl_users')->fetchColumn()!==null)exit(1);"
    subprocess.run(['docker','exec','-e','EKWL_CONFIG_FILE='+config,API,'php','-r',check],check=True)
    # Owner-mapped Notes, dry run, retry and deliberate owner conflict.
    note=dict(id=str(uuid.uuid4()),source_owner='legacy1',title='Private বাংলা',content='<b>literal</b>',updated_at='2026-10-17T12:00:00Z')
    lines=(json.dumps(note)+'\n').encode();(out/'notes.ndjson').write_bytes(lines)
    import hashlib
    mapping=dict(format='ekwl-notes-v1',owner_map={'legacy1':uid},file='notes.ndjson',sha256=hashlib.sha256(lines).hexdigest(),rows=1)
    (out/'notes-manifest.json').write_text(json.dumps(mapping))
    for file in ['notes.ndjson','notes-manifest.json']:subprocess.run(['docker','cp',str(out/file),API+':'+dest+'/'+file],check=True)
    nm=dest+'/notes-manifest.json';cli('import_notes.php',nm);cli('import_notes.php',nm,'--apply');cli('import_notes.php',nm,'--apply')
    mapping['owner_map']={};(out/'notes-manifest.json').write_text(json.dumps(mapping));subprocess.run(['docker','cp',str(out/'notes-manifest.json'),API+':'+nm],check=True)
    assert cli('import_notes.php',nm,'--apply',ok=False).returncode!=0
    # Offline SQL bootstrap for an existing imported Admin; SQL never printed.
    seed=subprocess.check_output(['docker','exec','-i',API,'php','tools/mysql/create_admin_seed.php','source@fixture.invalid',uid],input=('Fixture-'+secrets.token_hex(16)+'\n').encode())
    script="require '/app/backend/src/bootstrap.php';Ekwl\\db()->exec(stream_get_contents(STDIN));"
    subprocess.run(['docker','exec','-i','-e','EKWL_CONFIG_FILE='+config,API,'php','-r',script],input=seed,check=True)
    assert report['tables']['plan_daily']['matching_rows']==1
    for table in ['line_chassis_priority','abp_target','slide4_chassis_strength','order_bank_staging','fabric_cutting_info']:assert report['tables'][table]['matching_rows']==1
    # A checksum-valid malformed export must not generate a replacement source ID.
    malformed=json.loads((out/'manifest.json').read_text());name='line_chassis_priority'
    row=json.loads((out/'line_chassis_priority.ndjson').read_text());del row['id']
    bad=(json.dumps(row)+'\n').encode();(out/'missing-key.ndjson').write_bytes(bad)
    malformed['tables'][name]=dict(malformed['tables'][name],file='missing-key.ndjson',sha256=hashlib.sha256(bad).hexdigest())
    (out/'missing-key-manifest.json').write_text(json.dumps(malformed))
    for file in ['missing-key.ndjson','missing-key-manifest.json']:subprocess.run(['docker','cp',str(out/file),API+':'+dest+'/'+file],check=True)
    rejected=cli('import_source.php',dest+'/missing-key-manifest.json','--apply',ok=False)
    assert rejected.returncode!=0 and 'Missing source primary key' in rejected.stderr+rejected.stdout, (rejected.returncode,(rejected.stderr+rejected.stdout)[-1200:])
    print('PASS read-only synthetic PG export, Unicode/leading zeros/exact decimals/UTC, new MySQL dry-run/import/retry/full reconciliation, NULL passwords, mapped Notes retry/rejection, offline Admin seed, live-schema source IDs/staging/Unit/free-form time preservation')
