"""Package an explicitly authorized root-site promotion using the existing CSV database.

No network, credentials, SQL, database initialization or automatic deployment.
The existing protected staging config remains on the host and is never packaged.
"""
import argparse, hashlib, json, shutil, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--out', type=Path, required=True, help='New output directory')
p.add_argument('--asset-version', default='mysql-live-20261025', help='Public runtime asset cache version')
a = p.parse_args()
import re
if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', a.asset_version):
    raise SystemExit('Invalid asset version')
out = a.out.resolve()
if out.exists():
    raise SystemExit('Choose a new output directory; existing files are never overwritten.')
out.mkdir(parents=True)
site = out / 'site'
site.mkdir()
extensions = {'.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2', '.ttf'}
for source in ROOT.iterdir():
    if source.is_file() and source.suffix.lower() in extensions:
        shutil.copy2(source, site / source.name)
for name in ['api', 'backend']:
    shutil.copytree(ROOT / name, site / name, ignore=shutil.ignore_patterns('private', '__pycache__', '*.local.php', '.env*'))
config = site / 'backend/config/config.local.php'
config.write_text('''<?php
declare(strict_types=1);
// Contains no password. Reuse the already configured, protected CSV database.
$source=dirname(__DIR__,2).'/ekwl-staging/backend/config/config.local.php';
if(!is_file($source))throw new RuntimeException('Existing MySQL configuration is unavailable.');
$c=require $source;
if(!is_array($c)||!preg_match('/(?:^|;)dbname=if0_43242550_ekwl_stage(?:;|$)/',$c['dsn']??''))throw new RuntimeException('Expected CSV database is not configured.');
return array_replace($c,[
    'environment'=>'production',
    'origin'=>'https://littleboy.kesug.com',
    'base_path'=>'/',
    'session_name'=>'EKWL_LIVE_SESSION',
    'secure_cookies'=>true,
    'allow_archive_cleanup'=>false,
]);
''', encoding='utf-8')
index = site / 'index.html'
# Root URLs previously served the Supabase frontend. Force fresh runtime assets.
html = index.read_text(encoding='utf-8')
html = re.sub(r'((?:src|href)=["\'])([^"\'?#]+\.(?:js|css))(?:\?[^"\']*)?(["\'])', lambda m: m[1]+m[2]+'?v='+a.asset_version+m[3], html)
index.write_text(html, encoding='utf-8')
(site / '.htaccess').write_text('''Options -Indexes
DirectoryIndex index.html index.php
<IfModule mod_headers.c>
Header always set Referrer-Policy "same-origin"
Header always set X-Content-Type-Options "nosniff"
</IfModule>
''')
(site / 'backend/.htaccess').write_text('Require all denied\n')
files = []
for file in sorted(site.rglob('*')):
    if not file.is_file():
        continue
    rel = file.relative_to(site).as_posix()
    if file.is_symlink() or 'private' in file.relative_to(site).parts:
        raise RuntimeError('Private path included')
    if file.name.endswith('.local.php') and rel != 'backend/config/config.local.php':
        raise RuntimeError('Unreviewed local config included')
    files.append({'path': rel, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'bytes': file.stat().st_size})
manifest = {'target_origin': 'https://littleboy.kesug.com', 'target_path': '/htdocs/',
            'database': 'reuse existing CSV database; no SQL included',
            'requires_existing_config': 'ekwl-staging/backend/config/config.local.php',
            'session_name': 'EKWL_LIVE_SESSION', 'files': files,
            'hosted_verified': False, 'deployed': False}
(out / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
with zipfile.ZipFile(out / 'ekwl-live-root.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(site.rglob('*')):
        if file.is_file():
            archive.write(file, file.relative_to(site).as_posix())
print(json.dumps({'files': len(files), 'zip': str(out / 'ekwl-live-root.zip'), 'deployed': False}))
