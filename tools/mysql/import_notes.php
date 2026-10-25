<?php
/** Explicit owner-mapped legacy Notes import. Never guesses owners or reads the live module. */
declare(strict_types=1);
require dirname(__DIR__,2).'/backend/src/bootstrap.php';
use function Ekwl\{config,run,transaction,audit};
if(PHP_SAPI!=='cli'||(config()['environment']??'')!=='staging')exit(1);
$path=$argv[1]??'';$m=json_decode(file_get_contents($path),true,64,JSON_THROW_ON_ERROR);$root=realpath(dirname($path));$apply=in_array('--apply',$argv,true);
if(($m['format']??'')!=='ekwl-notes-v1'||!is_array($m['owner_map']??null)||!$m['owner_map'])throw new RuntimeException('Verified source-to-target owner map required.');
$file=realpath($root.'/'.$m['file']);if(!$file||dirname($file)!==$root||!hash_equals($m['sha256'],hash_file('sha256',$file)))throw new RuntimeException('Notes checksum/path failed.');
$rows=[];$ids=[];$f=fopen($file,'rb');
while(($line=fgets($f))!==false){
 $r=json_decode($line,true,32,JSON_THROW_ON_ERROR);$owner=$m['owner_map'][(string)($r['source_owner']??'')]??null;
 if(!$owner||!run('SELECT 1 FROM ekwl_site_users WHERE auth_user_id=?',[$owner])->fetchColumn())throw new RuntimeException('Unmapped note owner.');
 $id=(string)($r['id']??'');$title=(string)($r['title']??'');$content=(string)($r['content']??'');
 if(!$id||strlen($id)>36||isset($ids[$id])||!$title||strlen($title)>255||strlen($content)>60000)throw new RuntimeException('Invalid or duplicate source note.');
 $ids[$id]=true;$date=(new DateTimeImmutable($r['updated_at']))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
 if(count($rows)>=100000)throw new RuntimeException('Notes import exceeds reviewed 100,000-row limit. Split into reviewed owner-mapped manifests.');
 $rows[]=[$id,$owner,$title,$content,$date];
}fclose($f);if(count($rows)!==(int)$m['rows'])throw new RuntimeException('Notes source count differs.');
if(!$apply){echo json_encode(['mode'=>'validated-dry-run','rows'=>count($rows),'owners'=>count($m['owner_map'])])."\n";exit;}
foreach(array_chunk($rows,100) as $chunk)transaction(function()use($chunk){
 foreach($chunk as $row){$old=run('SELECT * FROM ekwl_notes WHERE id=? FOR UPDATE',[$row[0]])->fetch();
  if($old){if([$old['id'],$old['owner_id'],$old['title'],$old['content'],$old['updated_at']]!==$row)throw new RuntimeException('Existing note differs; no owner/content overwrite allowed.');continue;}
  run('INSERT INTO ekwl_notes VALUES (?,?,?,?,?)',$row);
 }
 audit('notes.migrate',null,['rows'=>count($chunk)]);
});
echo json_encode(['imported_or_verified_rows'=>count($rows),'legacy_files_modified'=>false])."\n";
