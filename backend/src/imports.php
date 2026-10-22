<?php
declare(strict_types=1);
namespace Ekwl;
function snapshotLock(): void {run("SELECT name FROM ekwl_locks WHERE name='snapshots' FOR UPDATE");}
function finalizePlan(string $id,array $u): void {
    $upload=run('SELECT * FROM ekwl_plan_uploads WHERE id=? FOR UPDATE',[$id])->fetch();
    if(!$upload||$upload['uploaded_by']!==$u['auth_user_id']||$upload['status']!=='processing')throw new ApiError('Owned staging upload required.',403);
    $rows=(int)run('SELECT COUNT(*) FROM ekwl_plan_records WHERE upload_id=?',[$id])->fetchColumn();
    $daily=(int)run('SELECT COUNT(*) FROM ekwl_plan_daily WHERE upload_id=?',[$id])->fetchColumn();
    $minMax=run('SELECT MIN(source_row) lo,MAX(source_row) hi FROM ekwl_plan_records WHERE upload_id=?',[$id])->fetch();
    if($rows!==(int)$upload['row_count']||!$upload['expected_daily_rows']||$daily!==(int)$upload['expected_daily_rows']||(int)$minMax['lo']!==2||(int)$minMax['hi']!==$rows+1)throw new ApiError('Planning record/daily row-count audit failed.',409);
    $bad=(int)run('SELECT COUNT(*) FROM ekwl_plan_records r WHERE r.upload_id=? AND NOT EXISTS(SELECT 1 FROM ekwl_plan_daily d WHERE d.record_id=r.id)',[$id])->fetchColumn();
    if($bad)throw new ApiError('Some planning records have no daily cells.',409);
    run("UPDATE ekwl_plan_uploads SET status='complete',revision=revision+1 WHERE id=?",[$id]);audit('planning.activate',$id,['records'=>$rows,'daily'=>$daily]);
}
function finalizeSnapshot(string $table,array $u,array $b): array {
    requirePermission($u,$table==='embellishment_send_receive_rows'?'embellishment_upload':'admin');
    $id=(string)($b['p_batch_id']??'');$expected=(int)($b['p_expected_rows']??0);$file=(string)($b['p_file_name']??'');
    if(!$id||$expected<1||$expected>100000||!$file)throw new ApiError('Invalid snapshot details.');
    return transaction(function()use($table,$u,$id,$expected,$file){
        snapshotLock();
        $rows=run('SELECT COUNT(*) n,MIN(source_row_no) lo,MAX(source_row_no) hi,COUNT(DISTINCT file_name) files,MIN(file_name) file,SUM(uploaded_by<>?) foreign_rows FROM '.ident('ekwl_'.$table).' WHERE batch_id=?',[$u['auth_user_id'],$id])->fetch();
        if((int)$rows['n']!==$expected||(int)$rows['lo']!==2||(int)$rows['hi']!==$expected+1||(int)$rows['files']!==1||$rows['file']!==$file||(int)$rows['foreign_rows']!==0)throw new ApiError('Snapshot source-order/owner/count audit failed.',409);
        if($table==='accessories_rows'){
            $invalid=(int)run("SELECT COUNT(*) FROM ekwl_accessories_rows WHERE batch_id=? AND (report_date IS NULL OR report_date='' OR JSON_EXTRACT(row_data,'$.PSD') IS NULL OR report_date<>TRIM(JSON_UNQUOTE(JSON_EXTRACT(row_data,'$.PSD'))))",[$id])->fetchColumn();
            if($invalid)throw new ApiError('Accessories report dates must exactly match source PSD text.',409);
        }
        run('UPDATE '.ident('ekwl_'.$table).' SET is_active=0 WHERE is_active=1');
        run('UPDATE '.ident('ekwl_'.$table).' SET is_active=1,uploaded_at=UTC_TIMESTAMP(6) WHERE batch_id=?',[$id]);
        audit('snapshot.activate',$table,['batch'=>$id,'rows'=>$expected]);return ['status'=>'SUCCESS','uploaded_rows'=>$expected];
    });
}
function finalizeOrderBank(array $u,array $b): array {
    requirePermission($u,'admin');$token=(string)($b['p_upload_token']??'');$expected=(int)($b['p_expected_rows']??0);$headers=$b['p_source_columns']??[];$file=(string)($b['p_file_name']??'');
    if(!$token||$expected<1||!$file||!is_array($headers)||!$headers||count($headers)>1000)throw new ApiError('Invalid Order Bank details.');
    $seen=[];foreach($headers as $h){if(!is_string($h)||$h!==trim($h)||!$h||isset($seen[strtolower($h)]))throw new ApiError('Unique nonblank source headings required.');$seen[strtolower($h)]=true;}
    return transaction(function()use($u,$token,$expected,$headers,$file){
        snapshotLock();
        $existing=run('SELECT * FROM ekwl_order_bank_upload_batches WHERE upload_token=?',[$token])->fetch();
        if($existing){if($existing['uploaded_by']!==$u['auth_user_id']||$existing['status']!=='SUCCESS')throw new ApiError('Import token unavailable.',409);return ['status'=>'SUCCESS','batch_id'=>(string)$existing['id'],'raw_rows'=>(int)$existing['raw_rows'],'staging_rows'=>(int)$existing['raw_rows']];}
        $stats=run('SELECT COUNT(*) n,MIN(source_row_no) lo,MAX(source_row_no) hi,SUM(uploaded_by<>?) foreign_rows FROM ekwl_order_bank_import_rows WHERE upload_token=?',[$u['auth_user_id'],$token])->fetch();
        if((int)$stats['n']!==$expected||(int)$stats['lo']!==1||(int)$stats['hi']!==$expected||(int)$stats['foreign_rows']!==0)throw new ApiError('Order Bank row-count/source-order audit failed.',409);
        run("INSERT INTO ekwl_order_bank_upload_batches (file_name,uploaded_at,uploaded_by,raw_rows,nonblank_rows,status,source_columns,upload_token) VALUES (?,UTC_TIMESTAMP(6),?,?,0,'processing',?,?)",[$file,$u['auth_user_id'],$expected,json_encode($headers,JSON_THROW_ON_ERROR),$token]);
        $batch=db()->lastInsertId();$offset=0;$nonblank=0;
        do{
            $part=run('SELECT * FROM ekwl_order_bank_import_rows WHERE upload_token=? ORDER BY source_row_no LIMIT 500 OFFSET '.$offset,[$token])->fetchAll();
            foreach($part as $row){
                $source=json_decode($row['source_data'],true,64,JSON_THROW_ON_ERROR);
                if(array_keys($source)!==$headers)throw new ApiError('Order Bank columns/order differ from manifest.',409);
                foreach($source as $v)if(!is_string($v))throw new ApiError('Source cells must be strings.');
                if(count(array_filter($source,fn($v)=>trim($v)!=='')))$nonblank++;
                $raw=['upload_batch_id'=>$batch,'source_row_no'=>$row['source_row_no'],'source_data'=>$source];
                foreach(catalog()['order_bank_raw']['columns'] as $key=>$type)if(array_key_exists($key,$source))$raw[$key]=$source[$key];
                insertRows('order_bank_raw',[$raw]);
            }
            $offset+=count($part);
        }while(count($part)===500);
        if(!$nonblank)throw new ApiError('Order Bank cannot be entirely blank.');
        run("UPDATE ekwl_order_bank_upload_batches SET status='SUCCESS',nonblank_rows=? WHERE id=?",[$nonblank,$batch]);
        // Keep staging evidence for recovery; excluded from public read paths.
        audit('orderbank.activate',(string)$batch,['rows'=>$expected]);
        return ['status'=>'SUCCESS','batch_id'=>$batch,'raw_rows'=>$expected,'staging_rows'=>$expected,'nonblank_rows'=>$nonblank,'source_column_count'=>count($headers)];
    });
}
function reportImport(array $u,array $b): array {
    $action=$b['action']??'';$map=['fabric'=>'fabric_cutting_info','sewing'=>'sewing_input_output','production'=>'date_wise_production'];
    if($action==='begin'){
        $kind=$b['kind']??'';if(!isset($map[$kind]))throw new ApiError('Unknown report.');requirePermission($u,$kind);
        $expected=(int)($b['expected_rows']??0);if($expected<1||$expected>1000000)throw new ApiError('Invalid row count.');
        $id=uuid();run("INSERT INTO ekwl_import_jobs VALUES (?,?,?,'staging',?,0,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))",[$id,$kind,$u['auth_user_id'],$expected,json_encode(['replace'=>(bool)($b['replace']??true)],JSON_THROW_ON_ERROR)]);
        audit('import.begin',$id);return ['id'=>$id];
    }
    $id=(string)($b['id']??'');
    return transaction(function()use($id,$u,$b,$action,$map){
        $job=run('SELECT * FROM ekwl_import_jobs WHERE id=? FOR UPDATE',[$id])->fetch();
        if(!$job||$job['owner_id']!==$u['auth_user_id'])throw new ApiError('Import not found.',404);
        requirePermission($u,$job['kind']);$table=$map[$job['kind']];
        if($action==='status')return ['job'=>$job,'chunks'=>run('SELECT chunk_no,digest,row_count FROM ekwl_import_chunks WHERE job_id=? ORDER BY chunk_no',[$id])->fetchAll()];
        if($action==='abort'){
            if($job['state']!=='staging')throw new ApiError('Only incomplete imports can be aborted.',409);
            run("UPDATE ekwl_import_jobs SET state='aborted' WHERE id=?",[$id]);audit('import.abort',$id);return ['success'=>true];
        }
        if($job['state']==='complete'&&$action==='finalize')return ['success'=>true,'inserted_rows'=>(int)$job['received_rows']];
        if($job['state']!=='staging')throw new ApiError('Import is not staging.',409);
        if($action==='chunk'){
            $rows=$b['rows']??[];$no=(int)($b['chunk_no']??-1);
            if(!is_array($rows)||!array_is_list($rows)||!$rows||count($rows)>800||$no<0)throw new ApiError('Invalid import chunk.');
            $payload=json_encode($rows,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);$hash=hash('sha256',$payload);
            $old=run('SELECT digest FROM ekwl_import_chunks WHERE job_id=? AND chunk_no=?',[$id,$no])->fetchColumn();
            if($old){if(!hash_equals($old,$hash))throw new ApiError('Chunk retry differs from original.',409);return ['received_rows'=>(int)$job['received_rows'],'duplicate'=>true];}
            if((int)$job['received_rows']+count($rows)>(int)$job['expected_rows'])throw new ApiError('Too many rows.',409);
            foreach($rows as &$r){if(!is_array($r))throw new ApiError('Row object required.');unset($r['id']);$r['report_batch_id']=$id;$r['uploaded_by']=$u['auth_user_id'];$r['uploaded_at']=gmdate('Y-m-d H:i:s');if($job['kind']==='production'&&empty($r['output_date']))throw new ApiError('Production date required.');}unset($r);
            insertRows($table,$rows);
            run('INSERT INTO ekwl_import_chunks VALUES (?,?,?,?,?)',[$id,$no,$hash,count($rows),$payload]);
            run('UPDATE ekwl_import_jobs SET received_rows=received_rows+?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[count($rows),$id]);
            return ['received_rows'=>(int)$job['received_rows']+count($rows),'digest'=>$hash];
        }
        if($action==='finalize'){
            if((int)$job['expected_rows']!==(int)$job['received_rows'])throw new ApiError('Import row-count mismatch.',409);
            snapshotLock();
            $scopes=$job['kind']==='production'?run('SELECT DISTINCT CAST(output_date AS CHAR) FROM ekwl_date_wise_production WHERE report_batch_id=?',[$id])->fetchAll(\PDO::FETCH_COLUMN):['all'];
            $meta=json_decode($job['metadata'],true,16,JSON_THROW_ON_ERROR);
            foreach($scopes as $scope){
                if($meta['replace'])run('DELETE FROM ekwl_report_heads WHERE kind=? AND scope=?',[$job['kind'],$scope]);
                elseif(!run('SELECT 1 FROM ekwl_report_heads WHERE kind=? AND scope=? LIMIT 1',[$job['kind'],$scope])->fetchColumn())run('INSERT INTO ekwl_report_heads VALUES (?,?,?)',[$job['kind'],$scope,'legacy']);
                run('INSERT INTO ekwl_report_heads VALUES (?,?,?)',[$job['kind'],$scope,$id]);
            }
            run("UPDATE ekwl_import_jobs SET state='complete',updated_at=UTC_TIMESTAMP(6) WHERE id=?",[$id]);audit('import.activate',$id,['rows'=>$job['received_rows']]);
            return ['success'=>true,'inserted_rows'=>(int)$job['received_rows']];
        }
        throw new ApiError('Unknown import action.');
    });
}
function rpc(array $u,array $q): array {
    $name=$q['name']??'';$b=$q['args']??[];
    $snap=['finalize_size_set_upload'=>'size_set_rows','finalize_accessories_upload'=>'accessories_rows','finalize_embellishment_upload'=>'embellishment_send_receive_rows'];
    if(isset($snap[$name]))return ['data'=>finalizeSnapshot($snap[$name],$u,$b)];
    if($name==='finalize_order_bank_import')return ['data'=>finalizeOrderBank($u,$b)];
    if(in_array($name,['replace_floor_allocation','replace_slide4_chassis_strength'],true)){
        requirePermission($u,'admin_settings');$table=$name==='replace_floor_allocation'?'floor_allocation':'slide4_chassis_strength';$rows=$b['p_rows']??[];
        if(!is_array($rows)||!$rows||count($rows)>1000)throw new ApiError('Invalid master rows.');
        return transaction(function()use($table,$rows,$u){snapshotLock();run('DELETE FROM '.ident('ekwl_'.$table));insertRows($table,$rows);audit('master.replace',$table);return ['data'=>['status'=>'SUCCESS','row_count'=>count($rows)]];});
    }
    if($name==='ekwl_save_report'&&($b['p_kind']??'')==='chassis'){
        requirePermission($u,'admin_settings');$rows=$b['p_rows']??[];if(!is_array($rows)||!$rows||count($rows)>1000)throw new ApiError('Invalid chassis rows.');
        return transaction(function()use($rows){snapshotLock();run('DELETE FROM ekwl_line_chassis_priority');insertRows('line_chassis_priority',$rows);audit('chassis.replace');return ['data'=>['success'=>true,'inserted_rows'=>count($rows)]];});
    }
    if($name==='get_ready_input_coverage')return ['data'=>derivedQuery($u,$q,'coverage')];
    throw new ApiError('Unknown business operation.',404);
}
