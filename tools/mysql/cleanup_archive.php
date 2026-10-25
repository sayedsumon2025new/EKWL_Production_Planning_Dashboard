<?php
/** Separately authorized cleanup, default dry run. Never called automatically by archive export. */
declare(strict_types=1);
require dirname(__DIR__,2).'/backend/src/bootstrap.php';require dirname(__DIR__,2).'/backend/src/query.php';require dirname(__DIR__,2).'/backend/src/auth.php';require dirname(__DIR__,2).'/backend/src/archive.php';require dirname(__DIR__,2).'/backend/src/decimal.php';require dirname(__DIR__,2).'/backend/src/readiness-engine.php';require dirname(__DIR__,2).'/backend/src/derived.php';require dirname(__DIR__,2).'/backend/src/imports.php';
use function Ekwl\{config,run,catalog,ident,normalizeValue,transaction,audit,archiveTables,quarterBounds,derivedReportVisible};
if(PHP_SAPI!=='cli')exit(1);
$path=$argv[1]??'';$proofPath=$argv[2]??'';$m=json_decode(file_get_contents($path),true,64,JSON_THROW_ON_ERROR);$proof=json_decode(file_get_contents($proofPath),true,64,JSON_THROW_ON_ERROR);
$key=config()['archive_attestation_key']??'';$signature=$proof['signature']??'';unset($proof['signature']);
if(strlen($key)<32||!$signature||!hash_equals(hash_hmac('sha256',json_encode($proof,JSON_THROW_ON_ERROR),$key),$signature))throw new RuntimeException('Signed restore-test evidence is required.');
if(empty($proof['passed'])||empty($m['verified'])||!hash_equals($proof['manifest_sha256'],hash_file('sha256',$path)))throw new RuntimeException('Restore evidence does not match this verified archive.');
[$from,$to]=quarterBounds($m['quarter']);if($to>gmdate('Y-m-d'))throw new RuntimeException('Cleanup only supports fully elapsed historical quarters.');
$apply=in_array('--execute',$argv,true);$approval='';foreach($argv as $arg)if(str_starts_with($arg,'--authorization='))$approval=substr($arg,16);
if($apply&&(!(config()['allow_archive_cleanup']??false)||strlen($approval)<8))throw new RuntimeException('Cleanup requires server-side enablement and a recorded explicit authorization reference.');
$actor='';foreach($argv as $arg)if(str_starts_with($arg,'--admin-auth-id='))$actor=substr($arg,16);
if($apply){
 if(!(config()['maintenance']??false))throw new RuntimeException('Cleanup requires maintenance mode and paused external writers.');
 if(!run("SELECT 1 FROM ekwl_site_users WHERE auth_user_id=? AND LOWER(role)='admin' AND LOWER(status)='active'",[$actor])->fetchColumn())throw new RuntimeException('Verified active Admin identity required.');
 $_SESSION['uid']=$actor;
}
$root=realpath(dirname($path));$files=[];
foreach($m['files'] as $file){if(!in_array($file['table'],archiveTables(),true)||basename($file['name'])!==$file['name']||!hash_equals($file['sha256'],hash_file('sha256',$root.'/'.$file['name'])))throw new RuntimeException('Archive file invalid.');$files[$file['table']][]=$file;}
$latest=(string)run("SELECT id FROM ekwl_plan_uploads WHERE status='complete' ORDER BY uploaded_at DESC,id DESC LIMIT 1")->fetchColumn();$bank=(string)run("SELECT id FROM ekwl_order_bank_upload_batches WHERE status='SUCCESS' ORDER BY uploaded_at DESC,id DESC LIMIT 1")->fetchColumn();
$order=['plan_daily','plan_records','plan_uploads','order_bank_raw','order_bank_upload_batches','fabric_cutting_info','sewing_input_output','date_wise_production','size_set_rows','accessories_rows','embellishment_send_receive_rows'];
$summary=['eligible'=>0,'deleted'=>0,'protected_current'=>0,'already_missing'=>0];
foreach($order as $name)foreach($files[$name]??[] as $file){
 $c=catalog()[$name];$f=fopen($root.'/'.$file['name'],'rb');
 while(($line=fgets($f))!==false){$row=json_decode($line,true,64,JSON_THROW_ON_ERROR);$keys=$c['pk'];$where=implode(' AND ',array_map(fn($k)=>ident($k).'=?',$keys));$values=array_map(fn($k)=>$row[$k],$keys);
  transaction(function()use($name,$row,$c,$where,$values,$latest,$bank,$apply,$approval,&$summary){
   Ekwl\snapshotLock();
   $old=run('SELECT * FROM '.ident('ekwl_'.$name).' WHERE '.$where.' FOR UPDATE',$values)->fetch();if(!$old){$summary['already_missing']++;return;}
   if((in_array($name,['plan_daily','plan_records'],true)&&(string)$old['upload_id']===$latest)||($name==='plan_uploads'&&(string)$old['id']===$latest)||($name==='order_bank_raw'&&(string)$old['upload_batch_id']===$bank)||($name==='order_bank_upload_batches'&&(string)$old['id']===$bank)||!empty($old['is_active'])){$summary['protected_current']++;return;}
   if(in_array($name,['fabric_cutting_info','sewing_input_output','date_wise_production'],true)&&run('SELECT 1 FROM '.ident('ekwl_'.$name).' WHERE '.$where.' AND '.derivedReportVisible($name),$values)->fetchColumn()){$summary['protected_current']++;return;}
   foreach($row as $k=>$v){$expected=normalizeValue($k,$v,$c);$stored=$old[$c['storage_names'][$k]??$k]??null;
    if(in_array($k,Ekwl\jsonColumns(),true))$same=$v===json_decode((string)$stored,true);
    elseif(str_starts_with($c['columns'][$k],'DECIMAL'))$same=Ekwl\Decimal::cmp($expected??'0',$stored??'0')===0&&($expected===null)===($stored===null);
    else $same=$expected===null?$stored===null:(string)$expected===(string)$stored;
    if(!$same)throw new RuntimeException('A source row changed after archival; cleanup stopped.');
   }
   $summary['eligible']++;
   if($apply){run('DELETE FROM '.ident('ekwl_'.$name).' WHERE '.$where,$values);audit('archive.cleanup',$name,['authorization'=>$approval,'primary_key'=>$values]);$summary['deleted']++;}
  });
 }
 fclose($f);
}
echo json_encode(['mode'=>$apply?'explicitly-authorized-cleanup':'dry-run','summary'=>$summary,'notes_or_identities_touched'=>false],JSON_PRETTY_PRINT)."\n";
