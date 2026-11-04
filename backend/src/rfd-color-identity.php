<?php
declare(strict_types=1);
namespace Ekwl;
/** Matching keys are separate from immutable source cells. */
function rcNorm($v): string {return strtoupper(preg_replace('/\s+/u',' ',trim((string)$v)));}
function rcColorKey($v): string {$key=rcNorm($v);return in_array($key,['','—','-','N/A','NA','NULL','NONE','NOT AVAILABLE'],true)?'':$key;}
function rcEwo($v): string {
 $raw=trim((string)$v);preg_match_all('/(?<!\d)\d{6}(?!\d)/u',$raw,$m);$codes=array_values(array_unique($m[0]));
 return count($codes)===1?$codes[0]:rcNorm($raw);
}
function rcValidEwo(string $ewo): bool {return (bool)preg_match('/^\d{6}$/D',$ewo);}
function rcScope(string $ewo,string $source,string $color): string {return hash('sha256',json_encode([$ewo,$source,rcColorKey($color)],JSON_THROW_ON_ERROR));}
function rcProjection(string $source,array $v): array {
 $cols=['rfd'=>[2,6,7,8,9],'booking'=>[0,7,null,5,6],'cutting'=>[3,6,null,null,null]][$source];
 $out=['nonblank'=>(bool)array_filter($v,fn($v)=>trim($v)!=='')];foreach(['ewo','color','details','construction','composition'] as $i=>$key)$out[$key]=$cols[$i]===null?null:$v[$cols[$i]];return $out;
}
function rcMappingsInstalled(): bool {return (int)run("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='ekwl_rfd_color_mappings'")->fetchColumn()===1;}
function rcPrepare(): void {
 run("CREATE TABLE IF NOT EXISTS ekwl_rfd_color_mappings (id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,ewo CHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,source_name VARCHAR(16) CHARACTER SET ascii NOT NULL,from_color TEXT NOT NULL,to_color TEXT NOT NULL,is_active TINYINT(1) NOT NULL DEFAULT 1,revision INT UNSIGNED NOT NULL DEFAULT 1,approved_by CHAR(36) NOT NULL,approved_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),source_digest CHAR(64) CHARACTER SET ascii NOT NULL,KEY ekwl_color_mapping_ewo (ewo,is_active)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
}
function rcStoredMappings(): array {
 return rcMappingsInstalled()?run('SELECT id,scope_key,ewo,source_name,from_color,to_color,is_active,revision,approved_at,source_digest FROM ekwl_rfd_color_mappings WHERE is_active=1 ORDER BY scope_key')->fetchAll():[];
}
function rcOrderBank(): array {
 $h=run("SELECT id,file_name,uploaded_at,raw_rows,nonblank_rows,source_columns FROM ekwl_order_bank_upload_batches WHERE status='SUCCESS' ORDER BY uploaded_at DESC,id DESC LIMIT 1")->fetch();
 if(!$h)return ['head'=>null,'rows'=>[],'status'=>'Not uploaded'];
 $headers=json_decode($h['source_columns'],true,64,JSON_THROW_ON_ERROR);unset($h['source_columns']);
 if(!is_array($headers)||!in_array('EWO',$headers,true)||!in_array('GmtColor',$headers,true))return ['head'=>$h,'rows'=>[],'status'=>'EWO/GmtColor columns unavailable'];
 $out=[];$next=1;$nonblank=0;$cursor=run('SELECT source_row_no,EWO,GmtColor,source_data FROM ekwl_order_bank_raw WHERE upload_batch_id=? ORDER BY source_row_no',[$h['id']]);
 while($r=$cursor->fetch()){
  if((int)$r['source_row_no']!==$next++)throw new ApiError('Order Bank source row sequence is incomplete.',409);
  $raw=json_decode($r['source_data'],true,64,JSON_THROW_ON_ERROR);
  if(!is_array($raw)||array_keys($raw)!==$headers)throw new ApiError('Order Bank source headings failed verification.',409);
  foreach($raw as $v)if(!is_string($v))throw new ApiError('Order Bank source cells changed type.',409);
  if($raw['EWO']!==($r['EWO']??'')||$raw['GmtColor']!==($r['GmtColor']??''))throw new ApiError('Order Bank identity differs from original source cells.',409);
  if(array_filter($raw,fn($v)=>trim($v)!==''))$nonblank++;
  $out[]=['n'=>(int)$r['source_row_no']+1,'v'=>['ewo'=>$raw['EWO'],'color'=>$raw['GmtColor'],'details'=>null,'construction'=>null,'composition'=>null,'nonblank'=>(bool)array_filter($raw,fn($v)=>trim($v)!=='')]];
 }
 if($next-1!==(int)$h['raw_rows']||$nonblank!==(int)$h['nonblank_rows'])throw new ApiError('Order Bank source count failed verification.',409);
 return ['head'=>$h,'rows'=>$out,'status'=>'Complete'];
}
function rcContext(array $sources,array $stored,bool $projected=false): array {
 $present=[];$targets=[];
 foreach($sources as $source=>$s)foreach($s['rows'] as $row){$v=$projected||$source==='orderbank'?$row['v']:rcProjection($source,$row['v']);$ewo=rcEwo($v['ewo']);$color=rcColorKey($v['color']);if(!rcValidEwo($ewo)||$color==='')continue;$present[$source][$ewo][$color]=true;if($source==='orderbank')$targets[$ewo][$color]=$v['color'];}
 $effective=[];$entries=[];
 foreach($stored as $m){$reason=null;$source=$m['source_name'];$ewo=$m['ewo'];$from=rcColorKey($m['from_color']);$to=rcColorKey($m['to_color']);
  if($m['scope_key']!==rcScope($ewo,$source,$m['from_color']))$reason='Mapping identity failed verification.';
  elseif(!isset($targets[$ewo][$to]))$reason='Approved target is absent from the current Order Bank.';
  elseif(!isset($present[$source][$ewo][$from]))$reason='Original color is absent from the current source.';
  elseif(isset($targets[$ewo][$from])&&$from!==$to)$reason='Original color is already a distinct Order Bank color.';
  if($reason===null)$effective[rcScope($ewo,$source,$m['from_color'])]=$m;
  $entries[]=array_merge($m,['valid'=>$reason===null,'issue'=>$reason]);
 }
 return ['effective'=>$effective,'entries'=>$entries,'targets'=>$targets];
}
function rcColorLabel(array $identity,string $source,$ewo,$color): string {
 $m=$identity['effective'][rcScope(rcEwo($ewo),$source,(string)$color)]??null;return $m?$m['to_color']:(string)$color;
}
