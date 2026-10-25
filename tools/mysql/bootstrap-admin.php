<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/backend/src/bootstrap.php';require dirname(__DIR__,2).'/backend/src/auth.php';
use function Ekwl\{config,run,transaction,uuid,passwordRules};
if(PHP_SAPI!=='cli'||(config()['environment']??'')!=='staging')exit(1);
$email=strtolower(trim($argv[1]??''));if(!filter_var($email,FILTER_VALIDATE_EMAIL))throw new RuntimeException('Usage: php bootstrap-admin.php email; password is read from stdin.');
$password=rtrim(stream_get_contents(STDIN),"\r\n");passwordRules($password);
transaction(function()use($email,$password){
    $existing=(int)run("SELECT COUNT(*) FROM ekwl_site_users WHERE role='admin' AND status='active'")->fetchColumn();
    if($existing)throw new RuntimeException('An active admin already exists; use authenticated user administration.');
    $uid=uuid();run("INSERT INTO ekwl_site_users (auth_user_id,email,role,status,permissions,created_at) VALUES (?,?,'admin','active','{}',UTC_TIMESTAMP(6))",[$uid,$email]);
    run('INSERT INTO ekwl_users (id,password_hash,created_at) VALUES (?,?,UTC_TIMESTAMP(6))',[$uid,password_hash($password,PASSWORD_DEFAULT)]);
});echo "Staging administrator created.\n";
