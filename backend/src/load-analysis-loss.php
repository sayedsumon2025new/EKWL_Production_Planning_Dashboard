<?php
declare(strict_types=1);
namespace Ekwl;
/** Account/plan scoped corrections; stored outside the public code-only release. */
function lossCorrectionKey($key): string {
    if(!is_string($key)||strlen($key)>400)throw new ApiError('Invalid loss record.');
    try{$parts=json_decode($key,true,8,JSON_THROW_ON_ERROR);}catch(\Throwable $e){throw new ApiError('Invalid loss record.');}
    if(!is_array($parts)||count($parts)!==3||!is_string($parts[0])||!is_int($parts[1])||!is_string($parts[2]))throw new ApiError('Invalid loss record.');
    [$date,$line,$ewo]=$parts;$d=\DateTimeImmutable::createFromFormat('!Y-m-d',$date);
    if(!$d||$d->format('Y-m-d')!==$date||$line<1||$line>48||$line===46||!strlen(trim($ewo))||strlen($ewo)>120)throw new ApiError('Invalid loss record.');
    return json_encode([$date,$line,strtoupper(trim($ewo))],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
}
function lossCorrectionStore(string $root,string $owner,string $upload,array $body): array {
    $action=$body['action']??'list';
    if(!in_array($action,['list','save','reset'],true))throw new ApiError('Unknown loss correction operation.');
    $key='';$record=[];
    if($action==='save'){
        $key=lossCorrectionKey($body['key']??null);$reason=$body['reason']??null;$note=$body['note']??null;
        if(!is_string($reason)||!in_array($reason,['sample','accessories','gsm','fabric','wash','unknown'],true)||!is_string($note)||!strlen(trim($note))||strlen($note)>3000)throw new ApiError('Choose a valid reason and supply correction remarks (maximum 3000 bytes).');
        $record=['reason'=>$reason,'note'=>trim($note),'updated_at'=>gmdate('c')];
    }
    $dir=$root.'/load-analysis-loss';
    if(!is_dir($dir)&&!mkdir($dir,0700,true)&&!is_dir($dir))throw new ApiError('Correction storage unavailable.',503);
    $path=$dir.'/'.hash('sha256',$owner.'|'.$upload).'.json';
    $f=fopen($path.'.lock','c+');if(!$f)throw new ApiError('Correction storage unavailable.',503);
    try{
        if(!flock($f,LOCK_EX))throw new ApiError('Correction storage busy.',503);
        $text=is_file($path)?file_get_contents($path):'';$data=[];
        if($text===false)throw new ApiError('Saved corrections could not be read.',503);
        if($text!==false&&$text!==''){
            try{$data=json_decode($text,true,16,JSON_THROW_ON_ERROR);}catch(\Throwable $e){throw new ApiError('Saved corrections could not be read.',503);}
            if(!is_array($data))throw new ApiError('Saved corrections could not be read.',503);
        }
        if($action==='save'){$data[$key]=$record;if(count($data)>2000)throw new ApiError('Correction limit reached.');}
        elseif($action==='reset')$data=[];
        if($action!=='list'){
            $json=json_encode($data,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
            $tmp=tempnam($dir,'loss-');if($tmp===false)throw new ApiError('Correction save failed.',503);
            try{if(file_put_contents($tmp,$json)!==strlen($json)||!rename($tmp,$path))throw new ApiError('Correction save failed.',503);}finally{if(is_file($tmp))unlink($tmp);}
        }
        return ['overrides'=>(object)$data];
    }finally{flock($f,LOCK_UN);fclose($f);}
}
function loadAnalysisLossAction(array $user,array $body): array {
    requirePermission($user,'slide_20');
    $upload=$body['upload_id']??'';
    if(!is_string($upload)||!preg_match('/^[a-f0-9-]{36}$/i',$upload))throw new ApiError('Invalid planning upload.');
    if(!run("SELECT id FROM plan_uploads WHERE id=? AND status='complete'",[$upload])->fetchColumn())throw new ApiError('Completed planning upload required.',404);
    $action=$body['action']??'list';
    if((config()['maintenance']??false)&&$action!=='list')throw new ApiError('Writes paused.',503);
    $result=lossCorrectionStore(config()['private_dir'],(string)$user['auth_user_id'],$upload,$body);
    if($action!=='list')audit('load-analysis-loss.'.$action,$upload);
    return $result;
}
