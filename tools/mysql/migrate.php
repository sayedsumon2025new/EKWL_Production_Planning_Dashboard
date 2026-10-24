<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/backend/src/bootstrap.php';
use function Ekwl\{config,db,run};
if(PHP_SAPI!=='cli')exit(1);
if((config()['environment']??'')!=='staging')throw new RuntimeException('Migrations require environment=staging.');
run('CREATE TABLE IF NOT EXISTS ekwl_schema_migrations (name VARCHAR(150) PRIMARY KEY,sha256 CHAR(64) NOT NULL,applied_at DATETIME NOT NULL) ENGINE=InnoDB');
$root=dirname(__DIR__,2).'/database/mysql';
$files=array_merge([$root.'/schema.sql'],glob($root.'/migrations/*.sql'),[$root.'/indexes.sql']);
foreach($files as $file){
    $name=basename($file);$hash=hash_file('sha256',$file);$old=run('SELECT sha256 FROM ekwl_schema_migrations WHERE name=?',[$name])->fetchColumn();
    if($old){if(!hash_equals($old,$hash))throw new RuntimeException('Applied migration changed: '.$name);echo "SKIP $name\n";continue;}
    // Statements contain quoted source column names (some include newlines), no procedures.
    $sql=preg_replace('/^--[^\n]*$/m','',file_get_contents($file));
    foreach(explode(';',$sql) as $statement)if(trim($statement))db()->exec($statement);
    run('INSERT INTO ekwl_schema_migrations VALUES (?,?,UTC_TIMESTAMP())',[$name,$hash]);echo "APPLIED $name\n";
}
