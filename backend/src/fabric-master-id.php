<?php
declare(strict_types=1);
namespace Ekwl;
/** Persistent garment colour identities. Never edits uploaded source cells. */
function fmSources(): array {$s=[];foreach(['rfd','booking']as $kind)$s[$kind]=fdrRawSource($kind,fn($v)=>rcProjection($kind,$v));$s['orderbank']=rcOrderBank();return $s;}
function fmMappings(): array {return array_values(array_filter(rcStoredMappings(),fn($m)=>in_array($m['source_name'],['rfd','booking'],true)));}
function fmPrepare(): void {
 run("CREATE TABLE IF NOT EXISTS ekwl_fabric_master_identities (id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,display_no BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,ewo CHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,master_colour TEXT NOT NULL,colour_key_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,status VARCHAR(16) NOT NULL,match_method VARCHAR(24) NOT NULL,evidence_digest CHAR(64) CHARACTER SET ascii NOT NULL,created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),UNIQUE KEY display_no(display_no),UNIQUE KEY master_colour(ewo,colour_key_sha256),UNIQUE KEY identity_ewo(id,ewo)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
 run("CREATE TABLE IF NOT EXISTS ekwl_fabric_master_aliases (id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,master_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,ewo CHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,source_name VARCHAR(16) CHARACTER SET ascii NOT NULL,scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,original_colour TEXT NOT NULL,match_method VARCHAR(24) NOT NULL,is_active TINYINT(1) NOT NULL DEFAULT 1,mapping_id CHAR(36) CHARACTER SET ascii NULL,source_references LONGTEXT NOT NULL,UNIQUE KEY alias_master(id,master_id),FOREIGN KEY(master_id,ewo) REFERENCES ekwl_fabric_master_identities(id,ewo)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
 run("CREATE TABLE IF NOT EXISTS ekwl_fabric_master_events (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,master_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,event_type VARCHAR(32) CHARACTER SET ascii NOT NULL,actor_id CHAR(36) CHARACTER SET ascii NOT NULL,evidence LONGTEXT NOT NULL,created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),FOREIGN KEY(master_id) REFERENCES ekwl_fabric_master_identities(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
}
function fmKey(string $ewo,string $colour): string {return $ewo.':'.hash('sha256',rcColorKey($colour));}
function fmCode($n): string {return 'MID-'.str_pad((string)$n,6,'0',STR_PAD_LEFT);}
function fmStored(): array {
 if((int)run("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('ekwl_fabric_master_identities','ekwl_fabric_master_aliases','ekwl_fabric_master_events')")->fetchColumn()!==3)return ['installed'=>false,'records'=>[],'aliases'=>[]];
 $records=[];foreach(run('SELECT * FROM ekwl_fabric_master_identities ORDER BY display_no')->fetchAll()as $r){$r['master_code']=fmCode($r['display_no']);$records[fmKey($r['ewo'],$r['master_colour'])]=$r;}
 $aliases=[];foreach(run('SELECT * FROM ekwl_fabric_master_aliases ORDER BY source_name,scope_key')->fetchAll()as $a){$a['source_references']=json_decode($a['source_references'],true,64,JSON_THROW_ON_ERROR);$aliases[$a['scope_key']]=$a;}
 return ['installed'=>true,'records'=>$records,'aliases'=>$aliases];
}
/** Three-source confirmation, using exact normalization or existing valid approvals only. */
function fmCandidates(array $sources,array $identity,array $registry=[],array $stored=[]): array {
 $groups=[];$pending=[];$byId=[];foreach($registry['records']??[]as $r)$byId[$r['id']]=$r;
 foreach(['orderbank','booking','rfd']as $source)foreach($sources[$source]['rows']??[]as $row){$v=$row['v'];if(!array_key_exists('ewo',$v))$v=rcProjection($source,$v);$ewo=rcEwo($v['ewo']);$colour=rcColorKey(rcColorLabel($identity,$source,$v['ewo'],$v['color']));if(!rcValidEwo($ewo)||$colour==='')continue;$target=$identity['targets'][$ewo][$colour]??null;if($target===null)continue;$key=fmKey($ewo,$target);$g=&$groups[$key];$g['ewo']=$ewo;$g['master_colour']=$target;$g['records'][$source][]=['row'=>$row['n'],'original_ewo'=>$v['ewo'],'original_colour'=>$v['color'],'details'=>$v['details']??null,'construction'=>$v['construction']??null,'composition'=>$v['composition']??null];unset($g);}
 $activeMappings=[];foreach($stored as $m)$activeMappings[$m['scope_key']]=$m;
 $ready=[];foreach($groups as $key=>$g){$reasons=[];foreach(['orderbank','booking','rfd']as $source)if(($sources[$source]['status']??'')!=='Complete'||empty($g['records'][$source]))$reasons[]='Missing current '.$source.' evidence.';
  $aliases=[];$reviewed=false;foreach($g['records']as $source=>$records)foreach($records as $r){$scope=rcScope($g['ewo'],$source,$r['original_colour']);$mapping=$identity['effective'][$scope]??null;$oldAlias=$registry['aliases'][$scope]??null;$oldMaster=$oldAlias?($byId[$oldAlias['master_id']]??null):null;
   if($oldMaster&&fmKey($oldMaster['ewo'],$oldMaster['master_colour'])!==$key&&isset($activeMappings[$scope])&&(!$mapping||rcColorKey($mapping['to_color'])!==rcColorKey($g['master_colour'])))$reasons[]='A previous approved alias points to a different master. Review or revoke that mapping first.';
   $reviewed=$reviewed||$mapping!==null;$aliases[$scope]??=['scope_key'=>$scope,'source_name'=>$source,'original_colour'=>$r['original_colour'],'match_method'=>$mapping?'admin_reviewed':'exact','mapping_id'=>$mapping['id']??null,'approval'=>$mapping?array_intersect_key($mapping,array_flip(['id','revision','approved_by','approved_at','source_digest'])):null,'rows'=>[]];$aliases[$scope]['rows'][]=$r['row'];
  }
  if($reasons){$pending[$key]=['ewo'=>$g['ewo'],'master_colour'=>$g['master_colour'],'issues'=>array_values(array_unique($reasons))];continue;}
  $g['aliases']=array_values($aliases);$g['match_method']=$reviewed?'admin_reviewed':'exact';$g['sources']=array_map(fn($s)=>['head'=>$s['head']??null,'status'=>$s['status']??'Not uploaded'],array_intersect_key($sources,array_flip(['rfd','booking','orderbank'])));$g['digest']=hash('sha256',json_encode($g,JSON_THROW_ON_ERROR));$ready[$key]=$g;
 }
 return ['ready'=>$ready,'pending'=>array_values($pending)];
}
/** Bounded SQL batches keep first registry population fast on shared hosting. */
function fmBatch(string $table,array $columns,array $rows,string $update=''): void {
 $marks=[];$args=[];$bytes=0;$flush=function()use($table,$columns,$update,&$marks,&$args,&$bytes){if(!$marks)return;run('INSERT INTO '.$table.' (`'.implode('`,`',$columns).'`) VALUES '.implode(',',$marks).($update?' ON DUPLICATE KEY UPDATE '.$update:''),$args);$marks=[];$args=[];$bytes=0;};
 foreach($rows as $row){$size=strlen(json_encode($row,JSON_THROW_ON_ERROR));if($marks&&(count($marks)>=100||$bytes+$size>1048576))$flush();$marks[]='('.implode(',',array_fill(0,count($columns),'?')).')';array_push($args,...$row);$bytes+=$size;}$flush();
}
function fmSync(array $sources,array $stored,array $u): array {
 $registry=fmStored();$identity=rcContext($sources,$stored,true);$state=fmCandidates($sources,$identity,$registry,$stored);$reviewIds=[];$changedIds=[];$identities=[];$aliases=[];$events=[];
 foreach($registry['records']as $key=>$r)if(!isset($state['ready'][$key])&&$r['status']!=='review'){
  $reviewIds[]=$r['id'];$events[]=[$r['id'],'needs_review',$u['auth_user_id'],json_encode(['reason'=>'Current three-source reference is missing or conflicting.','sources'=>array_map(fn($s)=>$s['head']??null,$sources)],JSON_THROW_ON_ERROR)];
 }
 foreach($state['ready']as $key=>$g){$old=$registry['records'][$key]??null;if($old&&$old['status']==='active'&&$old['evidence_digest']===$g['digest'])continue;$id=$old['id']??uuid();$changedIds[]=$id;
  $identities[]=[$id,$g['ewo'],$g['master_colour'],hash('sha256',rcColorKey($g['master_colour'])),'active',$g['match_method'],$g['digest']];
  foreach($g['aliases']as $a){$refs=['head'=>$sources[$a['source_name']]['head']??null,'rows'=>$a['rows'],'approval'=>$a['approval']];$aliases[]=[uuid(),$id,$g['ewo'],$a['source_name'],$a['scope_key'],$a['original_colour'],$a['match_method'],$a['mapping_id'],json_encode($refs,JSON_THROW_ON_ERROR)];}
  $events[]=[$id,$old?'reverified':'created',$u['auth_user_id'],json_encode($g,JSON_THROW_ON_ERROR)];
 }
 foreach(array_chunk($reviewIds,100)as $ids)run("UPDATE ekwl_fabric_master_identities SET status='review',updated_at=UTC_TIMESTAMP(6) WHERE id IN (".implode(',',array_fill(0,count($ids),'?')).')',$ids);
 foreach(array_chunk(array_merge($changedIds,$reviewIds),100)as $ids)run('UPDATE ekwl_fabric_master_aliases SET is_active=0 WHERE master_id IN ('.implode(',',array_fill(0,count($ids),'?')).')',$ids);
 fmBatch('ekwl_fabric_master_identities',['id','ewo','master_colour','colour_key_sha256','status','match_method','evidence_digest'],$identities,"master_colour=VALUES(master_colour),status='active',match_method=VALUES(match_method),evidence_digest=VALUES(evidence_digest),updated_at=UTC_TIMESTAMP(6)");
 fmBatch('ekwl_fabric_master_aliases',['id','master_id','ewo','source_name','scope_key','original_colour','match_method','mapping_id','source_references'],$aliases,'master_id=VALUES(master_id),original_colour=VALUES(original_colour),match_method=VALUES(match_method),mapping_id=VALUES(mapping_id),source_references=VALUES(source_references),is_active=1');
 fmBatch('ekwl_fabric_master_events',['master_id','event_type','actor_id','evidence'],$events);
 return fmStored();
}
function fmReadResult(array $sources,array $stored,array $registry,array $u): array {
 $state=fmCandidates($sources,rcContext($sources,$stored,true),$registry,$stored);$records=[];$byId=[];foreach($registry['aliases']as $a)$byId[$a['master_id']][]=$a;
 foreach($registry['records']as $key=>$r){$current=$state['ready'][$key]??null;$r['status']=$current?'active':'review';$r['aliases']=$byId[$r['id']]??[];$r['current_evidence']=$current;$records[]=$r;}
 $events=$registry['installed']?run('SELECT id,master_id,event_type,actor_id,evidence,created_at FROM ekwl_fabric_master_events ORDER BY id DESC LIMIT 100')->fetchAll():[];foreach($events as &$event)$event['evidence']=json_decode($event['evidence'],true,64,JSON_THROW_ON_ERROR);unset($event);
 $meta=[];foreach($sources as $k=>$s)$meta[$k]=['head'=>$s['head'],'status'=>$s['status'],'rows'=>count($s['rows'])];$digest=hash('sha256',json_encode([$meta,$records,$state['pending'],$stored],JSON_THROW_ON_ERROR));
 return ['records'=>$records,'pending'=>$state['pending'],'unregistered'=>count(array_diff_key($state['ready'],$registry['records'])),'events'=>$events,'sources'=>$meta,'can_sync'=>$u['role']==='admin','installed'=>$registry['installed'],'integrity'=>['complete'=>true,'record_count'=>count($records),'digest'=>$digest]];
}
function fmAction(array $u,array $b): array {
 requirePermission($u,'slide_22');$action=$b['action']??'read';if(!in_array($action,['read','sync'],true))throw new ApiError('Unknown Master ID action.');if($action==='sync'){requirePermission($u,'admin');if(config()['maintenance']??false)throw new ApiError('Writes paused for maintenance.',503);fmPrepare();}
 $pdo=db();$pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');$pdo->beginTransaction();try{if($action==='sync')snapshotLock();$sources=fmSources();$stored=fmMappings();$registry=$action==='sync'?fmSync($sources,$stored,$u):fmStored();$result=fmReadResult($sources,$stored,$registry,$u);$pdo->commit();return $result;}catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
