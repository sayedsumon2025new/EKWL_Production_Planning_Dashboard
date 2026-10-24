"""Build a private-config-free review package. Does not connect to FTP or deploy."""
import argparse,hashlib,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out',type=Path,help='New output directory; an existing directory is never overwritten.')
args=parser.parse_args()
OUT=(args.out or ROOT/'dist/mysql-staging').resolve()
if OUT.exists():raise SystemExit('Package already exists. Inspect it and choose a new output location before rebuilding.')
OUT.mkdir(parents=True)
for file in ROOT.iterdir():
    if file.is_file() and file.suffix.lower() in {'.html','.js','.css','.svg','.png','.jpg','.jpeg','.webp','.ico','.woff','.woff2','.ttf'}:
        shutil.copy2(file,OUT/file.name)
for directory in ['api','backend','database/mysql','tools/mysql']:
    source=ROOT/directory
    def ignore(path,names):
        return [n for n in names if n=='private' or n=='__pycache__' or n.endswith('.local.php') or n.endswith('.ndjson') or n.startswith('.env')]
    shutil.copytree(source,OUT/directory,ignore=ignore,dirs_exist_ok=True)
(OUT/'.htaccess').write_text('Options -Indexes\n<IfModule mod_headers.c>\nHeader always set Referrer-Policy "same-origin"\nHeader always set X-Content-Type-Options "nosniff"\n</IfModule>\n')
for name in ['backend','database','tools']:(OUT/name/'.htaccess').write_text('Require all denied\n')
files=[]
for file in sorted(OUT.rglob('*')):
    if not file.is_file():continue
    if file.is_symlink() or file.name.endswith('.local.php') or 'private' in file.relative_to(OUT).parts:raise RuntimeError('Private file included')
    files.append({'path':str(file.relative_to(OUT)),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(OUT/'package-manifest.json').write_text(json.dumps({'production_ready':False,'cutover_approved':False,'files':files},indent=2)+'\n')
print(f'Built {len(files)} files at {OUT}. No deployment performed; production cutover remains blocked.')
