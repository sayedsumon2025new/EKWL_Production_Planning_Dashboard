"""Run repository PostgreSQL fixtures and compare every returned field with PHP ports.
All containers and files are local, synthetic and isolated from production.
"""
import json,secrets,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
PG='ekwl-migration-pg';PHP='ekwl-migration-api'
env=Path('/tmp/ekwl-pg-fixture.env');env.write_text('POSTGRES_PASSWORD='+secrets.token_hex(24)+'\n');env.chmod(0o600)
if subprocess.run(['docker','inspect',PG],capture_output=True).returncode!=0:
    subprocess.run(['docker','run','-d','--name',PG,'--network','ekwl-migration-test','--env-file',str(env),'postgres:17'],check=True,stdout=subprocess.DEVNULL)
for _ in range(60):
    if subprocess.run(['docker','exec',PG,'pg_isready','-U','postgres'],capture_output=True).returncode==0:break
    time.sleep(0.3)
else:raise RuntimeError('Fixture PostgreSQL unavailable')
def psql(sql,db='postgres'):
    return subprocess.run(['docker','exec','-i',PG,'psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],input=sql,text=True,capture_output=True,check=True).stdout
schema=(ROOT/'tests/readiness-schema.sql').read_text().replace('create role anon nologin;','').replace('create role authenticated nologin;','')
psql("DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;")
extra="ALTER TABLE public.sewing_input_output ADD COLUMN uploaded_at timestamptz DEFAULT now();CREATE TABLE public.date_wise_production(id bigint generated always as identity primary key,ewo text,line_no integer,output_date date,total_qty numeric);GRANT SELECT ON public.date_wise_production TO authenticated;"
files=['supabase/migrations/20261014020815_ewo_readiness_board.sql','supabase/migrations/20261014021617_ewo_readiness_daily_unique_scan.sql','supabase/migrations/20261014032704_flexible_date_parser.sql','supabase/migrations/20261014065351_ready_input_coverage.sql','supabase/migrations/20261014065710_ready_input_scoped_query.sql']
setup=schema+extra+'\n'+'\n'.join((ROOT/p).read_text() for p in files)
tables=['plan_uploads','plan_records','plan_daily','line_chassis_priority','fabric_cutting_info','sewing_input_output','accessories_rows','size_set_rows','embellishment_send_receive_rows','date_wise_production']
for kind,file,marker,view in [('board','tests/ewo-readiness.sql','reset role;\ninsert into public.line_chassis_priority','ewo_readiness_board'),('coverage','tests/ready-input-coverage.sql','savepoint off_day;','ready_input_coverage')]:
    db='oracle_'+kind+'_'+secrets.token_hex(3);psql('CREATE DATABASE '+db+';')
    if kind=='coverage':
        # Roles are cluster-wide; the second fixture database reuses the existing roles.
        setup2=setup.replace('create role anon nologin;','').replace('create role authenticated nologin;','')
    else:setup2=setup
    psql(setup2,db)
    values=','.join("'"+t+"',(SELECT coalesce(jsonb_agg(r),'[]'::jsonb) FROM public."+t+" r)" for t in tables)
    export="\nRESET ROLE;SELECT 'EKWL_ORACLE:'||jsonb_build_object('kind','"+kind+"','today',(now() at time zone 'Asia/Dhaka')::date,'data',jsonb_build_object("+values+"),'expected',(SELECT coalesce(jsonb_agg(v),'[]'::jsonb) FROM public."+view+" v))::text;\n"
    fixture=(ROOT/file).read_text();assert marker in fixture
    output=psql(fixture.replace(marker,export+marker,1),db)
    row=next(line[len('EKWL_ORACLE:'):] for line in output.splitlines() if line.startswith('EKWL_ORACLE:'))
    parsed=json.loads(row);path=Path('/tmp')/('ekwl-oracle-'+kind+'.json');path.write_text(json.dumps(parsed));path.chmod(0o600)
    subprocess.run(['docker','exec','-i',PHP,'php','tests/mysql/derived-parity.php','php://stdin'],input=json.dumps(parsed),text=True,check=True)
print('PASS original PostgreSQL fixtures and field-by-field PHP parity against synthetic PostgreSQL outputs; no live project accessed')
