"""Build code-only live updates; preserve all server configuration and data."""
import argparse, hashlib, json, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--out',type=Path,required=True)
p.add_argument('--version',required=True)
a=p.parse_args()
subprocess.run([sys.executable,str(ROOT/'tools/mysql/package_live.py'),'--out',str(a.out),'--asset-version',a.version],check=True)
site=a.out.resolve()/'site'
for f in (site/'backend/config').iterdir():f.unlink()
(site/'backend/config').rmdir()
files=[]
for f in sorted(site.rglob('*')):
    if not f.is_file():continue
    rel=f.relative_to(site)
    if f.is_symlink() or any(part in {'private','config','ekwl-staging','ekwl-mysql','database','tools','downloads'} for part in rel.parts):
        raise SystemExit('Protected path in deployment payload')
    if f.suffix.lower() in {'.sql','.ndjson','.zip'} or f.name.endswith('.local.php'):
        raise SystemExit('Private/data file in deployment payload')
    files.append({'path':rel.as_posix(),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
(a.out/'ekwl-live-root.zip').unlink()
(a.out/'release-manifest.json').unlink()
(a.out/'deploy-manifest.json').write_text(json.dumps({'version':a.version,'files':files,'database_changes':False,'preserves_server_config':True},indent=2)+'\n')
print('Code-only deployment built; no SQL, credentials or server config included.')
