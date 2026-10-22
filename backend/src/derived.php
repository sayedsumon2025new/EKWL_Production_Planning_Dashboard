<?php
declare(strict_types=1);
namespace Ekwl;
function derivedRows(string $table,string $where='',array $args=[]): array {
    tableSpec($table);$limit=(int)(config()['derived_max_rows']??150000);$rows=[];
    $stmt=run('SELECT * FROM '.ident('ekwl_'.$table).($where?' WHERE '.$where:'').' LIMIT '.($limit+1),$args);
    while($row=$stmt->fetch()){$rows[]=hydrate($row,catalog()[$table]);if(count($rows)>$limit)throw new ApiError('Derived report exceeds the verified source-row budget. Narrow the planning scope.',413);}
    return $rows;
}
function derivedReportVisible(string $table): string {
    $kinds=['fabric_cutting_info'=>'fabric','sewing_input_output'=>'sewing','date_wise_production'=>'production'];$kind=$kinds[$table];$scope=$kind==='production'?"CAST(output_date AS CHAR)":"'all'";$head="kind='".$kind."' AND scope=".$scope;
    return "(report_batch_id IN (SELECT batch_id FROM ekwl_report_heads WHERE ".$head.") OR (report_batch_id IS NULL AND (NOT EXISTS(SELECT 1 FROM ekwl_report_heads WHERE ".$head.") OR EXISTS(SELECT 1 FROM ekwl_report_heads WHERE ".$head." AND batch_id='legacy'))))";
}
function normalizedEwoSQL(string $expression): string {
    // Expression is chosen by the server, never accepted from an API caller.
    $s='TRIM(COALESCE('.$expression.",''))";
    return "CASE WHEN ".$s." REGEXP '^[0-9]+([.]0+)?$' THEN COALESCE(NULLIF(TRIM(LEADING '0' FROM SUBSTRING_INDEX(".$s.",'.',1)),''),'0') ELSE ".$s.' END';
}
function loadDerivedSource(string $upload,string $kind): array {
    $uploads=derivedRows('plan_uploads',"id=? AND status='complete'",[$upload]);if(!$uploads)return ['plan_uploads'=>[],'plan_records'=>[]];
    $data=['plan_uploads'=>$uploads,'line_chassis_priority'=>derivedRows('line_chassis_priority'),
        'plan_records'=>derivedRows('plan_records',"upload_id=? AND criteria='Plan/Day' AND is_summary_row=0",[$upload])];
    $ewos=array_values(array_unique(array_map(fn($r)=>ReadinessEngine::ewo($r['ewo']??''),$data['plan_records'])));
    $data['plan_daily']=[];
    $cutoff=null;$data['date_wise_production']=[];
    if($kind==='coverage'){
        $visible=derivedReportVisible('date_wise_production');
        $cutoff=run('SELECT MAX(output_date) FROM ekwl_date_wise_production WHERE '.$visible)->fetchColumn();
        $data['date_wise_production']=$cutoff?derivedRows('date_wise_production',$visible.' AND output_date=?',[$cutoff]):[];
    }
    if($kind==='coverage'){
        if($cutoff){$date=new \DateTimeImmutable($cutoff);$data['plan_daily']=derivedRows('plan_daily','upload_id=? AND plan_date>=? AND plan_date<=?',[$upload,$date->modify('+1 day')->format('Y-m-d'),$date->modify('+3 days')->format('Y-m-d')]);}
    }else{
        // Readiness only needs each record's first positive day, not every historical daily cell.
        $q=run("SELECT d.* FROM ekwl_plan_daily d JOIN (SELECT record_id,MIN(plan_date) first_date FROM ekwl_plan_daily WHERE upload_id=? AND value>0 GROUP BY record_id) f ON f.record_id=d.record_id AND f.first_date=d.plan_date WHERE d.upload_id=? AND d.value>0",[$upload,$upload]);
        $limit=(int)(config()['derived_max_rows']??150000);while($r=$q->fetch()){$data['plan_daily'][]=$r;if(count($data['plan_daily'])>$limit)throw new ApiError('Planning evidence exceeds the verified row budget.',413);}
    }
    $columns=['fabric_cutting_info'=>'ewo','sewing_input_output'=>'ewo','embellishment_send_receive_rows'=>'EWO No','accessories_rows'=>'json','size_set_rows'=>'json'];
    foreach($columns as $table=>$column){
        $data[$table]=[];$expr=$column==='json'?"JSON_UNQUOTE(JSON_EXTRACT(row_data,'$.EWO'))":columnSpec($column,catalog()[$table]);$normalized=normalizedEwoSQL($expr);
        foreach(array_chunk($ewos,300) as $chunk){
            $where='('.$normalized.') IN ('.implode(',',array_fill(0,count($chunk),'?')).')';
            if(in_array($table,['fabric_cutting_info','sewing_input_output'],true))$where.=' AND '.derivedReportVisible($table);else $where.=' AND is_active=1';
            array_push($data[$table],...derivedRows($table,$where,$chunk));
            if(count($data[$table])>(config()['derived_max_rows']??150000))throw new ApiError('Evidence exceeds the verified source-row budget.',413);
        }
    }
    return $data;
}
function derivedQuery(array $u,array $q,string $kind): array {
    requirePermission($u,'slide_21');$upload=$kind==='coverage'?(string)($q['args']['p_upload_id']??''):'';
    if($kind==='board'&&count($q['filters']??[])!==1)throw new ApiError('Select one planning upload for readiness.');
    if($kind==='board')foreach($q['filters']??[] as $filter){
        if(count($filter)!==3||$filter[0]!=='eq'||$filter[1]!=='upload_id')throw new ApiError('Select one planning upload for readiness.');$upload=(string)$filter[2];
    }
    if(!$upload)throw new ApiError('Planning upload required.');$offset=(int)($q['offset']??0);$limit=(int)($q['limit']??1000);
    if($offset<0||$limit<1||$limit>1000)throw new ApiError('Invalid pagination.');
    return transaction(function()use($upload,$kind,$offset,$limit,$q){
        $data=loadDerivedSource($upload,$kind);$today=(new \DateTimeImmutable('now',new \DateTimeZone('Asia/Dhaka')))->format('Y-m-d');
        $prepared=ReadinessEngine::prepare($data,$upload,$today);
        $rows=$kind==='board'?ReadinessEngine::board($prepared):ReadinessEngine::coverage($prepared,$data['date_wise_production']??[]);
        foreach($q['orders']??[] as $order)if(($order[0]??'')!=='ewo'||($order[1]??true)!==true)throw new ApiError('Unsupported derived-report sort.');
        if(isset($q['fields'])&&$q['fields']!=='*'){
            $fields=explode(',',$q['fields']);$allowed=['upload_id','ewo','buyer','lines','pcd','psd','pfd','delivery','first_plan_date','first_day_plan_qty','starter_qty','fabric_status','cutting_status','print_status','embroidery_status','accessories_status','size_set_status','sewing_status','readiness_score','known_stages','applicable_stages','delivery_risk','risk_reason','sewing_started','input_qty','output_qty','plan_qty','color_details','accessories_uploaded_at','as_of_date'];
            foreach($fields as $f)if(!in_array($f,$allowed,true))throw new ApiError('Unsupported readiness field.');
            $rows=array_map(fn($r)=>array_intersect_key($r,array_flip($fields)),$rows);
        }
        return array_slice($rows,$offset,$limit);
    });
}
