"""Verify the exact one-time phpMyAdmin bundle only in local Docker MariaDB."""
import json,subprocess
API='ekwl-migration-api'
script=r"""require '/app/backend/src/bootstrap.php';
if(!str_contains(Ekwl\config()['dsn'],'host=ekwl-migration-db;'))throw new RuntimeException('Local Docker only.');
$name='ekwl_pma_fixture_'.bin2hex(random_bytes(4));
if(Ekwl\run('SELECT 1 FROM information_schema.schemata WHERE schema_name=?',[$name])->fetchColumn())throw new RuntimeException('Existing fixture database: use a clean local environment; nothing overwritten.');
Ekwl\db()->exec('CREATE DATABASE `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');
$sql=file_get_contents('/app/database/mysql/staging-install-if0_43242550_ekwl_stage.sql');
$target='USE `if0_43242550_ekwl_stage`;';
if(substr_count($sql,$target)!==1)throw new RuntimeException('Wrong installer target');
$sql=str_replace($target,'USE `'.$name.'`;',$sql);
$sql=preg_replace('/^--[^\n]*$/m','',$sql);
foreach(explode(';',$sql) as $s)if(trim($s)){if(preg_match('/^\\s*SELECT/i',$s)){$q=Ekwl\db()->query($s);$q->fetchAll();$q->closeCursor();}else Ekwl\db()->exec($s);}
if(Ekwl\run('SELECT DATABASE()')->fetchColumn()!==$name)throw new RuntimeException('Wrong target');
if((int)Ekwl\run('SELECT COUNT(*) FROM ekwl_schema_migrations')->fetchColumn()!==4)throw new RuntimeException('Incomplete ledger');
$blocked=false;
try{Ekwl\db()->exec('CREATE TABLE ekwl_schema_migrations (name VARCHAR(150) PRIMARY KEY) ENGINE=InnoDB');}catch(PDOException $e){$blocked=true;}
if(!$blocked)throw new RuntimeException('Repeat install was not blocked');
$c=Ekwl\config();$c['dsn']=preg_replace('/dbname=[^;]+/','dbname='.$name,$c['dsn']);file_put_contents('/app/backend/config/phpmyadmin.local.php','<?php return '.var_export($c,true).';');
echo 'PASS exact phpMyAdmin SQL: staging target, all tables/keys, four-file ledger and repeat-install guard'.PHP_EOL;
"""
subprocess.run(['docker','exec',API,'php','-r',script],check=True)
r=subprocess.check_output(['docker','exec','-e','EKWL_CONFIG_FILE=/app/backend/config/phpmyadmin.local.php',API,'php','tools/mysql/migrate.php'],text=True)
assert len(r.splitlines())==4 and all(line.startswith('SKIP ') for line in r.splitlines()),r
print('PASS CLI recognizes every phpMyAdmin-installed migration SHA and skips without changes')
