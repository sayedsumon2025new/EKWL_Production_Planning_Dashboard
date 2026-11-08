"""Create a NEW local fixture DB and test Admin. Never drops an existing database."""
import json,secrets,subprocess
from pathlib import Path
name='ekwl_test_'+secrets.token_hex(4)
script="require '/app/backend/src/bootstrap.php'; Ekwl\\db()->exec('CREATE DATABASE "+name+" CHARACTER SET utf8mb4 COLLATE utf8mb4_bin'); $p='/app/backend/config/config.local.php';$c=require $p;$c['dsn']=preg_replace('/dbname=[^;]+/','dbname="+name+"',$c['dsn']);file_put_contents($p,'<?php return '.var_export($c,true).';');"
subprocess.run(['docker','exec','ekwl-migration-api','php','-r',script],check=True)
subprocess.run(['docker','exec','ekwl-migration-api','php','tools/mysql/migrate.php'],check=True)
pwd='Fixture-'+secrets.token_hex(15)
subprocess.run(['docker','exec','-i','ekwl-migration-api','php','tools/mysql/bootstrap-admin.php','admin@fixture.invalid'],input=(pwd+'\n').encode(),check=True)
p=Path('/tmp/ekwl-test-auth.json');p.write_text(json.dumps(dict(email='admin@fixture.invalid',password=pwd)));p.chmod(0o600)

# The HTTP process must reopen configuration/connections after switching databases.
# This container is created only by start-runtime.py for isolated fixture tests.
subprocess.run(['docker','restart','ekwl-migration-api'],check=True,stdout=subprocess.DEVNULL)
import time,urllib.request,urllib.error
for _ in range(60):
    try:
        with urllib.request.urlopen('http://127.0.0.1:18080/api/index.php?route=auth%2Fsession',timeout=2)as response:
            assert json.load(response)['data']['session']is None
        break
    except (OSError,urllib.error.URLError):time.sleep(0.25)
else:raise RuntimeError('Fresh fixture HTTP runtime is not ready')
