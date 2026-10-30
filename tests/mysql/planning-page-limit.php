<?php
declare(strict_types=1);
require __DIR__.'/../../backend/src/bootstrap.php';
require __DIR__.'/../../backend/src/query.php';
$q=['fields'=>'record_id,plan_date,value','filters'=>[['eq','upload_id','selected-upload']]];
if(\Ekwl\selectPageLimit('plan_daily',$q)!==10000)throw new RuntimeException('Scoped daily page denied');
foreach([
 ['fabric_cutting_info',$q],['plan_records',$q],
 ['plan_daily',array_replace($q,['fields'=>'*'])],
 ['plan_daily',array_replace($q,['filters'=>[]])],
 ['plan_daily',array_replace($q,['filters'=>[['in','upload_id',['selected-upload']]]])],
 ['plan_daily',array_replace($q,['filters'=>[['eq','upload_id',null]]])]
] as [$table,$query])if(\Ekwl\selectPageLimit($table,$query)!==1000)throw new RuntimeException('General pagination bound widened');
echo "PASS narrow selected-upload daily pages only; all general reads retain 1000-row bound\n";
