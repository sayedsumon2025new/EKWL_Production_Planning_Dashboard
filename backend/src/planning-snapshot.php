<?php
declare(strict_types=1);
namespace Ekwl;

/** Read one complete upload in a single repeatable-read transaction.
 * Daily cells are streamed as tuples: no giant PHP array or paged-version mixing.
 */
function planningSnapshotRead(array $u,array $b): void {
    $started=microtime(true);
    requirePermission($u,'home');
    $id=$b['upload_id']??null;
    if(!is_string($id)||!preg_match('/^[a-f0-9-]{36}$/Di',$id))throw new ApiError('A selected planning upload is required.');
    $pdo=db();
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $pdo->beginTransaction();
    try {
        $upload=run("SELECT * FROM ekwl_plan_uploads WHERE id=? AND status='complete'",[$id])->fetch();
        if(!$upload)throw new ApiError('Selected planning upload is unavailable. Refresh the plan list.',409);
        $fields='id,source_row,line_no,buyer,product_type,product,ewo,po,col,print,emb,outsource,order_qty,pcd,delivery,psd,pfd,manpower,smv,criteria,total,is_summary_row';
        $source=run('SELECT '.$fields.' FROM ekwl_plan_records WHERE upload_id=? ORDER BY source_row,id',[$id])->fetchAll();
        // One grouped daily scan replaces correlated existence probes and repeated
        // joins/scans. SQL DECIMAL SUM remains exact; no float reconciliation.
        // record_id is BIGINT. Grouping its exact numeric expression prevents
        // an ordered grouping scan over every upload's record/date index.
        // The upload filter can use its own index without any index-name hint.
        $groups=run('SELECT record_id,COUNT(*) n,SUM(value) daily_total,SUM(value IS NULL) invalid_rows FROM ekwl_plan_daily WHERE upload_id=? GROUP BY (record_id+0)',[$id]);
        $byRecord=[];$dailyStats=['n'=>0,'invalid_rows'=>0];
        while($row=$groups->fetch()){
            $byRecord[(string)$row['record_id']]=$row;
            $dailyStats['n']+=(int)$row['n'];$dailyStats['invalid_rows']+=(int)$row['invalid_rows'];
        }
        $groups->closeCursor();
        $stats=['n'=>count($source),'distinct_rows'=>0,'lo'=>$source[0]['source_row']??0,'hi'=>$source?end($source)['source_row']:0,'missing_daily'=>0];
        $sourceRows=[];$records=[];$bad=null;
        foreach($source as $r){
            $sourceRows[(string)$r['source_row']]=true;
            $daily=$byRecord[(string)$r['id']]??null;unset($byRecord[(string)$r['id']]);
            if(!$daily)$stats['missing_daily']++;
            if(!$r['is_summary_row']&&in_array($r['criteria'],['Plan/Day','SAH/Day','Clock Hour/Day'],true)
                &&(!$daily||$r['total']===null||$daily['daily_total']===null||decimalComparable((string)$r['total'])!==decimalComparable((string)$daily['daily_total'])))
                $bad??=$r+['daily_total'=>$daily['daily_total']??null];
            if(!$r['is_summary_row']&&in_array($r['criteria'],['Plan/Day','SAH/Day','Clock Hour/Day','Effi/Day'],true))$records[]=hydrate($r,catalog()['plan_records']);
        }
        $stats['distinct_rows']=count($sourceRows);
        // A remaining group belongs to a missing record or a different upload.
        $dailyStats['invalid_rows']+=count($byRecord);
        validatePlanningCounts($upload,$stats,$dailyStats);
        if($bad)throw new ApiError('Planning source row '.$bad['source_row'].' ('.$bad['criteria'].'): Total '.($bad['total']??'missing').' does not match daily sum '.($bad['daily_total']??'missing').'. Check the original report and re-import; no partial planning data was published.',409);
        unset($source,$sourceRows,$byRecord);
        // Start the only large query unbuffered. All other SQL is finished first.
        $pdo->setAttribute(\PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,false);
        $cursor=run('SELECT record_id,plan_date,value FROM ekwl_plan_daily WHERE upload_id=? ORDER BY plan_date,record_id,id',[$id]);
        header('Server-Timing: planning_prepare;dur='.round((microtime(true)-$started)*1000,1));
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
