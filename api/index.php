<?php
declare(strict_types=1);
require dirname(__DIR__).'/backend/src/bootstrap.php';
require dirname(__DIR__).'/backend/src/auth.php';
require dirname(__DIR__).'/backend/src/query.php';
require dirname(__DIR__).'/backend/src/imports.php';
require dirname(__DIR__).'/backend/src/archive.php';
require dirname(__DIR__).'/backend/src/notes.php';
require dirname(__DIR__).'/backend/src/decimal.php';
require dirname(__DIR__).'/backend/src/readiness-engine.php';
require dirname(__DIR__).'/backend/src/derived.php';
use function Ekwl\{config,db,run,startSession,checkWrite,body,currentUser,requirePermission,jsonOut,authAction,dataQuery,rpc,adminUsers,reportImport,notesAction,archiveAction,archiveDownload,audit,uuid,rateLimit};
use Ekwl\ApiError;
ini_set('display_errors','0');
$requestId=bin2hex(random_bytes(8));header('X-Request-ID: '.$requestId);
try {
    startSession();$route=(string)($_GET['route']??'');$method=$_SERVER['REQUEST_METHOD'];
    if($route==='auth/session'&&$method==='GET'){jsonOut(['data'=>authAction('session',[]),'error'=>null]);exit;}
    if(str_starts_with($route,'auth/')){
        checkWrite();$result=authAction(substr($route,5),body());jsonOut(['data'=>$result,'error'=>null]);exit;
    }
    $u=currentUser();rateLimit('api|'.$u['auth_user_id'],600,60);
    if($route==='archive/download'&&$method==='GET'){
        archiveDownload($u,(string)($_GET['id']??''),(string)($_GET['file']??''));exit;
    }
    checkWrite();
    if($route==='files/upload'){
        if(config()['maintenance']??false)throw new ApiError('Application writes paused for migration.',503);
        Ekwl\requirePermission($u,'planning_upload');rateLimit('files|'.$u['auth_user_id'],20,3600);
        $f=$_FILES['file']??null;
        if(!$f||$f['error']!==UPLOAD_ERR_OK||$f['size']>4194304||strtolower(pathinfo($f['name'],PATHINFO_EXTENSION))!=='csv')throw new ApiError('CSV backup upload invalid or exceeds 4 MiB.');
        $id=uuid();$dir=config()['private_dir'].'/files';if(!is_dir($dir))mkdir($dir,0700,true);
        if(!move_uploaded_file($f['tmp_name'],$dir.'/'.$id.'.csv'))throw new ApiError('Backup storage unavailable.',503);
        run('INSERT INTO ekwl_files VALUES (?,?,?,?,UTC_TIMESTAMP())',[$id,$u['auth_user_id'],hash_file('sha256',$dir.'/'.$id.'.csv'),$f['size']]);audit('file.backup',$id);
        jsonOut(['data'=>['path'=>$id],'error'=>null]);exit;
    }
    $b=body();
    if((config()['maintenance']??false)&&!in_array($route,['query','archive','runtime','notes'],true)&&!($route==='rpc'&&($b['name']??'')==='get_ready_input_coverage'))throw new ApiError('Application writes paused for migration.',503);
    if($route==='query')$result=dataQuery($u,$b);
    elseif($route==='rpc')$result=rpc($u,$b);
    elseif($route==='users')$result=['data'=>adminUsers($u,$b)];
    elseif($route==='imports')$result=['data'=>reportImport($u,$b)];
    elseif($route==='notes'){
        if((config()['maintenance']??false)&&($b['action']??'list')!=='list')throw new ApiError('Writes paused.',503);
        $result=['data'=>notesAction($u,$b)];
    }
    elseif($route==='archive')$result=['data'=>archiveAction($u,$b)];
    elseif($route==='runtime'){
        requirePermission($u,'admin');
        $result=['data'=>['php'=>PHP_VERSION,'database'=>run('SELECT VERSION()')->fetchColumn(),'pdo_mysql'=>extension_loaded('pdo_mysql'),'limits'=>['memory_limit'=>ini_get('memory_limit'),'max_execution_time'=>ini_get('max_execution_time'),'post_max_size'=>ini_get('post_max_size'),'upload_max_filesize'=>ini_get('upload_max_filesize')],'environment'=>config()['environment']??'unverified','maintenance'=>config()['maintenance']??false]];
    }else throw new ApiError('Unknown API route.',404);
    $result['error']=null;jsonOut($result);
}catch(ApiError $e){jsonOut(['data'=>null,'error'=>['message'=>$e->getMessage(),'code'=>$e->status,'request_id'=>$requestId]],$e->status);}
catch(Throwable $e){
    // Request ID is safe to expose; SQL, paths and exception traces remain server side.
    error_log('EKWL API '.$requestId.' '.get_class($e));
    jsonOut(['data'=>null,'error'=>['message'=>'Operation failed. Contact the administrator with request ID '.$requestId,'code'=>500,'request_id'=>$requestId]],500);
}
