<?php
declare(strict_types=1);
namespace Ekwl;
/** A single cursor sees consistent active report heads; ordinary permissions apply. */
function reportSnapshotUploadId(array $options): string {
    $id=$options['upload_id']??null;
    if(!is_string($id)||!preg_match('/^[a-f0-9-]{36}$/Di',$id))throw new ApiError('Select a completed planning upload.');
    return $id;
}
function reportSnapshotSpec(string $kind,array $options=[]): array {
    $specs=[
        'orderbank'=>['order_bank_latest_all','*',[['source_row_no',true]],[]],
        'fabric'=>['fabric_cutting_info','id,buyer,ewo,color_name,item_product_type,style_embellishment_type,pattern_update,color_order_qty,fabric_booking_qty,total_fabric_received,fabric_balance,fabric_stock_after_cut,cutable_qty,total_cut_qty,cutting_balance,cutting_percent,status,cutting_difficulties,pattern_received_date,replacement_receive_commitment_date',[['id',true]],[]],
        'sewing'=>['sewing_input_output','id,ewo,color,line,line_no,total_input_qty,total_output_qty,total_wip_qty,total_reject_qty',[['id',true]],[]],
        'production'=>['date_wise_production','id,code,buyer,ewo,po_no,color,line,line_no,output_date,total_qty',[['output_date',true],['id',true]],[]],
        'size'=>['size_set_rows','source_row_no,row_data,file_name,uploaded_at',[['source_row_no',true]],[['eq','is_active',true]]],
        'accessories'=>['accessories_rows','source_row_no,row_data,file_name,uploaded_at',[['source_row_no',true]],[['eq','is_active',true]]],
        'embellishment'=>['embellishment_send_receive_rows','*',[['source_row_no',true]],[['eq','is_active',true]]],
    ];
    if($kind==='planning-records')$specs[$kind]=['plan_records','id,source_row,unit,line_no,buyer,product_type,product,ewo,stroke,po,col,print,emb,outsource,order_qty,planned_qty,pcd,psd,pfd,strip_plan_qty,delivery,manpower,smv,average,criteria,total,is_summary_row',[['source_row',true],['id',true]],[['eq','upload_id',reportSnapshotUploadId($options)],['eq','is_summary_row',false],['in','criteria',['Plan/Day','SAH/Day','Clock Hour/Day','Effi/Day']]]];
    if(!isset($specs[$kind]))throw new ApiError('Unknown report snapshot.');
    [$table,$fields,$orders,$filters]=$specs[$kind];
    return ['table'=>$table,'fields'=>$fields,'orders'=>$orders,'filters'=>$filters,'op'=>'select','limit'=>1000];
}
function reportSnapshotRead(array $u,array $b): void {
    $kind=(string)($b['kind']??'');$upload=null;
    $derived=in_array($kind,['readiness','coverage'],true);
    if($kind==='planning-records'||$derived){
        requirePermission($u,$derived?'slide_21':'home');
        $id=reportSnapshotUploadId($b);
    }
    $q=$derived?null:reportSnapshotSpec($kind,$b);$pdo=db();
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');$pdo->beginTransaction();
    try {
        if(isset($id)){
            $upload=run("SELECT id,revision FROM ekwl_plan_uploads WHERE id=? AND status='complete'",[$id])->fetch();
            if(!$upload)throw new ApiError('Selected planning upload is unavailable.',409);
            if(isset($b['revision'])&&(string)$b['revision']!==(string)$upload['revision'])throw new ApiError('Selected planning revision changed. Refresh before loading this analysis.',409);
        }
        if($derived){
            $rows=derivedQuery($u,['filters'=>[['eq','upload_id',$id]],'args'=>['p_upload_id'=>$id],'orders'=>[['ewo',true]]],$kind==='readiness'?'board':'coverage',true);
            $pdo->commit();
            if(function_exists('ob_gzhandler')&&!ini_get('zlib.output_compression')&&!headers_sent()&&str_contains($_SERVER['HTTP_ACCEPT_ENCODING']??'','gzip'))ob_start('ob_gzhandler',8192);
            jsonOut(['data'=>['format'=>'report-rows-v1','kind'=>$kind,'rows'=>$rows,'integrity'=>['complete'=>true,'row_count'=>count($rows),'upload_id'=>$id,'revision'=>$upload['revision']]],'error'=>null]);return;
        }
        $pdo->setAttribute(\PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,false);
        $read=dataQuery($u,$q,true);$cursor=$read['cursor']; // Authorize before response output.
        header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
        if(function_exists('ob_gzhandler')&&!ini_get('zlib.output_compression')&&!headers_sent()&&str_contains($_SERVER['HTTP_ACCEPT_ENCODING']??'','gzip'))ob_start('ob_gzhandler',8192);
        echo '{"data":{"format":"report-rows-v1","kind":'.json_encode($kind,JSON_THROW_ON_ERROR).',"rows":[';
        $count=0;
        while($row=$cursor->fetch()){
            if($count++)echo ',';
            echo json_encode(hydrate($row,$read['catalog']),JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
        }
        $cursor->closeCursor();$pdo->setAttribute(\PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,true);
        $pdo->commit();
        $proof=['complete'=>true,'row_count'=>$count];
        if($upload)$proof+=['upload_id'=>$upload['id'],'revision'=>$upload['revision']];
        echo '],"integrity":'.json_encode($proof,JSON_THROW_ON_ERROR).'},"error":null}';
    }catch(\Throwable $e){
        if(isset($cursor))$cursor->closeCursor();
        $pdo->setAttribute(\PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,true);
        if($pdo->inTransaction())$pdo->rollBack();throw $e;
    }
}

/** Safe support detail: never return SQL, credentials, host names or source values. */
function reportReadDiagnostic(\Throwable $e): string {
    if(!($e instanceof \PDOException))return $e instanceof \JsonException?'Report source encoding could not be read. ':'';
    $code=(int)($e->errorInfo[1]??0);$state=(string)$e->getCode();
    if(!preg_match('/^[A-Z0-9]{5}$/D',$state))$state='unknown';
    $detail='';
    if($code===1054){
        $detail='Required report field is missing. ';
        if(preg_match("/Unknown column '([^']+)'/",$e->getMessage(),$m)){
            $field=explode('.',$m[1]);$field=end($field);
            try{
                foreach(catalog() as $table){
                    if(array_key_exists($field,$table['columns'])||in_array($field,$table['storage_names']??[],true)){$detail='Required report field is missing: '.$field.'. ';break;}
                }
            }catch(\Throwable $ignored){}
        }
    }elseif($code===1146)$detail='A required report table is missing. ';
    elseif(in_array($code,[1040,1203,1226],true))$detail='MySQL connection or hosting resource limit reached. ';
    elseif(in_array($code,[1205,1213],true))$detail='MySQL is busy; retry this read. ';
    elseif(in_array($code,[2002,2003,2006,2013],true))$detail='MySQL connection was interrupted. ';
    elseif($code===1142)$detail='The database account cannot read a required report table. ';
    return $detail.'Report SQL read failed (SQLSTATE '.$state.', MySQL '.$code.'). ';
}
