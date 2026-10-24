"""Read-only repeatable-read PostgreSQL export. Never loads runtime browser keys.
Install tools/mysql/requirements-export.txt in an operator-controlled environment.
"""
import argparse, datetime, decimal, hashlib, json, os, re, uuid
from pathlib import Path

def scalar(value):
    if isinstance(value,(datetime.date,datetime.datetime,datetime.time)):return value.isoformat()
    if isinstance(value,decimal.Decimal):return format(value,'f')
    if isinstance(value,uuid.UUID):return str(value)
    if isinstance(value,dict):return {k:scalar(v) for k,v in value.items()}
    if isinstance(value,(tuple,list)):return [scalar(v) for v in value]
    if isinstance(value,bytes):raise ValueError('Binary columns need an explicit migration mapping.')
    return value

def main():
    p=argparse.ArgumentParser();p.add_argument('--project-id',required=True);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    if a.project_id!='rdslpcazdzqjlenbezaf':raise SystemExit('Wrong source project; inspect the production config before proceeding.')
    if not os.getenv('EKWL_SOURCE_PG_DSN'):raise SystemExit('Set EKWL_SOURCE_PG_DSN through secure environment configuration. Never paste credentials in chat.')
    import psycopg
    from psycopg import sql
    with psycopg.connect(os.environ['EKWL_SOURCE_PG_DSN'],autocommit=True) as conn:
        info=conn.info
        if a.project_id not in (info.host+' '+info.user):raise SystemExit('Connection identity does not contain the expected project ref. Verify the project-specific direct/pooler connection first.')
        if a.out.exists() and any(a.out.iterdir()):raise SystemExit('Use a new private export directory; existing evidence will not be overwritten.')
        a.out.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(a.out,0o700)
        conn.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        manifest={'format':'ekwl-source-v1','project_id':a.project_id,'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tables':{},'schema':{},'foreign_keys':[],'auth_passwords_exported':False}
        tables=conn.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name").fetchall()
        for (name,) in tables:
            if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',name):raise RuntimeError('Unmapped source table filename: '+name)
            cols=conn.execute("SELECT column_name,data_type,is_nullable,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position",(name,)).fetchall()
            pk=[r[0] for r in conn.execute("SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=%s::regclass AND i.indisprimary ORDER BY array_position(i.indkey,a.attnum)",('public.'+name,))]
            if not pk:raise RuntimeError('Source table has no primary key: '+name+'; establish a reviewed stable export key.')
            filename=name+'.ndjson';count=0;digest=hashlib.sha256()
            with (a.out/filename).open('wb') as output,conn.cursor(name='export_'+name) as cur:
                cur.execute(sql.SQL('SELECT * FROM public.{} ORDER BY {}').format(sql.Identifier(name),sql.SQL(',').join(map(sql.Identifier,pk))))
                names=[c.name for c in cur.description]
                while True:
                    rows=cur.fetchmany(500)
                    if not rows:break
                    for row in rows:
                        line=(json.dumps(scalar(dict(zip(names,row))),ensure_ascii=False,separators=(',',':'))+'\n').encode()
                        output.write(line);digest.update(line);count+=1
            expected=conn.execute(sql.SQL('SELECT COUNT(*) FROM public.{}').format(sql.Identifier(name))).fetchone()[0]
            if count!=expected:raise RuntimeError('Source count differs for '+name)
            manifest['tables'][name]={'file':filename,'rows':count,'sha256':digest.hexdigest(),'primary_key':pk}
            manifest['schema'][name]=[list(c) for c in cols]
        manifest['foreign_keys']=[list(r) for r in conn.execute("SELECT conrelid::regclass::text,confrelid::regclass::text,pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY conrelid::regclass::text,conname")]
        # Auth identities only: never export password hashes, sessions, refresh tokens or MFA secrets.
        try:
            identities=conn.execute('SELECT id,email,created_at FROM auth.users ORDER BY id').fetchall()
            (a.out/'auth-identities.json').write_text(json.dumps(scalar([dict(zip(['id','email','created_at'],r)) for r in identities]),ensure_ascii=False))
            manifest['auth_identity_count']=len(identities)
            manifest['auth_identity_sha256']=hashlib.sha256((a.out/'auth-identities.json').read_bytes()).hexdigest()
        except psycopg.errors.InsufficientPrivilege:
            # The failed statement aborts the read transaction; refuse a supposedly complete export.
            raise RuntimeError('Auth identity inventory not authorized; export is incomplete.')
        conn.rollback()
        (a.out/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
        print(json.dumps({'tables':len(tables),'rows':sum(t['rows'] for t in manifest['tables'].values()),'manifest':str(a.out/'manifest.json')}))
if __name__=='__main__':main()
