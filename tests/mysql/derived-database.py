import json,secrets,subprocess
from pathlib import Path
container='ekwl-migration-api'
def php(script):return subprocess.check_output(['docker','exec',container,'php','-r',script],text=True)
for kind in ['board','coverage']:
    name='ekwl_derived_'+secrets.token_hex(4);config='/app/backend/config/derived.local.php'
    php("require '/app/backend/src/bootstrap.php';Ekwl\\db()->exec('CREATE DATABASE "+name+" CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');$c=Ekwl\\config();$c['dsn']=preg_replace('/dbname=[^;]+/','dbname="+name+"',$c['dsn']);file_put_contents('"+config+"','<?php return '.var_export($c,true).';');")
    prefix=['docker','exec','-e','EKWL_CONFIG_FILE='+config]
    subprocess.run(prefix+[container,'php','tools/mysql/migrate.php'],check=True)
    fixture=Path('/tmp/ekwl-oracle-'+kind+'.json').read_text()
    subprocess.run(['docker','exec','-i','-e','EKWL_CONFIG_FILE='+config,container,'php','tests/mysql/derived-parity.php','php://stdin','--mysql'],input=fixture,text=True,check=True)
print('PASS MySQL scoped source loading and PHP computations agree with PostgreSQL fixture results')
