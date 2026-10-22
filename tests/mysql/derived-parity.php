<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/backend/src/bootstrap.php';require dirname(__DIR__,2).'/backend/src/decimal.php';require dirname(__DIR__,2).'/backend/src/readiness-engine.php';
use Ekwl\{ReadinessEngine,Decimal};
if(in_array('--mysql',$argv,true)){require dirname(__DIR__,2).'/backend/src/auth.php';require dirname(__DIR__,2).'/backend/src/query.php';require dirname(__DIR__,2).'/backend/src/imports.php';require dirname(__DIR__,2).'/backend/src/derived.php';}
$fixture=json_decode(file_get_contents($argv[1]),true,64,JSON_THROW_ON_ERROR);$actual=[];
if(in_array('--mysql',$argv,true)){
    $order=['plan_uploads','plan_records','plan_daily','line_chassis_priority','fabric_cutting_info','sewing_input_output','accessories_rows','size_set_rows','embellishment_send_receive_rows','date_wise_production'];
    foreach($order as $table){$rows=$fixture['data'][$table]??[];
        $c=Ekwl\catalog()[$table]??null;if(!$c)continue;
        foreach($rows as $row){if($table==='line_chassis_priority')$row['priority_order']??=1;Ekwl\insertRows($table,[$row]);}
    }
}
foreach($fixture['data']['plan_uploads'] as $upload){
    if(in_array('--mysql',$argv,true)){
        $q=$fixture['kind']==='board'?['filters'=>[['eq','upload_id',$upload['id']]]]:['args'=>['p_upload_id'=>$upload['id']]];
        $rows=Ekwl\derivedQuery(['role'=>'admin','status'=>'active'],$q,$fixture['kind']);
    }else{
        $s=ReadinessEngine::prepare($fixture['data'],(string)$upload['id'],$fixture['today']);$rows=$fixture['kind']==='board'?ReadinessEngine::board($s):ReadinessEngine::coverage($s,$fixture['data']['date_wise_production']);
    }
    array_push($actual,...$rows);
}
function canonical($value,string $key=''){
    if(is_array($value)){foreach($value as $k=>&$v)$v=canonical($v,(string)$k);unset($v);if(!array_is_list($value))ksort($value);return $value;}
    if($value!==null&&str_ends_with($key,'_at'))return (new DateTimeImmutable((string)$value))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
    if(is_bool($value)||$value===null)return $value;
    if(is_numeric($value))return Decimal::normal((string)$value);
    return $value;
}
$expected=$fixture['expected'];$index=[];foreach($expected as $r)$index[$r['upload_id'].'|'.$r['ewo']]=$r;
if(count($actual)!==count($expected))throw new RuntimeException('Row count differs: '.count($actual).' vs '.count($expected));
foreach($actual as $row){$key=$row['upload_id'].'|'.$row['ewo'];$ref=$index[$key]??null;if(!$ref)throw new RuntimeException('Unexpected result '.$key);
 foreach($row as $field=>$value){if(!array_key_exists($field,$ref)||canonical($value,$field)!==canonical($ref[$field],$field)){echo json_encode(['ewo'=>$row['ewo'],'field'=>$field,'actual'=>$value,'expected'=>$ref[$field]??null],JSON_PRETTY_PRINT),"\n";exit(1);}}
}
foreach([['9999999999999999.99999999','0.00000001','10000000000000000'],['1','999','1000'],['0.1','0.2','0.3'],['10','-9','1']] as [$a,$b,$expected])if(Decimal::add($a,$b)!==$expected)throw new RuntimeException('Decimal addition failed');
if(Decimal::ceil80('100.00000001')!=='81'||Decimal::ceil80('100')!=='80')throw new RuntimeException('Exact starter rounding failed');
echo 'PASS PostgreSQL fixture parity: '.$fixture['kind'].' '.count($actual).' rows, every returned field and nested evidence value; exact decimal arithmetic',PHP_EOL;
