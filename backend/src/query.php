<?php
declare(strict_types=1);
namespace Ekwl;
function tableSpec(string $name): array {
    $alias=$name==='order_bank_latest_all'?'order_bank_raw':$name;
    $c=catalog();if(!isset($c[$alias]))throw new ApiError('Unsupported dataset.',404);
    return [$alias,$c[$alias]];
}
function columnSpec(string $name,array $c): string {
    if(!array_key_exists($name,$c['columns']))throw new ApiError('Unsupported field: '.$name);
    return ident($c['storage_names'][$name]??$name);
}
function projection(string $fields,array $c): array {
    if($fields==='*')return array_keys($c['columns']);
    // CSV syntax handles quoted source headers containing spaces/newlines.
    $keys=str_getcsv($fields,',','"','');
    foreach($keys as &$key){$key=trim($key,'"');columnSpec($key,$c);}unset($key);
    if(!$keys)throw new ApiError('Fields required.');return $keys;
}
function filterSQL(array $filters,array $c,array &$args): array {
    $where=[];if(count($filters)>30)throw new ApiError('Too many filters.');
    foreach($filters as $filter){
        if(!is_array($filter)||count($filter)!==3)throw new ApiError('Invalid filter.');
        [$op,$key,$value]=$filter;
        // The report popup filters the original CSV JSON by its exact EWO text.
        // Keep the JSON field/path fixed; arbitrary expressions remain forbidden.
        $col=$key==='row_data->>EWO' && isset($c['columns']['row_data'])
            ? "JSON_UNQUOTE(JSON_EXTRACT(".columnSpec('row_data',$c).", '$.EWO'))"
            : columnSpec((string)$key,$c);
        if($op==='in'){
            if(!is_array($value)||count($value)>500)throw new ApiError('Invalid value list.');
            $where[]=$value?$col.' IN ('.implode(',',array_fill(0,count($value),'?')).')':'1=0';
            foreach($value as $v){if(!is_scalar($v))throw new ApiError('Scalar value required.');$args[]=$v;}
        }elseif(in_array($op,['eq','gte','lte','gt','lt','ilike'],true)){
            if(!is_scalar($value)&&$value!==null)throw new ApiError('Scalar value required.');
            if($op==='eq'&&$value===null){$where[]=$col.' IS NULL';continue;}
            $operators=['eq'=>'=','gte'=>'>=','lte'=>'<=','gt'=>'>','lt'=>'<'];
            $where[]=$op==='ilike'?'LOWER('.$col.') LIKE LOWER(?)':$col.' '.$operators[$op].' ?';
            $args[]=is_bool($value)?(int)$value:$value;
        }else throw new ApiError('Unsupported filter operator.');
    }
    return $where;
}
function jsonColumns(): array{return ['row_data','source_data','config','permissions','source_columns'];}
function hydrate(array $row,array $c): array {
    foreach($c['storage_names']??[] as $source=>$stored)if(array_key_exists($stored,$row)){$row[$source]=$row[$stored];unset($row[$stored]);}
    foreach($row as $k=>&$v){
        if($v!==null&&in_array($k,jsonColumns(),true))$v=json_decode($v,true,64,JSON_THROW_ON_ERROR);
        elseif($v!==null&&str_starts_with($c['columns'][$k]??'','TINYINT'))$v=(bool)$v;
    }unset($v);return $row;
}
function normalizeValue(string $key,$value,array $c) {
    if($value===null)return null;
    $kind=$c['columns'][$key];
    if(in_array($key,jsonColumns(),true)){
        if(!is_array($value)&&!is_object($value))throw new ApiError('JSON value required for '.$key);
        return json_encode($value,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
    }
    if(!is_scalar($value))throw new ApiError('Scalar value required for '.$key);
    if(str_starts_with($kind,'DATETIME')){
        try{return (new \DateTimeImmutable((string)$value,new \DateTimeZone('UTC')))->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');}
        catch(\Exception $e){throw new ApiError('Invalid timestamp.');}
    }
    if($kind==='DATE'){
        $d=\DateTimeImmutable::createFromFormat('!Y-m-d',(string)$value);
        if(!$d||$d->format('Y-m-d')!==$value)throw new ApiError('Invalid ISO date for '.$key);
    }
    if(str_starts_with($kind,'DECIMAL')&&!preg_match('/^-?\d+(?:\.\d{1,8})?$/',(string)$value))throw new ApiError('Invalid decimal for '.$key);
    if(str_starts_with($kind,'BIGINT')&&!preg_match('/^-?\d+$/',(string)$value))throw new ApiError('Invalid integer for '.$key);
    if(str_starts_with($kind,'TINYINT'))return (int)(bool)$value;
    return $value;
}
function insertRows(string $name,array $rows,bool $upsert=false,?array $u=null): array {
    [$table,$c]=tableSpec($name);$out=[];
    foreach($rows as $row){
        if(!is_array($row)||!$row)throw new ApiError('Nonempty row objects required.');
        foreach($row as $key=>$value)columnSpec((string)$key,$c);
        if($u){
            if(isset($c['columns']['uploaded_by']))$row['uploaded_by']=$u['auth_user_id'];
            foreach(['uploaded_at','created_at'] as $key)if(isset($c['columns'][$key]))$row[$key]=gmdate('Y-m-d H:i:s');
            if(isset($c['columns']['is_active']))$row['is_active']=false;
            if($table==='plan_uploads'){
                $row['id']??=uuid();$row['status']='processing';$row['revision']=1;
                if((int)($row['row_count']??0)<1)throw new ApiError('Positive upload row count required.');
            }
            if(in_array($table,['plan_records','plan_daily'],true)){
                $parent=run('SELECT * FROM ekwl_plan_uploads WHERE id=? FOR UPDATE',[$row['upload_id']??''])->fetch();
                if(!$parent||$parent['status']!=='processing'||$parent['uploaded_by']!==$u['auth_user_id'])throw new ApiError('Upload is not an owned staging upload.',403);
                if($table==='plan_records'&&isset($row['id']))throw new ApiError('Record IDs are assigned by the server.');
            }
            if(isset($row['batch_id'])){
                $owner=run('SELECT uploaded_by FROM '.ident('ekwl_'.$table).' WHERE batch_id=? LIMIT 1',[$row['batch_id']])->fetchColumn();
                if($owner&&$owner!==$u['auth_user_id'])throw new ApiError('Batch belongs to another user.',403);
            }
        }
        if($u&&in_array($table,['plan_records','plan_daily','size_set_rows','accessories_rows','embellishment_send_receive_rows','order_bank_import_rows'],true)){
            $retryKeys=$table==='order_bank_import_rows'?$c['pk']:($table==='plan_daily'?['record_id','plan_date']:($c['unique'][0]??[]));
            $where=[];$values=[];
            foreach($retryKeys as $key){if(!array_key_exists($key,$row))throw new ApiError('Source identity required.');$where[]=columnSpec($key,$c).'=?';$values[]=$row[$key];}
            $existing=$where?run('SELECT * FROM '.ident('ekwl_'.$table).' WHERE '.implode(' AND ',$where).' FOR UPDATE',$values)->fetch():false;
            if($existing){
                $decoded=hydrate($existing,$c);
                foreach($row as $key=>$value){
                    if(in_array($key,['uploaded_at','created_at'],true))continue;
                    $expected=normalizeValue($key,$value,$c);$stored=$existing[$c['storage_names'][$key]??$key]??null;
                    if(in_array($key,jsonColumns(),true))$same=$value===($decoded[$key]??null);
                    elseif(str_starts_with($c['columns'][$key],'DECIMAL'))$same=decimalComparable((string)$expected)===decimalComparable((string)$stored);
                    elseif(str_starts_with($c['columns'][$key],'TINYINT'))$same=(bool)$value===(bool)$stored;
                    else $same=$expected===null?$stored===null:(string)$expected===(string)$stored;
                    if(!$same)throw new ApiError('Source-row retry differs from the staged row.',409);
                }
                $out[]=$decoded;continue;
            }
        }
        $keys=array_keys($row);$args=[];
        foreach($row as $key=>$value)$args[]=normalizeValue($key,$value,$c);
        $sql='INSERT INTO '.ident('ekwl_'.$table).' ('.implode(',',array_map(fn($key)=>columnSpec($key,$c),$keys)).') VALUES ('.implode(',',array_fill(0,count($keys),'?')).')';
        if($upsert)$sql.=' ON DUPLICATE KEY UPDATE '.implode(',',array_map(fn($key)=>columnSpec($key,$c).'=VALUES('.columnSpec($key,$c).')',$keys));
        run($sql,$args);
        if(isset($c['columns']['id'])&&!isset($row['id']))$row['id']=db()->lastInsertId();
        $out[]=$row;
    }
    return $out;
}
function dataQuery(array $u,array $q): array {
    $name=(string)($q['table']??'');
    if($name==='ewo_readiness_board'){
        if(($q['op']??'select')!=='select')throw new ApiError('Derived reports are read-only.',403);
        return ['data'=>derivedQuery($u,$q,'board')];
    }
    [$table,$c]=tableSpec($name);$op=$q['op']??'select';
    if($op==='select'){
        $allowed=false;foreach($c['read'] as $perm)if(can($u,$perm))$allowed=true;
        if(!$allowed)throw new ApiError('Dataset access denied.',403);
    }else {
        checkWrite();if(!$c['write'])throw new ApiError('Use the dedicated operation for this dataset.',403);
        requirePermission($u,$c['write']);
        if(in_array($table,['fabric_cutting_info','sewing_input_output','date_wise_production'],true))throw new ApiError('Use a staged report import.',403);
        if(config()['maintenance']??false)throw new ApiError('Writes paused for migration.',503);
    }
    $args=[];$where=filterSQL($q['filters']??[],$c,$args);
    $reportKinds=['fabric_cutting_info'=>'fabric','sewing_input_output'=>'sewing','date_wise_production'=>'production'];
    if(isset($reportKinds[$table])&&$op==='select'){
        $kind=$reportKinds[$table];$scope=$kind==='production'?"CAST(output_date AS CHAR)":"'all'";
        $head="kind='".$kind."' AND scope=".$scope;
        $where[]="(report_batch_id IN (SELECT batch_id FROM ekwl_report_heads WHERE ".$head.") OR (report_batch_id IS NULL AND (NOT EXISTS(SELECT 1 FROM ekwl_report_heads WHERE ".$head.") OR EXISTS(SELECT 1 FROM ekwl_report_heads WHERE ".$head." AND batch_id='legacy'))))";
    }
    if($table==='site_users'&&$u['role']!=='admin'){$where[]='auth_user_id=?';$args[]=$u['auth_user_id'];}
    if(in_array($table,['plan_records','plan_daily'],true)&&$op==='select')$where[]='upload_id IN (SELECT id FROM ekwl_plan_uploads WHERE status=\'complete\')';
    if($table==='plan_uploads'&&$op==='select'){$where[]="(status='complete' OR uploaded_by=?)";$args[]=$u['auth_user_id'];}
    if(in_array($table,['size_set_rows','accessories_rows','embellishment_send_receive_rows'],true)){$where[]='(is_active=1 OR uploaded_by=?)';$args[]=$u['auth_user_id'];}
    if($table==='order_bank_import_rows'){$where[]='uploaded_by=?';$args[]=$u['auth_user_id'];}
    if($name==='order_bank_latest_all')$where[]="upload_batch_id=(SELECT id FROM ekwl_order_bank_upload_batches WHERE status='SUCCESS' ORDER BY uploaded_at DESC,id DESC LIMIT 1)";
    $condition=$where?' WHERE '.implode(' AND ',$where):'';
    if($op==='select'){
        $keys=projection($q['fields']??'*',$c);$extra='';
        if($name==='order_bank_latest_all')$extra=',(SELECT source_columns FROM ekwl_order_bank_upload_batches WHERE id=upload_batch_id) AS source_columns';
        $orders=[];
        foreach($q['orders']??[] as $order){$orders[]=columnSpec((string)$order[0],$c).(($order[1]??true)?' ASC':' DESC');}
        if(count($orders)>5)throw new ApiError('Too many sort fields.');
        // Always use deterministic paging; explicit sorts get primary-key tie breakers.
        foreach($c['pk'] as $pk)$orders[]=ident($pk).' ASC';
        $offset=(int)($q['offset']??0);$limit=(int)($q['limit']??1000);
        if($offset<0||$limit<1||$limit>1000||$offset>5000000)throw new ApiError('Invalid pagination.');
        $rows=run('SELECT '.implode(',',array_map(fn($key)=>columnSpec($key,$c).' AS '.ident($key),$keys)).$extra.' FROM '.ident('ekwl_'.$table).$condition.' ORDER BY '.implode(',',$orders).' LIMIT '.$limit.' OFFSET '.$offset,$args)->fetchAll();
        $rows=array_map(fn($r)=>hydrate($r,$c),$rows);
        if(!empty($q['single'])){
            if(count($rows)>1||($q['single']==='required'&&!$rows))throw new ApiError('Expected one row.',409);
            return ['data'=>$rows[0]??null];
        }
        return ['data'=>$rows];
    }
    return transaction(function()use($op,$q,$table,$c,$condition,$args,$u,$where){
        if(in_array($op,['insert','upsert'],true)){
            $rows=$q['rows']??[];if(!is_array($rows)||!array_is_list($rows)||!$rows||count($rows)>(config()['max_chunk_rows']??800))throw new ApiError('Invalid upload chunk.');
            if($op==='upsert'&&!in_array($table,['abp_target','dashboard_master_settings','efficiency_run_day_ladder'],true))throw new ApiError('Upsert not supported here.');
            $result=insertRows($table,$rows,$op==='upsert',$u);
            audit('data.'.$op,$table,['rows'=>count($rows)]);
            $keys=projection($q['fields']??'*',$c);
            $result=array_map(fn($r)=>array_intersect_key($r,array_flip($keys)),$result);
            return ['data'=>!empty($q['single'])?($result[0]??null):$result];
        }
        if(!$where||empty($q['filters']))throw new ApiError('Explicit filters required for writes.');
        if($op==='update'&&$table==='plan_uploads'){
            $ids=run('SELECT id,uploaded_by,status FROM ekwl_plan_uploads'.$condition.' FOR UPDATE',$args)->fetchAll();
            if(count($ids)!==1||$ids[0]['uploaded_by']!==$u['auth_user_id']||$ids[0]['status']!=='processing')throw new ApiError('Owned staging upload required.',403);
            if(($q['values']??[])!==['status'=>'complete'])throw new ApiError('Only validated upload completion is allowed.');
            finalizePlan($ids[0]['id'],$u);return ['data'=>[]];
        }
        if($op==='delete'&&in_array($table,['order_bank_import_rows','efficiency_run_day_ladder'],true)){
            $s=run('DELETE FROM '.ident('ekwl_'.$table).$condition,$args);audit('data.delete',$table,['rows'=>$s->rowCount()]);return ['data'=>[]];
        }
        throw new ApiError('Unsupported write operation.',403);
    });
}

function decimalComparable(string $v): string {
    $v=str_contains($v,'.')?rtrim(rtrim($v,'0'),'.'):$v;
    return $v==='-0'?'0':$v;
}
