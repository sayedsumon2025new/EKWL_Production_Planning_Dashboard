<?php
declare(strict_types=1);
namespace Ekwl;
require_once __DIR__.'/rfd-fabrics-details.php';
function rcSources(): array {
 return fmSources();
}
function rcFingerprint(array $sources,array $stored): string {return hash('sha256',json_encode(['color-review-v2-three-sources',$sources,$stored],JSON_THROW_ON_ERROR));}
function rcGroupRecords(array $records): array {
 $out=[];foreach($records as $r){$key=hash('sha256',json_encode(array_diff_key($r,['row'=>true]),JSON_THROW_ON_ERROR));if(!isset($out[$key])){$out[$key]=$r;$out[$key]['rows']=[];unset($out[$key]['row']);}$out[$key]['rows'][]=$r['row'];}return array_values($out);
}
/** One issue per EWO; only incomplete color groups enter its source comparison. */
function rcBuild(array $sources,array $identity): array {
 $orders=[];$invalid=[];
 foreach(array_intersect_key($sources,array_flip(['orderbank','booking','rfd'])) as $source=>$s)foreach($s['rows'] as $row){$v=$row['v'];if(isset($v['nonblank'])?!$v['nonblank']:!array_filter($v,fn($v)=>$v!==null&&trim((string)$v)!==''))continue;$ewo=rcEwo($v['ewo']);
  $record=['source'=>$source,'row'=>$row['n'],'original_ewo'=>$v['ewo'],'original_color'=>$v['color'],'details'=>$v['details'],'construction'=>$v['construction'],'composition'=>$v['composition']];
  if(!rcValidEwo($ewo)){$record['matched']=false;$evidence=rcGroupRecords([$record]);$invalid[]=['id'=>hash('sha256',$source.':'.$row['n']),'ewo'=>$v['ewo']?:'Missing EWO','issue'=>'invalid','records'=>$evidence,'context'=>$evidence,'review_sources'=>[$source],'targets'=>[],'editable'=>[]];continue;}
  $color=rcColorKey(rcColorLabel($identity,$source,$v['ewo'],$v['color']));$orders[$ewo]['ewo']=$ewo;$orders[$ewo]['colors'][$color][$source][]=$record;
 }
 $issues=[];$names=['orderbank','booking','rfd'];
 foreach($orders as $order){$ewo=$order['ewo'];$records=[];$context=[];$sets=[];
  foreach($order['colors'] as $color=>$bySource){$matched=(string)$color!==''&&count(array_intersect($names,array_keys($bySource)))===3;foreach($bySource as $source=>$rows){$sets[$source][(string)$color]=true;foreach($rows as $r){$r['matched']=$matched;$context[]=$r;if(!$matched)$records[]=$r;}}}
  if(!$records)continue;$grouped=rcGroupRecords($records);$editable=[];$invalidColor=false;
  foreach($grouped as $r){$raw=rcColorKey($r['original_color']);if($raw==='')$invalidColor=true;if(in_array($r['source'],['rfd','booking'],true)&&$raw!==''&&!isset($identity['targets'][$ewo][$raw])&&!isset($identity['effective'][rcScope($ewo,$r['source'],$r['original_color'])]))$editable[rcScope($ewo,$r['source'],$r['original_color'])]=['source'=>$r['source'],'from_color'=>$r['original_color']];}
  $targetMap=$identity['targets'][$ewo]??[];$targets=array_values($targetMap);$review=[];
  if(!$targets)$review[]='orderbank';
  foreach(['booking','rfd'] as $source)if(array_diff_key($targetMap,$sets[$source]??[])||array_diff_key($sets[$source]??[],$targetMap))$review[]=$source;
  $issue=$invalidColor?'invalid':($editable&&$targets?(count($targets)>1?'multiple':'name'):'missing');
  $issues[]=['id'=>hash('sha256',$ewo),'ewo'=>$ewo,'issue'=>$issue,'records'=>$grouped,'context'=>rcGroupRecords($context),'review_sources'=>$review,'targets'=>$targets,'editable'=>array_values($editable)];
 }
 array_push($issues,...$invalid);usort($issues,fn($a,$b)=>strnatcasecmp($a['ewo'],$b['ewo']));return $issues;
}
function rcReadResult(array $sources,array $stored,array $u): array {
 $identity=rcContext($sources,$stored,true);$issues=rcBuild($sources,$identity);$meta=[];foreach($sources as $name=>$s)$meta[$name]=['head'=>$s['head'],'status'=>$s['status'],'rows'=>count($s['rows'])];
 return ['issues'=>$issues,'mappings'=>$identity['entries'],'sources'=>$meta,'can_approve'=>$u['role']==='admin','integrity'=>['complete'=>true,'issue_count'=>count($issues),'digest'=>rcFingerprint($sources,$stored)]];
}
function rcAction(array $u,array $b): array {
 requirePermission($u,'slide_22');$action=$b['action']??'read';if(!in_array($action,['read','refresh','approve','revoke'],true))throw new ApiError('Unknown color review action.');
 if($action!=='read'){requirePermission($u,'admin');if(config()['maintenance']??false)throw new ApiError('Writes paused for maintenance.',503);rcPrepare();fmPrepare();}
 $pdo=db();$pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');$pdo->beginTransaction();
 try{
  if($action!=='read')snapshotLock();$sources=rcSources();$stored=fmMappings();$digest=rcFingerprint($sources,$stored);
  if(in_array($action,['approve','revoke'],true)){
   if(!is_string($b['expected_digest']??null)||!hash_equals($digest,$b['expected_digest']))throw new ApiError('Sources or approvals changed. Refresh and review the current records before approving.',409);
   if($action==='revoke'){
    $id=$b['id']??null;$found=array_values(array_filter($stored,fn($m)=>$m['id']===$id));if(count($found)!==1)throw new ApiError('Active mapping was not found.',409);
    run('UPDATE ekwl_rfd_color_mappings SET is_active=0,revision=revision+1 WHERE id=?',[$id]);audit('color-map.revoke',$id,['ewo'=>$found[0]['ewo'],'source'=>$found[0]['source_name'],'from'=>$found[0]['from_color'],'to'=>$found[0]['to_color']]);
   }else{
    $ewo=$b['ewo']??null;$source=$b['source']??null;$from=$b['from_color']??null;$to=$b['to_color']??null;
    if(!is_string($ewo)||!rcValidEwo($ewo)||!in_array($source,['rfd','booking'],true)||!is_string($from)||!is_string($to)||strlen($from)>4096||strlen($to)>4096||rcColorKey($from)===''||rcColorKey($to)===''||($b['confirmed']??false)!==true)throw new ApiError('Confirm the EWO, original source color and approved color.');
    $identity=rcContext($sources,$stored,true);$targets=$identity['targets'][$ewo]??[];
    if(!isset($targets[rcColorKey($to)]))throw new ApiError('Approved color must exist in the current Order Bank for this EWO.',409);
    if(isset($targets[rcColorKey($from)]))throw new ApiError('This original color already identifies an Order Bank color; distinct reference colors cannot be merged.',409);
    $matches=array_filter($sources[$source]['rows'],fn($r)=>rcEwo($r['v']['ewo'])===$ewo&&rcColorKey($r['v']['color'])===rcColorKey($from));if(!$matches)throw new ApiError('Original color is absent from the selected current source.',409);
    $key=rcScope($ewo,$source,$from);$id=uuid();$target=$targets[rcColorKey($to)];
    run('INSERT INTO ekwl_rfd_color_mappings (id,scope_key,ewo,source_name,from_color,to_color,approved_by,source_digest) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE from_color=VALUES(from_color),to_color=VALUES(to_color),approved_by=VALUES(approved_by),source_digest=VALUES(source_digest),approved_at=UTC_TIMESTAMP(6),is_active=1,revision=revision+1',[$id,$key,$ewo,$source,$from,$target,$u['auth_user_id'],$digest]);
    $id=run('SELECT id FROM ekwl_rfd_color_mappings WHERE scope_key=?',[$key])->fetchColumn();audit('color-map.approve',$id,['ewo'=>$ewo,'source'=>$source,'from'=>$from,'to'=>$target,'source_digest'=>$digest,'source_versions'=>array_map(fn($s)=>['head'=>$s['head'],'status'=>$s['status']],$sources)]);
   }
   $stored=fmMappings();
  }
  if($action!=='read')fmSync($sources,$stored,$u);$result=rcReadResult($sources,$stored,$u);$pdo->commit();return $result;
 }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
