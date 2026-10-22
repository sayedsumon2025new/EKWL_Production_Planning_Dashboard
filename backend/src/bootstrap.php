<?php
declare(strict_types=1);
namespace Ekwl;
final class ApiError extends \RuntimeException {
    public int $status;
    public function __construct(string $message, int $status=400) { parent::__construct($message);$this->status=$status; }
}
function config(): array {
    static $c;
    if ($c===null) {
        $path=getenv('EKWL_CONFIG_FILE') ?: dirname(__DIR__).'/config/config.local.php';
        if (!is_file($path)) throw new ApiError('Staging backend is not configured.',503);
        $c=require $path;
        foreach (['dsn','db_user','db_password','origin','private_dir','base_path'] as $key)
            if (!isset($c[$key])) throw new ApiError('Backend configuration incomplete.',503);
        if (preg_match('/dbname=if0_43242550_ekwl_extra(?:;|$)/',$c['dsn']) && ($c['environment']??'')==='staging') throw new ApiError('Use a dedicated staging database; the existing Notes database is protected.',503);
        if (!str_starts_with($c['dsn'],'mysql:')) throw new ApiError('MySQL PDO driver required.',503);
    }
    return $c;
}
function db(): \PDO {
    static $pdo;
    if (!$pdo) {
        $c=config();
        $pdo=new \PDO($c['dsn'],$c['db_user'],$c['db_password'],[
            \PDO::ATTR_ERRMODE=>\PDO::ERRMODE_EXCEPTION,\PDO::ATTR_EMULATE_PREPARES=>false,
            \PDO::ATTR_DEFAULT_FETCH_MODE=>\PDO::FETCH_ASSOC,\PDO::ATTR_PERSISTENT=>false,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
        $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    }
    return $pdo;
}
function run(string $sql,array $args=[]): \PDOStatement { $s=db()->prepare($sql);$s->execute($args);return $s; }
function transaction(callable $fn) {
    if (db()->inTransaction()) return $fn();
    db()->beginTransaction();
    try { $value=$fn();db()->commit();return $value; } catch (\Throwable $e) { db()->rollBack();throw $e; }
}
function jsonOut($data,int $status=200): void {
    http_response_code($status);header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
    echo json_encode($data,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);
}
function body(): array {
    $c=config();$max=$c['max_body_bytes']??4194304;
    if ((int)($_SERVER['CONTENT_LENGTH']??0)>$max) throw new ApiError('Request too large; use smaller chunks.',413);
    if (!str_starts_with($_SERVER['CONTENT_TYPE']??'','application/json')) throw new ApiError('JSON content type required.',415);
    $raw=file_get_contents('php://input',false,null,0,$max+1);
    if ($raw===false||strlen($raw)>$max) throw new ApiError('Request too large.',413);
    try {$value=json_decode($raw,true,64,JSON_THROW_ON_ERROR);}catch(\JsonException $e){throw new ApiError('Invalid JSON.');}
    if (!is_array($value)) throw new ApiError('JSON object required.');
    return $value;
}
function uuid(): string {
    $h=bin2hex(random_bytes(16));return substr($h,0,8).'-'.substr($h,8,4).'-4'.substr($h,13,3).'-'.dechex((hexdec($h[16])&3)|8).substr($h,17,3).'-'.substr($h,20);
}
function audit(string $action,?string $target=null,array $meta=[]): void {
    run('INSERT INTO ekwl_audit_log (actor_id,action,target,metadata,created_at) VALUES (?,?,?,?,UTC_TIMESTAMP(6))',[
        $_SESSION['uid']??null,$action,$target,json_encode($meta,JSON_THROW_ON_ERROR)]);
}
function catalog(): array {static $c;return $c??=json_decode(file_get_contents(dirname(__DIR__).'/catalog.json'),true,64,JSON_THROW_ON_ERROR);}
function ident(string $name): string {return '`'.str_replace('`','``',$name).'`';}
