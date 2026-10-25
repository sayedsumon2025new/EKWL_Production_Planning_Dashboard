"""Start a clean, local-only runtime. Refuses existing configuration/containers."""
import json,os,secrets,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
if (root/'backend/config/config.local.php').exists():raise SystemExit('Existing local config found. Use an isolated checkout; nothing will be overwritten.')
for name in ['ekwl-migration-db','ekwl-migration-api']:
    if subprocess.run(['docker','inspect',name],capture_output=True).returncode==0:raise SystemExit('Existing fixture container: '+name+'; use a clean test environment.')
subprocess.run(['docker','build','-t','ekwl-migration-php:8.2','-f',str(root/'tests/mysql/Dockerfile'),str(root)],check=True)
secret=secrets.token_hex(24)
envfile=Path('/tmp/ekwl-migration-test-db.env');envfile.write_text('MARIADB_ROOT_PASSWORD='+secret+'\nMARIADB_DATABASE=ekwl_stage\n');envfile.chmod(0o600)
subprocess.run(['docker','network','create','ekwl-migration-test'],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['docker','run','-d','--name','ekwl-migration-db','--network','ekwl-migration-test','--env-file',str(envfile),'mariadb:10.11'],check=True,stdout=subprocess.DEVNULL)
import time
for _ in range(60):
    if subprocess.run(['docker','exec','ekwl-migration-db','healthcheck.sh','--connect','--innodb_initialized'],capture_output=True).returncode==0:break
    time.sleep(0.5)
else:raise RuntimeError('Fixture database not ready')
conf="<?php return "+"['environment'=>'staging','dsn'=>'mysql:host=ekwl-migration-db;dbname=ekwl_stage;charset=utf8mb4','db_user'=>'root','db_password'=>"+repr(secret)+",'origin'=>'http://127.0.0.1:18080','base_path'=>'/','secure_cookies'=>false,'private_dir'=>'/app/backend/private','max_body_bytes'=>4194304,'max_chunk_rows'=>800,'maintenance'=>false];"
(root/'backend/config/config.local.php').write_text(conf)
(root/'backend/config/config.local.php').chmod(0o600)
subprocess.run(['docker','run','-d','--name','ekwl-migration-api','--network','ekwl-migration-test','-p','127.0.0.1:18080:8080','--mount','type=bind,src='+str(root)+',dst=/app','ekwl-migration-php:8.2','php','-S','0.0.0.0:8080','-t','/app','/app/tools/mysql/dev-router.php'],check=True,stdout=subprocess.DEVNULL)
print('Isolated MariaDB and PHP servers started. Random test credentials stored only in ignored local configuration.')
