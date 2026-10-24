<?php
declare(strict_types=1);
namespace Ekwl;
function quarterBounds(string $quarter): array {
    if(!preg_match('/^(20\d{2})-Q([1-4])$/',$quarter,$m))throw new ApiError('Use YYYY-Q1 through YYYY-Q4.');
    $start=sprintf('%04d-%02d-01',(int)$m[1],((int)$m[2]-1)*3+1);
    return [$start,(new \DateTimeImmutable($start))->modify('+3 months')->format('Y-m-d')];
}
function archiveScope(string $table,array $bounds): array {
    [$from,$to]=$bounds;
    $upload="SELECT id FROM ekwl_plan_uploads WHERE status='complete' AND uploaded_at>=? AND uploaded_at<?";
    $batch="SELECT id FROM ekwl_order_bank_upload_batches WHERE status='SUCCESS' AND uploaded_at>=? AND uploaded_at<?";
    if($table==='plan_uploads')return ["status='complete' AND uploaded_at>=? AND uploaded_at<?",[$from,$to]];
    if(in_array($table,['plan_records','plan_daily'],true))return ['upload_id IN ('.$upload.')',[$from,$to]];
    if($table==='order_bank_raw')return ['upload_batch_id IN ('.$batch.')',[$from,$to]];
    if($table==='order_bank_upload_batches')return ["status='SUCCESS' AND uploaded_at>=? AND uploaded_at<?",[$from,$to]];
    if($table==='date_wise_production')return ['output_date>=? AND output_date<?',[$from,$to]];
    return ['uploaded_at>=? AND uploaded_at<?',[$from,$to]];
}
function archiveTables(): array {return ['plan_uploads','plan_records','plan_daily','order_bank_upload_batches','order_bank_raw','fabric_cutting_info','sewing_input_output','date_wise_production','size_set_rows','accessories_rows','embellishment_send_receive_rows'];}
function archiveDir(string $id): string {
    if(!preg_match('/^[a-f0-9-]{36}$/',$id))throw new ApiError('Invalid archive ID.');
    return config()['private_dir'].'/archives/'.$id;
}
function archiveAction(array $u,array $b): array {
    requirePermission($u,'admin');$action=$b['action']??'list';
    if($action==='list')return ['jobs'=>run('SELECT * FROM ekwl_archive_jobs ORDER BY created_at DESC LIMIT 100')->fetchAll()];
    if($action==='estimate'){
        $bounds=quarterBounds((string)($b['quarter']??''));$counts=[];
        foreach(archiveTables() as $t){[$where,$args]=archiveScope($t,$bounds);$counts[$t]=(int)run('SELECT COUNT(*) FROM '.ident('ekwl_'.$t).' WHERE '.$where,$args)->fetchColumn();}
        return ['counts'=>$counts,'total_rows'=>array_sum($counts),'bounds'=>$bounds];
    }
    if($action==='begin'){
        if(!(config()['maintenance']??false))throw new ApiError('Pause application writes before creating a consistent quarterly archive.',409);
        $quarter=(string)($b['quarter']??'');quarterBounds($quarter);
        return transaction(function()use($quarter,$u){
            run("SELECT name FROM ekwl_locks WHERE name='archives' FOR UPDATE");
            $existing=run('SELECT * FROM ekwl_archive_jobs WHERE quarter=?',[$quarter])->fetch();
            if($existing)return ['job'=>$existing];
            $estimate=archiveAction($u,['action'=>'estimate','quarter'=>$quarter]);$id=uuid();
            $manifest=['format'=>'ekwl-quarter-v1','quarter'=>$quarter,'bounds'=>$estimate['bounds'],'counts'=>$estimate['counts'],'tables'=>archiveTables(),'table_index'=>0,'offset'=>0,'files'=>[],'verified'=>false,'restore_tested'=>false,'created_at'=>gmdate(DATE_ATOM),'schema_sha256'=>hash_file('sha256',dirname(__DIR__,2).'/database/mysql/schema.sql')];
            $dir=archiveDir($id);if(!mkdir($dir,0700,true)&&!is_dir($dir))throw new ApiError('Archive directory unavailable.',503);
            run("INSERT INTO ekwl_archive_jobs VALUES (?,?,?,'exporting',?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))",[$id,$quarter,$u['auth_user_id'],json_encode($manifest,JSON_THROW_ON_ERROR)]);
            audit('archive.begin',$id);return ['id'=>$id,'manifest'=>$manifest];
        });
    }
    $id=(string)($b['id']??'');
    if($action==='step'){
        if(!(config()['maintenance']??false))throw new ApiError('Writes must remain paused throughout archive export.',409);
        return transaction(function()use($id){
            $job=run('SELECT * FROM ekwl_archive_jobs WHERE id=? FOR UPDATE',[$id])->fetch();if(!$job)throw new ApiError('Archive not found.',404);
            $m=json_decode($job['manifest'],true,64,JSON_THROW_ON_ERROR);
            if($job['state']!=='exporting')return ['state'=>$job['state'],'manifest'=>$m];
            $t=$m['tables'][$m['table_index']];[$where,$args]=archiveScope($t,$m['bounds']);
            $c=catalog()[$t];$order=implode(',',array_map('Ekwl\\ident',$c['pk']));
            $rows=run('SELECT * FROM '.ident('ekwl_'.$t).' WHERE '.$where.' ORDER BY '.$order.' LIMIT 500 OFFSET '.(int)$m['offset'],$args)->fetchAll();
            if($rows){
                $file=$t.'-'.sprintf('%09d',$m['offset']).'.ndjson';$path=archiveDir($id).'/'.$file;$data='';
                foreach($rows as $r)$data.=json_encode(hydrate($r,$c),JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE)."\n";
                if(file_put_contents($path.'.tmp',$data,LOCK_EX)!==strlen($data)||!rename($path.'.tmp',$path))throw new ApiError('Archive write failed.',503);
                $m['files'][]=['name'=>$file,'table'=>$t,'rows'=>count($rows),'sha256'=>hash('sha256',$data)];$m['offset']+=count($rows);
            }
            if(count($rows)<500){
                if($m['offset']!==$m['counts'][$t])throw new ApiError('Source changed during archive. Keep writes paused and investigate.',409);
                $m['table_index']++;$m['offset']=0;
            }
            $done=$m['table_index']===count($m['tables']);$state=$done?'exported':'exporting';
            run('UPDATE ekwl_archive_jobs SET manifest=?,state=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[json_encode($m,JSON_THROW_ON_ERROR),$state,$id]);
            file_put_contents(archiveDir($id).'/manifest.json',json_encode($m,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR),LOCK_EX);
            return ['state'=>$state,'manifest'=>$m];
        });
    }
    if($action==='verify')return transaction(function()use($id){
        $job=run('SELECT * FROM ekwl_archive_jobs WHERE id=? FOR UPDATE',[$id])->fetch();if(!$job||!in_array($job['state'],['exported','verified'],true))throw new ApiError('Complete export required.',409);
        $m=json_decode($job['manifest'],true,64,JSON_THROW_ON_ERROR);$counts=array_fill_keys($m['tables'],0);
        foreach($m['files'] as $file){$path=archiveDir($id).'/'.$file['name'];if(!is_file($path)||!hash_equals($file['sha256'],hash_file('sha256',$path)))throw new ApiError('Archive checksum failed.',409);
            $n=0;$f=fopen($path,'rb');while(($line=fgets($f))!==false){json_decode($line,true,64,JSON_THROW_ON_ERROR);$n++;}fclose($f);
            if($n!==$file['rows'])throw new ApiError('Archive row count failed.',409);$counts[$file['table']]+=$n;
        }
        if($counts!==$m['counts'])throw new ApiError('Archive table totals differ.',409);
        $m['verified']=true;run("UPDATE ekwl_archive_jobs SET state='verified',manifest=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?",[json_encode($m,JSON_THROW_ON_ERROR),$id]);
        file_put_contents(archiveDir($id).'/manifest.json',json_encode($m,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR),LOCK_EX);audit('archive.verify',$id);
        return ['state'=>'verified','manifest'=>$m,'cleanup_available'=>false];
    });
    // No delete/cleanup implementation. Export verification alone never authorizes deletion.
    throw new ApiError('Unknown archive operation; cleanup is intentionally disabled.',404);
}
function archiveDownload(array $u,string $id,string $file): void {
    requirePermission($u,'admin');$job=run('SELECT * FROM ekwl_archive_jobs WHERE id=?',[$id])->fetch();
    if(!$job||!in_array($job['state'],['exported','verified'],true))throw new ApiError('Archive download unavailable.',404);
    $m=json_decode($job['manifest'],true,64,JSON_THROW_ON_ERROR);$names=array_column($m['files'],'name');$names[]='manifest.json';
    if(!in_array($file,$names,true))throw new ApiError('Unknown archive file.',404);
    header('Content-Type: application/octet-stream');header('Content-Disposition: attachment; filename="'.$file.'"');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
    readfile(archiveDir($id).'/'.$file);
}
