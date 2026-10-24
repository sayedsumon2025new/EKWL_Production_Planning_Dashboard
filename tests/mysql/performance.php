<?php
// Synthetic load on an isolated staging fixture. Never an InfinityFree capacity claim.
declare(strict_types=1);
require dirname(__DIR__,2).'/backend/src/bootstrap.php';require dirname(__DIR__,2).'/backend/src/query.php';require dirname(__DIR__,2).'/backend/src/imports.php';
use function Ekwl\{config,run,db,transaction,uuid,insertRows,finalizePlan};
if(PHP_SAPI!=='cli'||(config()['environment']??'')!=='staging')exit(1);
$u=run("SELECT * FROM ekwl_site_users WHERE role='admin' AND status='active' LIMIT 1")->fetch();
if(!$u)throw new RuntimeException('Fixture admin required.');
$id=uuid();$start=microtime(true);
transaction(function()use($id,$u){
    insertRows('plan_uploads',[['id'=>$id,'row_count'=>1000,'expected_daily_rows'=>100000,'status'=>'processing','file_name'=>'synthetic-100k.csv','uploaded_at'=>gmdate('Y-m-d H:i:s'),'uploaded_by'=>$u['auth_user_id'],'planning_month'=>'2026-10-01','revision'=>1]]);
    for($i=0;$i<1000;$i++)insertRows('plan_records',[['upload_id'=>$id,'source_row'=>$i+2,'is_summary_row'=>false,'line_no'=>'Line 1','buyer'=>'Synthetic','ewo'=>sprintf('%08d',$i),'criteria'=>'Plan/Day','total'=>'100.12500000','psd'=>'2026-10-01']]);
});
$ids=run('SELECT id FROM ekwl_plan_records WHERE upload_id=? ORDER BY id',[$id])->fetchAll(PDO::FETCH_COLUMN);
$rows=[];$batches=0;$peakBatch=0;
foreach($ids as $record)for($d=0;$d<100;$d++){
    $date=(new DateTimeImmutable('2026-10-01'))->modify('+'.$d.' days')->format('Y-m-d');
    $rows[]=[$id,$record,$date,'1.00125000'];
    if(count($rows)===500){
        $t=microtime(true);transaction(function()use(&$rows){$args=[];foreach($rows as $row)array_push($args,...$row);run('INSERT INTO ekwl_plan_daily (upload_id,record_id,plan_date,value) VALUES '.implode(',',array_fill(0,count($rows),'(?,?,?,?)')),$args);});
        $peakBatch=max($peakBatch,microtime(true)-$t);$rows=[];$batches++;
    }
}
transaction(fn()=>finalizePlan($id,$u));
$importSeconds=microtime(true)-$start;$read=microtime(true);
$page=run('SELECT record_id,plan_date,value FROM ekwl_plan_daily WHERE upload_id=? ORDER BY plan_date,record_id LIMIT 1000',[$id])->fetchAll();
$readMs=(microtime(true)-$read)*1000;
$count=(int)run('SELECT COUNT(*) FROM ekwl_plan_daily WHERE upload_id=?',[$id])->fetchColumn();
$sum=run('SELECT SUM(value) FROM ekwl_plan_daily WHERE upload_id=?',[$id])->fetchColumn();
if($count!==100000||$sum!=='100125.00000000'||count($page)!==1000)throw new RuntimeException('Large fixture reconciliation failed.');
$plan=run('EXPLAIN SELECT record_id,plan_date,value FROM ekwl_plan_daily WHERE upload_id=? ORDER BY plan_date,record_id LIMIT 1000',[$id])->fetchAll();
echo json_encode(['rows'=>$count,'registered_users'=>(int)run('SELECT COUNT(*) FROM ekwl_site_users')->fetchColumn(),'batches'=>$batches,'import_seconds'=>round($importSeconds,3),'maximum_batch_seconds'=>round($peakBatch,4),'first_1000_rows_ms'=>round($readMs,3),'sum_exact'=>$sum,'explain'=>$plan,'peak_memory_bytes'=>memory_get_peak_usage(true),'shared_host_capacity_verified'=>false],JSON_PRETTY_PRINT)."\n";
