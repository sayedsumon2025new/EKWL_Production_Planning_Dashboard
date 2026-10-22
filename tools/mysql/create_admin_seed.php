<?php
/** Offline bootstrap SQL generator for phpMyAdmin on a NEW staging DB. No DB connection. */
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
$email=strtolower(trim($argv[1]??''));if(!filter_var($email,FILTER_VALIDATE_EMAIL))throw new RuntimeException('Usage: php create_admin_seed.php admin@example.com [existing-auth-uuid]; password from stdin.');
$password=rtrim(stream_get_contents(STDIN),"\r\n");if(strlen($password)<12||strlen($password)>72||str_contains($password,"\0"))throw new RuntimeException('Password must contain 12–72 bytes without null characters.');
$existing=$argv[2]??null;if($existing&&!preg_match('/^[a-f0-9-]{36}$/i',$existing))throw new RuntimeException('Invalid existing Auth UUID.');
$raw=bin2hex(random_bytes(16));$uid=$existing??(substr($raw,0,8).'-'.substr($raw,8,4).'-4'.substr($raw,13,3).'-a'.substr($raw,17,3).'-'.substr($raw,20));
$q=fn($s)=>"'".str_replace("'","''",$s)."'";$hash=password_hash($password,PASSWORD_DEFAULT);
echo "-- PRIVATE: run only in a newly created staging DB, never in if0_43242550_ekwl_extra.\nSTART TRANSACTION;\n";
$guard="DATABASE()<>'if0_43242550_ekwl_extra' AND NOT EXISTS(SELECT 1 FROM ekwl_users u JOIN ekwl_site_users s ON s.auth_user_id=u.id WHERE LOWER(s.role)='admin' AND LOWER(s.status)='active' AND u.password_hash IS NOT NULL)";
if(!$existing)echo "INSERT INTO ekwl_site_users(auth_user_id,email,role,status,permissions,created_at) SELECT ".$q($uid).','.$q($email).",'admin','active','{}',UTC_TIMESTAMP(6) WHERE ".$guard.";\n";
// Only a verified Admin profile is eligible. Existing user accounts are never elevated.
echo "INSERT INTO ekwl_users(id,password_hash,auth_version,created_at) SELECT s.auth_user_id,".$q($hash).",1,UTC_TIMESTAMP(6) FROM ekwl_site_users s WHERE s.auth_user_id=".$q($uid).' AND LOWER(s.email)='.$q($email)." AND LOWER(s.role)='admin' AND LOWER(s.status)='active' AND ".$guard." ON DUPLICATE KEY UPDATE password_hash=IF(password_hash IS NULL,VALUES(password_hash),password_hash),auth_version=auth_version+1;\nCOMMIT;\n";
