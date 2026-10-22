<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/backend/src/bootstrap.php';require dirname(__DIR__,2).'/backend/src/query.php';
use function Ekwl\{config,db,run,catalog,insertRows,transaction};
if(PHP_SAPI!=='cli'||(config()['environment']??'')!=='staging')exit(1);
$manifestPath=$argv[1]??'';$apply=in_array('--apply',$argv,true);$root=realpath(dirname($manifestPath));
if(!$root||!is_file($manifestPath))throw new RuntimeException('Usage: import_source.php /private/export/manifest.json [--apply]');
$m=json_decode(file_get_contents($manifestPath),true,64,JSON_THROW_ON_ERROR);
if(($m['format']??'')!=='ekwl-source-v1'||($m['project_id']??'')!=='rdslpcazdzqjlenbezaf')throw new RuntimeException('Unverified export/project identity.');
$sourceId=hash_file('sha256',$manifestPath);$cat=catalog();$counts=[];
// Validate ALL files and fields before the first write. Unknown source tables/columns block migration.
foreach($m['tables'] as $name=>$meta){
    if(!isset($cat[$name]))throw new RuntimeException('Unmapped source table: '.$name);
    foreach($m['schema'][$name]??[] as $column)if(!isset($cat[$name]['columns'][$column[0]]))throw new RuntimeException('Unmapped source schema column '.$name.'.'.$column[0]);
    if(($meta['primary_key']??[])!==$cat[$name]['pk'])throw new RuntimeException('Unverified primary-key mapping: '.$name);
    $file=realpath($root.'/'.$meta['file']);if(!$file||dirname($file)!==$root||!hash_equals($meta['sha256'],hash_file('sha256',$file)))throw new RuntimeException('Export checksum/path failed: '.$name);
    $n=0;$f=fopen($file,'rb');while(($line=fgets($f))!==false){
        $row=json_decode($line,true,64,JSON_THROW_ON_ERROR);
        foreach($row as $key=>$value)if(!isset($cat[$name]['columns'][$key]))throw new RuntimeException('Unmapped column '.$name.'.'.$key);
        $n++;
    }fclose($f);if($n!==$meta['rows'])throw new RuntimeException('Export row count failed: '.$name);$counts[$name]=$n;
}
// Refuse to silently omit Auth-only accounts; their profile/ownership mapping requires review.
$authFile=$root.'/auth-identities.json';
if(!is_file($authFile)||!hash_equals($m['auth_identity_sha256']??'',hash_file('sha256',$authFile)))throw new RuntimeException('Auth identity checksum missing or invalid.');
$identities=json_decode(file_get_contents($authFile),true,64,JSON_THROW_ON_ERROR);
if(count($identities)!==($m['auth_identity_count']??-1))throw new RuntimeException('Auth identity count differs.');
$profiles=[];if(isset($m['tables']['site_users'])){
 $f=fopen($root.'/'.$m['tables']['site_users']['file'],'rb');while(($line=fgets($f))!==false){$r=json_decode($line,true,64,JSON_THROW_ON_ERROR);if(!empty($r['auth_user_id']))$profiles[$r['auth_user_id']]=strtolower($r['email']);}fclose($f);
}
foreach($identities as $identity)if(!isset($profiles[$identity['id']])||$profiles[$identity['id']]!==strtolower($identity['email']??''))throw new RuntimeException('Auth identity needs a reviewed matching profile; no orphan account is silently discarded.');
// Explicit dependency order. A new source table must be mapped before it can be imported.
$order=['site_users','plan_uploads','plan_records','plan_daily','order_bank_upload_batches','order_bank_raw','order_bank_import_rows','fabric_cutting_info','sewing_input_output','date_wise_production','efficiency_run_day_ladder','line_chassis_priority','abp_target','dashboard_master_settings','slide4_chassis_strength','floor_allocation','size_set_rows','accessories_rows','embellishment_send_receive_rows'];
if(!$apply){echo json_encode(['mode'=>'validated-dry-run','rows'=>$counts],JSON_PRETTY_PRINT)."\n";exit;}
foreach($order as $name){
    if(!isset($m['tables'][$name]))continue;
    $meta=$m['tables'][$name];$done=(int)(run('SELECT imported_rows FROM ekwl_source_checkpoint WHERE source_id=? AND table_name=?',[$sourceId,$name])->fetchColumn()?:0);
    $f=fopen($root.'/'.$meta['file'],'rb');$at=0;$chunk=[];
    $commit=function()use(&$chunk,&$at,$sourceId,$name){
        if(!$chunk)return;
        transaction(function()use(&$chunk,$at,$sourceId,$name){
            insertRows($name,$chunk,true);
            if($name==='site_users')foreach($chunk as $r)if(!empty($r['auth_user_id']))run('INSERT IGNORE INTO ekwl_users (id,password_hash,created_at) VALUES (?,NULL,UTC_TIMESTAMP(6))',[$r['auth_user_id']]);
            run('INSERT INTO ekwl_source_checkpoint VALUES (?,?,NULL,?,UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE imported_rows=VALUES(imported_rows),updated_at=VALUES(updated_at)',[$sourceId,$name,$at]);
        });$chunk=[];
    };
    while(($line=fgets($f))!==false){$at++;if($at<=$done)continue;$chunk[]=json_decode($line,true,64,JSON_THROW_ON_ERROR);if(count($chunk)===250)$commit();}
    fclose($f);$commit();if($at!==$meta['rows'])throw new RuntimeException('Import checkpoint count failed.');
    echo $name.': '.$at." source rows applied; identities require reset.\n";
}
echo "Import complete for mapped source tables. Run reconciliation; this is not cutover approval.\n";
