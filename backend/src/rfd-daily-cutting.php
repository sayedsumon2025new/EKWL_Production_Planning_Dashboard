<?php
declare(strict_types=1);
namespace Ekwl;
/** Raw source cells remain strings: no date, number, whitespace or duplicate-row coercion. */
function dcsHeaders(): array {return ["Date", "Buyer", "Buyer Team", "EWO No", "Style No", "Company Name", "Color Name", "Order Qty", "Cutting Today ", "Cutting Total", "Sewing Today", "Sewing Total", "Finishing Receive Today", "Finishing Receive Total", "Iron Today", "Iron Total", "Hang Tag Today", "Hang Tag Total", "Folding Today", "Folding Total", "Poly Today", "Poly Total", "Carton day", "Carton Total", "Carton WIP Qty"];}
function dcsInstalled(): bool {return (int)run("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('ekwl_rfd_daily_production_uploads','ekwl_rfd_daily_production_rows')")->fetchColumn()===2;}
function dcsPrepare(array $u): void {
    requirePermission($u,'admin');
    if(dcsInstalled())return;
    // Additive setup runs only as part of an Admin-requested Daily Production Status upload.
    run("CREATE TABLE IF NOT EXISTS ekwl_rfd_daily_production_uploads (id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,file_name VARCHAR(255) NOT NULL,uploaded_by CHAR(36) NOT NULL,uploaded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),completed_at DATETIME(6) NULL,expected_rows INT UNSIGNED NOT NULL,received_rows INT UNSIGNED NOT NULL DEFAULT 0,source_columns LONGTEXT NOT NULL,file_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,state VARCHAR(16) NOT NULL DEFAULT 'processing',is_active TINYINT(1) NOT NULL DEFAULT 0,KEY ekwl_rfd_daily_production_active (is_active,state,completed_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
    run("CREATE TABLE IF NOT EXISTS ekwl_rfd_daily_production_rows (batch_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,source_row_no INT UNSIGNED NOT NULL,cells LONGTEXT NOT NULL,PRIMARY KEY(batch_id,source_row_no),CONSTRAINT ekwl_rfd_daily_production_batch_fk FOREIGN KEY(batch_id) REFERENCES ekwl_rfd_daily_production_uploads(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
}
function dcsBatchId($id): string {if(!is_string($id)||!preg_match('/^[a-f0-9-]{36}$/Di',$id))throw new ApiError('Invalid Daily Production Status upload.');return $id;}
function dcsCells($cells): array {
    if(!is_array($cells)||!array_is_list($cells)||count($cells)!==count(dcsHeaders()))throw new ApiError('Every Daily Production Status row must have exactly 25 source cells.');
    foreach($cells as $cell)if(!is_string($cell))throw new ApiError('Daily Production Status source cells must be strings; numeric/date conversion is not allowed.');
    return $cells;
}
function dcsAction(array $u,array $b): array {
    $action=$b['action']??'read';
    if($action==='read'){requirePermission($u,'slide_22');dcsRead($u);exit;}
    requirePermission($u,'admin');
    if(config()['maintenance']??false)throw new ApiError('Writes paused for maintenance.',503);
    if($action==='begin'){
        $file=$b['file_name']??null;$n=$b['expected_rows']??null;$hash=$b['file_sha256']??null;
        if(!is_string($file)||!strlen(trim($file))||strlen($file)>255||!is_int($n)||$n<1||$n>100000||!is_string($hash)||!preg_match('/^[a-f0-9]{64}$/D',$hash)||($b['headers']??null)!==dcsHeaders())throw new ApiError('Daily Production Status filename, exact source headers, source hash and 1–100,000 rows are required.');
        dcsPrepare($u);$id=uuid();
        run('INSERT INTO ekwl_rfd_daily_production_uploads (id,file_name,uploaded_by,expected_rows,source_columns,file_sha256) VALUES (?,?,?,?,?,?)',[$id,$file,$u['auth_user_id'],$n,json_encode(dcsHeaders(),JSON_THROW_ON_ERROR),$hash]);
        audit('dcs.begin',$id,['rows'=>$n]);return ['id'=>$id,'expected_rows'=>$n];
    }
    if(!in_array($action,['chunk','finalize'],true))throw new ApiError('Unknown Daily Production Status operation.');
    $id=dcsBatchId($b['id']??null);
    if(!dcsInstalled())throw new ApiError('Start a Daily Production Status upload first.',409);
    return transaction(function()use($u,$b,$action,$id){
        $job=run('SELECT * FROM ekwl_rfd_daily_production_uploads WHERE id=? FOR UPDATE',[$id])->fetch();
        if(!$job||$job['uploaded_by']!==$u['auth_user_id'])throw new ApiError('This Daily Production Status upload does not belong to this account.',403);
        if($action==='finalize'&&$job['state']==='complete')return ['id'=>$id,'status'=>'SUCCESS','rows'=>(int)$job['received_rows']];
        if($job['state']!=='processing')throw new ApiError('Daily Production Status upload is no longer staged.',409);
        if($action==='chunk'){
            $start=$b['start_row']??null;$rows=$b['rows']??null;
            if(!is_int($start)||$start<2||!is_array($rows)||!array_is_list($rows)||!$rows||count($rows)>250||$start+count($rows)-2>(int)$job['expected_rows'])throw new ApiError('Invalid Daily Production Status source-row chunk.');
            $encoded=array_map(fn($cells)=>json_encode(dcsCells($cells),JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$rows);
            $received=(int)$job['received_rows'];
            if($start<=$received+1){
                $prior=run('SELECT source_row_no,cells FROM ekwl_rfd_daily_production_rows WHERE batch_id=? AND source_row_no>=? AND source_row_no<? ORDER BY source_row_no',[$id,$start,$start+count($rows)])->fetchAll();
                if(count($prior)!==count($rows))throw new ApiError('Daily Production Status retry overlaps an incomplete chunk.',409);
                foreach($prior as $i=>$row)if((int)$row['source_row_no']!==$start+$i||json_decode($row['cells'],true,32,JSON_THROW_ON_ERROR)!==$rows[$i])throw new ApiError('Daily Production Status source retry differs from stored cells.',409);
                return ['received_rows'=>$received,'retry'=>true];
            }
            if($start!==$received+2)throw new ApiError('Daily Production Status rows must be uploaded in their original order.',409);
            $args=[];foreach($encoded as $i=>$cells)array_push($args,$id,$start+$i,$cells);
            run('INSERT INTO ekwl_rfd_daily_production_rows (batch_id,source_row_no,cells) VALUES '.implode(',',array_fill(0,count($rows),'(?,?,?)')),$args);
            run('UPDATE ekwl_rfd_daily_production_uploads SET received_rows=received_rows+? WHERE id=?',[count($rows),$id]);return ['received_rows'=>$received+count($rows)];
        }
        snapshotLock();
        $stats=run('SELECT COUNT(*) n,MIN(source_row_no) lo,MAX(source_row_no) hi FROM ekwl_rfd_daily_production_rows WHERE batch_id=?',[$id])->fetch();$n=(int)$job['expected_rows'];
        if((int)$job['received_rows']!==$n||(int)$stats['n']!==$n||(int)$stats['lo']!==2||(int)$stats['hi']!==$n+1)throw new ApiError('Daily Production Status source-row/count audit failed; previous report remains active.',409);
        run('UPDATE ekwl_rfd_daily_production_uploads SET is_active=0 WHERE is_active=1');
        run("UPDATE ekwl_rfd_daily_production_uploads SET state='complete',is_active=1,completed_at=UTC_TIMESTAMP(6) WHERE id=?",[$id]);
        audit('dcs.activate',$id,['rows'=>$n]);return ['id'=>$id,'status'=>'SUCCESS','rows'=>$n];
    });
}
function dcsRead(array $u): void {
    requirePermission($u,'slide_22');
    if(!dcsInstalled()){jsonOut(['data'=>['headers'=>dcsHeaders(),'report'=>null,'rows'=>[],'integrity'=>['complete'=>true,'row_count'=>0],'setup_required'=>true],'error'=>null]);return;}
    $pdo=db();$pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');$pdo->beginTransaction();
    try{
        $reports=run("SELECT id,file_name,expected_rows,received_rows,source_columns,file_sha256,completed_at FROM ekwl_rfd_daily_production_uploads WHERE state='complete' AND is_active=1 ORDER BY completed_at DESC,id DESC LIMIT 2")->fetchAll();
        if(count($reports)>1)throw new ApiError('Daily Production Status active report selection is ambiguous. Ask an administrator to verify the source.',409);
        $report=$reports[0]??null;
        if(!$report){$pdo->commit();jsonOut(['data'=>['headers'=>dcsHeaders(),'report'=>null,'rows'=>[],'integrity'=>['complete'=>true,'row_count'=>0]],'error'=>null]);return;}
        $headers=json_decode($report['source_columns'],true,16,JSON_THROW_ON_ERROR);unset($report['source_columns']);
        if($headers!==dcsHeaders()||(int)$report['received_rows']!==(int)$report['expected_rows'])throw new ApiError('Daily Production Status report metadata failed verification.',409);
        $stats=run('SELECT COUNT(*) n,MIN(source_row_no) lo,MAX(source_row_no) hi FROM ekwl_rfd_daily_production_rows WHERE batch_id=?',[$report['id']])->fetch();$n=(int)$report['expected_rows'];
        if((int)$stats['n']!==$n||(int)$stats['lo']!==2||(int)$stats['hi']!==$n+1)throw new ApiError('Daily Production Status report rows are incomplete. Refresh or re-upload the original report.',409);
        $pdo->setAttribute(\PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,false);$cursor=run('SELECT source_row_no,cells FROM ekwl_rfd_daily_production_rows WHERE batch_id=? ORDER BY source_row_no',[$report['id']]);
        header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
        if(function_exists('ob_gzhandler')&&!ini_get('zlib.output_compression')&&!headers_sent()&&str_contains($_SERVER['HTTP_ACCEPT_ENCODING']??'','gzip'))ob_start('ob_gzhandler',8192);
        $flags=JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES;
        echo '{"data":{"headers":'.json_encode($headers,$flags).',"report":'.json_encode($report,$flags).',"rows":[';$count=0;
        while($row=$cursor->fetch()){
            if((int)$row['source_row_no']!==$count+2)throw new ApiError('Daily Production Status source order changed.',409);
            $cells=dcsCells(json_decode($row['cells'],true,32,JSON_THROW_ON_ERROR));if($count++)echo ',';echo json_encode($cells,$flags);
        }
        $cursor->closeCursor();$pdo->setAttribute(\PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,true);if($count!==$n)throw new ApiError('Incomplete Daily Production Status read.',409);$pdo->commit();
        echo '],"integrity":'.json_encode(['complete'=>true,'row_count'=>$count,'batch_id'=>$report['id']],$flags).'},"error":null}';
    }catch(\Throwable $e){if(isset($cursor))$cursor->closeCursor();$pdo->setAttribute(\PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,true);if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
