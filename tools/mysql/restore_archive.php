<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/backend/src/bootstrap.php';require dirname(__DIR__,2).'/backend/src/query.php';
use function Ekwl\{config,run,catalog,insertRows,transaction,ident,normalizeValue};
if(PHP_SAPI!=='cli'||(config()['environment']??'')!=='staging')exit(1);
$path=$argv[1]??'';$apply=in_array('--apply',$argv,true);$dir=realpath(dirname($path));
$m=json_decode(file_get_contents($path),true,64,JSON_THROW_ON_ERROR);
if(($m['format']??'')!=='ekwl-quarter-v1'||empty($m['verified']))throw new RuntimeException('Verified quarterly manifest required.');
$counts=array_fill_keys($m['tables'],0);$source='archive:'.hash_file('sha256',$path);
foreach($m['files'] as $file){
    if(!isset(catalog()[$file['table']])||basename($file['name'])!==$file['name'])throw new RuntimeException('Unmapped archive entry.');
    $full=$dir.'/'.$file['name'];if(!hash_equals($file['sha256'],hash_file('sha256',$full)))throw new RuntimeException('Checksum failed.');
    $f=fopen($full,'rb');$n=0;while(($line=fgets($f))!==false){$r=json_decode($line,true,64,JSON_THROW_ON_ERROR);foreach($r as $k=>$v)if(!isset(catalog()[$file['table']]['columns'][$k]))throw new RuntimeException('Unmapped column.');$n++;}fclose($f);
    if($n!==$file['rows'])throw new RuntimeException('Row count failed.');$counts[$file['table']]+=$n;
}
if($counts!==$m['counts'])throw new RuntimeException('Table manifest count failed.');
if(!$apply){echo json_encode(['mode'=>'validated-dry-run','counts'=>$counts],JSON_PRETTY_PRINT)."\n";exit;}
// Restore only into an empty dedicated database, or resume this exact archive.
foreach($m['tables'] as $name){
    $count=(int)run('SELECT COUNT(*) FROM '.ident('ekwl_'.$name))->fetchColumn();
    $checkpoint=run('SELECT imported_rows FROM ekwl_source_checkpoint WHERE source_id=? AND table_name=?',[$source,$name])->fetchColumn();
    if($count&&$checkpoint===false)throw new RuntimeException('Restore target is not empty: '.$name);
}
$done=[];foreach($m['tables'] as $name)$done[$name]=(int)(run('SELECT imported_rows FROM ekwl_source_checkpoint WHERE source_id=? AND table_name=?',[$source,$name])->fetchColumn()?:0);
$seen=array_fill_keys($m['tables'],0);
foreach($m['files'] as $file){
    $name=$file['table'];$f=fopen($dir.'/'.$file['name'],'rb');$chunk=[];
    $commit=function()use(&$chunk,&$seen,$name,$source){
        if(!$chunk)return;transaction(function()use(&$chunk,&$seen,$name,$source){insertRows($name,$chunk,true);run('INSERT INTO ekwl_source_checkpoint VALUES (?,?,NULL,?,UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE imported_rows=VALUES(imported_rows),updated_at=VALUES(updated_at)',[$source,$name,$seen[$name]]);});$chunk=[];
    };
    while(($line=fgets($f))!==false){$seen[$name]++;if($seen[$name]<=$done[$name])continue;$chunk[]=json_decode($line,true,64,JSON_THROW_ON_ERROR);if(count($chunk)===250)$commit();}fclose($f);$commit();
}
$report=[];$passed=true;
foreach($m['tables'] as $name){$got=(int)run('SELECT COUNT(*) FROM '.ident('ekwl_'.$name))->fetchColumn();$ok=$got===$counts[$name];$passed=$passed&&$ok;$report[$name]=['expected'=>$counts[$name],'restored'=>$got,'passed'=>$ok];}
// Verify every restored field, not just the counts.
foreach($m['files'] as $file){
    $name=$file['table'];$c=catalog()[$name];$f=fopen($dir.'/'.$file['name'],'rb');
    while(($line=fgets($f))!==false){$row=json_decode($line,true,64,JSON_THROW_ON_ERROR);$keys=$c['pk'];$where=implode(' AND ',array_map(fn($k)=>ident($k).'=?',$keys));$actual=run('SELECT * FROM '.ident('ekwl_'.$name).' WHERE '.$where,array_map(fn($k)=>$row[$k],$keys))->fetch();
        foreach($row as $key=>$value){
            $expected=normalizeValue($key,$value,$c);$stored=$actual[$c['storage_names'][$key]??$key]??null;
            if(in_array($key,Ekwl\jsonColumns(),true))$ok=$value===json_decode((string)$stored,true);
            elseif(str_starts_with($c['columns'][$key],'DECIMAL'))$ok=Ekwl\decimalComparable((string)$expected)===Ekwl\decimalComparable((string)$stored);
            else $ok=$expected===null?$stored===null:(string)$expected===(string)$stored;
            if(!$ok)$passed=false;
        }
    }fclose($f);
}
$result=['passed'=>$passed,'manifest_sha256'=>hash_file('sha256',$path),'tables'=>$report,'tested_at'=>gmdate(DATE_ATOM),'cleanup_authorized'=>false,'application_cutover_verified'=>false];
if(strlen(config()['archive_attestation_key']??'')>=32)$result['signature']=hash_hmac('sha256',json_encode($result,JSON_THROW_ON_ERROR),config()['archive_attestation_key']);
echo json_encode($result,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n";exit($passed?0:1);
