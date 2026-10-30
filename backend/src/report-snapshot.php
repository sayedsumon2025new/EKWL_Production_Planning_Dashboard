<?php
declare(strict_types=1);
namespace Ekwl;
/** All pages see the same active report heads. Ordinary table permissions still apply. */
function reportSnapshotSpec(string $kind): array {
    $specs=[
        'fabric'=>['fabric_cutting_info','id,buyer,ewo,color_name,item_product_type,style_embellishment_type,pattern_update,color_order_qty,fabric_booking_qty,total_fabric_received,fabric_balance,fabric_stock_after_cut,cutable_qty,total_cut_qty,cutting_balance,cutting_percent,status,cutting_difficulties,pattern_received_date,replacement_receive_commitment_date',[['id',true]],[]],
        'sewing'=>['sewing_input_output','id,ewo,color,line,line_no,total_input_qty,total_output_qty,total_wip_qty,total_reject_qty',[['id',true]],[]],
        'production'=>['date_wise_production','id,code,buyer,ewo,po_no,color,line,line_no,output_date,total_qty',[['output_date',true],['id',true]],[]],
        'size'=>['size_set_rows','source_row_no,row_data,file_name,uploaded_at',[['source_row_no',true]],[['eq','is_active',true]]],
        'accessories'=>['accessories_rows','source_row_no,row_data,file_name,uploaded_at',[['source_row_no',true]],[['eq','is_active',true]]],
        'embellishment'=>['embellishment_send_receive_rows','*',[['source_row_no',true]],[['eq','is_active',true]]],
    ];
    if(!isset($specs[$kind]))throw new ApiError('Unknown report snapshot.');
    [$table,$fields,$orders,$filters]=$specs[$kind];
    return ['table'=>$table,'fields'=>$fields,'orders'=>$orders,'filters'=>$filters,'op'=>'select','limit'=>1000];
}
function reportSnapshotRead(array $u,array $b): void {
    $kind=(string)($b['kind']??'');$q=reportSnapshotSpec($kind);$pdo=db();
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');$pdo->beginTransaction();
    try {
        $q['offset']=0;$page=dataQuery($u,$q)['data']; // Authenticate/authorize before response output.
        header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
        if(function_exists('ob_gzhandler')&&!ini_get('zlib.output_compression')&&!headers_sent()&&str_contains($_SERVER['HTTP_ACCEPT_ENCODING']??'','gzip'))ob_start('ob_gzhandler',8192);
        echo '{"data":{"format":"report-rows-v1","kind":'.json_encode($kind,JSON_THROW_ON_ERROR).',"rows":[';
        $count=0;
        while(true){
            foreach($page as $row){if($count++)echo ',';echo json_encode($row,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);}
            if(count($page)<1000)break;
            $q['offset']+=1000;$page=dataQuery($u,$q)['data'];
        }
        $pdo->commit();
        echo '],"integrity":{"complete":true,"row_count":'.$count.'}},"error":null}';
    }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
