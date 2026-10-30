<?php
declare(strict_types=1);
namespace Ekwl;

/** Read one complete upload in a single repeatable-read transaction.
 * Daily cells are streamed as tuples: no giant PHP array or paged-version mixing.
 */
function planningSnapshotRead(array $u,array $b): void {
    requirePermission($u,'home');
    $id=$b['upload_id']??null;
    if(!is_string($id)||!preg_match('/^[a-f0-9-]{36}$/Di',$id))throw new ApiError('A selected planning upload is required.');
    $pdo=db();
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $pdo->beginTransaction();
    try {
        $upload=run("SELECT * FROM ekwl_plan_uploads WHERE id=? AND status='complete'",[$id])->fetch();
        if(!$upload)throw new ApiError('Selected planning upload is unavailable. Refresh the plan list.',409);
        $stats=run('SELECT COUNT(*) n,COUNT(DISTINCT source_row) distinct_rows,MIN(source_row) lo,MAX(source_row) hi,SUM(NOT EXISTS(SELECT 1 FROM ekwl_plan_daily d WHERE d.record_id=ekwl_plan_records.id AND d.upload_id=ekwl_plan_records.upload_id)) missing_daily FROM ekwl_plan_records WHERE upload_id=?',[$id])->fetch();
        $dailyStats=run('SELECT COUNT(*) n,SUM(d.value IS NULL OR r.id IS NULL) invalid_rows FROM ekwl_plan_daily d LEFT JOIN ekwl_plan_records r ON r.id=d.record_id AND r.upload_id=d.upload_id WHERE d.upload_id=?',[$id])->fetch();
        validatePlanningCounts($upload,$stats,$dailyStats);
        $bad=run("SELECT r.id,r.source_row,r.criteria,r.total,SUM(d.value) daily_total FROM ekwl_plan_records r LEFT JOIN ekwl_plan_daily d ON d.record_id=r.id AND d.upload_id=r.upload_id WHERE r.upload_id=? AND r.is_summary_row=0 AND r.criteria IN ('Plan/Day','SAH/Day','Clock Hour/Day') GROUP BY r.id,r.source_row,r.criteria,r.total HAVING COUNT(d.id)=0 OR r.total IS NULL OR SUM(d.value)<>r.total LIMIT 1",[$id])->fetch();
        if($bad)throw new ApiError('Planning source row '.$bad['source_row'].' ('.$bad['criteria'].'): Total '.($bad['total']??'missing').' does not match daily sum '.($bad['daily_total']??'missing').'. Check the original report and re-import; no partial planning data was published.',409);
        $fields='id,source_row,line_no,buyer,product_type,product,ewo,po,col,print,emb,outsource,order_qty,pcd,delivery,psd,pfd,manpower,smv,criteria,total,is_summary_row';
        $records=run("SELECT ".$fields." FROM ekwl_plan_records WHERE upload_id=? AND is_summary_row=0 AND criteria IN ('Plan/Day','SAH/Day','Clock Hour/Day','Effi/Day') ORDER BY source_row,id",[$id])->fetchAll();
        $records=array_map(fn($r)=>hydrate($r,catalog()['plan_records']),$records);
        // Start the only large query unbuffered. All other SQL is finished first.
        $pdo->setAttribute(\PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,false);
        $cursor=run('SELECT record_id,plan_date,value FROM ekwl_plan_daily WHERE upload_id=? ORDER BY plan_date,record_id,id',[$id]);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
        if(function_exists('ob_gzhandler')&&!ini_get('zlib.output_compression')&&!headers_sent()&&str_contains($_SERVER['HTTP_ACCEPT_ENCODING']??'','gzip'))ob_start('ob_gzhandler',8192);
        $flags=JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE;
        echo '{"data":{"format":"planning-tuples-v1","upload":'.json_encode($upload,$flags).',"records":'.json_encode($records,$flags).',"daily":[';
        $count=0;
        while($row=$cursor->fetch()){
            if($count++)echo ',';
            echo json_encode([$row['record_id'],$row['plan_date'],$row['value']],$flags);
        }
        $cursor->closeCursor();$pdo->setAttribute(\PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,true);
        if($count!==(int)$dailyStats['n'])throw new ApiError('Planning snapshot read was incomplete.',409);
        $pdo->commit();
        echo '],"integrity":'.json_encode(['complete'=>true,'upload_id'=>$id,'revision'=>$upload['revision'],'record_count'=>count($records),'source_record_count'=>(int)$stats['n'],'daily_count'=>$count,'totals_reconciled'=>true],$flags).'},"error":null}';
    }catch(\Throwable $e){
        if(isset($cursor))$cursor->closeCursor();
        $pdo->setAttribute(\PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,true);
        if($pdo->inTransaction())$pdo->rollBack();
        throw $e;
    }
}

function validatePlanningCounts(array $upload,array $records,array $daily): void {
    $n=(int)($records['n']??0);
    if($n<1||$n!==(int)($upload['row_count']??0)||$n!==(int)($records['distinct_rows']??0)
        ||(int)($records['lo']??0)!==2||(int)($records['hi']??0)!==$n+1
        ||(int)($daily['n']??0)<1||(int)$daily['n']!==(int)($upload['expected_daily_rows']??0)
        ||(int)($daily['invalid_rows']??0)!==0||(int)($records['missing_daily']??0)!==0)
        throw new ApiError('Planning integrity check failed: source rows or daily cells are missing, duplicated, invalid or inconsistent. Check the original report and re-import.',409);
}
