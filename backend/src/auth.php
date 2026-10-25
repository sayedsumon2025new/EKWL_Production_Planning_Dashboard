<?php
declare(strict_types=1);
namespace Ekwl;
function startSession(): void {
    $c=config();$dir=$c['private_dir'].'/sessions';
    if (!is_dir($dir)&&!mkdir($dir,0700,true)&&!is_dir($dir)) throw new ApiError('Session storage unavailable.',503);
    ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');
    $sessionName=$c['session_name']??'EKWL_MYSQL_SESSION';
    if(!is_string($sessionName)||!preg_match('/^[A-Za-z][A-Za-z0-9_]{0,63}$/D',$sessionName))throw new ApiError('Session configuration invalid.',503);
    session_save_path($dir);session_name($sessionName);
    session_set_cookie_params(['lifetime'=>0,'path'=>$c['base_path'],'secure'=>$c['secure_cookies']??true,'httponly'=>true,'samesite'=>'Strict']);
    session_start();
    $_SESSION['csrf']??=bin2hex(random_bytes(32));
}
function checkWrite(): void {
    if ($_SERVER['REQUEST_METHOD']!=='POST') throw new ApiError('POST required.',405);
    if (($_SERVER['HTTP_ORIGIN']??'')!==config()['origin']) throw new ApiError('Origin rejected.',403);
    if (!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) throw new ApiError('Session verification failed. Refresh and retry.',403);
}
function profile(string $uid): ?array {
    $u=run('SELECT s.*,u.auth_version FROM ekwl_site_users s JOIN ekwl_users u ON u.id=s.auth_user_id WHERE u.id=?',[$uid])->fetch();
    if (!$u)return null;
    $u['role']=strtolower(trim($u['role']));$u['status']=strtolower(trim($u['status']));
    $u['permissions']=json_decode($u['permissions']?:'{}',true,32,JSON_THROW_ON_ERROR);
    return $u;
}
function currentUser(): array {
    $uid=$_SESSION['uid']??null;
    if (!$uid) throw new ApiError('Sign in required.',401);
    $c=config();$now=time();
    if ($now-($_SESSION['last_seen']??0)>($c['session_idle_seconds']??1800)||$now-($_SESSION['signed_at']??0)>($c['session_absolute_seconds']??28800)) {
        $_SESSION=[];throw new ApiError('Session expired.',401);
    }
    $u=profile($uid);
    if (!$u||$u['status']!=='active'||(int)$u['auth_version']!==($_SESSION['version']??null)) {
        $_SESSION=[];throw new ApiError('Session no longer authorized.',401);
    }
    $_SESSION['last_seen']=$now;
    return $u;
}
function can(array $u,string $permission): bool {
    return $u['status']==='active'&&($u['role']==='admin'||in_array($permission,['home','self'],true)||in_array($u['permissions'][$permission]??false,[true,'true'],true));
}
function requirePermission(array $u,string $permission): void {
    if (!can($u,$permission)||($permission==='admin'&&$u['role']!=='admin'))throw new ApiError('Permission denied.',403);
}
function rateLimit(string $key,int $max=10,int $seconds=900): void {
    $bucket=hash('sha256',$key.'|'.(int)(time()/$seconds));
    transaction(function()use($bucket,$max,$seconds){
        run('INSERT INTO ekwl_rate_limits VALUES (?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND)) ON DUPLICATE KEY UPDATE hits=hits+1',[$bucket,$seconds]);
        $hits=(int)run('SELECT hits FROM ekwl_rate_limits WHERE bucket=? FOR UPDATE',[$bucket])->fetchColumn();
        if ($hits>$max)throw new ApiError('Too many attempts. Try again later.',429);
    });
}
function publicSession(array $u): array {
    return ['user'=>['id'=>$u['auth_user_id'],'email'=>$u['email']],'access_token'=>'cookie-session'];
}
function passwordRules(string $password): void {
    if (strlen($password)<12||strlen($password)>72||str_contains($password,"\0"))throw new ApiError('Use a password of 12–72 bytes without null characters.');
}
function authAction(string $action,array $b): array {
    if ($action==='session') {
        $session=null;
        if (!empty($_SESSION['recovery'])) {
            $t=run('SELECT user_id FROM ekwl_password_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP()',[$_SESSION['recovery']])->fetchColumn();
            if ($t&&($p=profile($t))&&$p['status']==='active')$session=publicSession($p);
        }elseif (!empty($_SESSION['uid'])) {
            try{$session=publicSession(currentUser());}catch(ApiError $e){if($e->status!==401)throw $e;}
        }
        $_SESSION['csrf']??=bin2hex(random_bytes(32));
        return ['session'=>$session,'csrf'=>$_SESSION['csrf']];
    }
    checkWrite();
    if ($action==='login') {
        $email=strtolower(trim((string)($b['email']??'')));$password=(string)($b['password']??'');
        rateLimit('login-ip|'.($_SERVER['REMOTE_ADDR']??''),50);
        rateLimit('login-email|'.$email,10);
        $row=run('SELECT u.* FROM ekwl_users u JOIN ekwl_site_users s ON s.auth_user_id=u.id WHERE LOWER(s.email)=?',[$email])->fetch();
        // Always evaluate a real password hash, including for missing accounts.
        $hash=$row['password_hash']??'$2y$12$C6UzMDM.H6dfI/f/IKcEe.Wo5nF6fQfLxm7r1z7HjqgDN1Ea7BG.u';
        $valid=strlen($password)<=72&&!str_contains($password,"\0")&&password_verify($password,$hash);$p=$row?profile($row['id']):null;
        if (!$valid||!$p||$p['status']!=='active')throw new ApiError('Invalid email or password.',401);
        session_regenerate_id(true);$_SESSION=['uid'=>$row['id'],'version'=>(int)$row['auth_version'],'signed_at'=>time(),'last_seen'=>time(),'csrf'=>bin2hex(random_bytes(32))];
        audit('auth.login',$row['id']);return ['session'=>publicSession($p),'csrf'=>$_SESSION['csrf']];
    }
    if ($action==='logout') {
        if (!empty($_SESSION['uid']))audit('auth.logout',$_SESSION['uid']);
        $_SESSION=[];session_regenerate_id(true);$_SESSION['csrf']=bin2hex(random_bytes(32));
        return ['session'=>null,'csrf'=>$_SESSION['csrf']];
    }
    if ($action==='reset-request') {
        rateLimit('reset-ip|'.($_SERVER['REMOTE_ADDR']??''),5);
        $email=strtolower(trim((string)($b['email']??'')));
        if (filter_var($email,FILTER_VALIDATE_EMAIL))run('INSERT INTO ekwl_reset_requests (email,created_at) VALUES (?,UTC_TIMESTAMP())',[$email]);
        return ['message'=>'If this account exists, an administrator can issue a secure reset link. Contact your administrator.'];
    }
    if ($action==='recovery') {
        rateLimit('recover-ip|'.($_SERVER['REMOTE_ADDR']??''),20);
        $hash=hash('sha256',(string)($b['token']??''));
        $uid=run('SELECT user_id FROM ekwl_password_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP()',[$hash])->fetchColumn();
        if (!$uid||!($p=profile($uid))||$p['status']!=='active')throw new ApiError('Reset link is invalid or expired.',401);
        session_regenerate_id(true);$_SESSION=['recovery'=>$hash,'csrf'=>bin2hex(random_bytes(32))];
        return ['session'=>publicSession($p),'csrf'=>$_SESSION['csrf']];
    }
    if ($action==='password') {
        rateLimit('password|'.($_SERVER['REMOTE_ADDR']??'').'|'.($_SESSION['uid']??$_SESSION['recovery']??''),10);
        $password=(string)($b['password']??'');passwordRules($password);
        transaction(function()use($password,$b){
            if (!empty($_SESSION['recovery'])) {
                $t=run('SELECT * FROM ekwl_password_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR UPDATE',[$_SESSION['recovery']])->fetch();
                if (!$t)throw new ApiError('Reset link expired.',401);
                $uid=$t['user_id'];$p=profile($uid);
                if (!$p||$p['status']!=='active')throw new ApiError('Account unavailable.',401);
            }else {
                $u=currentUser();$uid=$u['auth_user_id'];
                $hash=run('SELECT password_hash FROM ekwl_users WHERE id=?',[$uid])->fetchColumn();
                if (!password_verify((string)($b['current_password']??''),$hash?:''))throw new ApiError('Current password is incorrect.',403);
            }
            run('UPDATE ekwl_users SET password_hash=?,auth_version=auth_version+1 WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),$uid]);
            run('UPDATE ekwl_password_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND used_at IS NULL',[$uid]);
            audit('auth.password_changed',$uid);
        });
        $_SESSION=[];session_regenerate_id(true);$_SESSION['csrf']=bin2hex(random_bytes(32));
        return ['success'=>true,'csrf'=>$_SESSION['csrf']];
    }
    throw new ApiError('Unknown auth operation.',404);
}
function adminUsers(array $u,array $b): array {
    requirePermission($u,'admin');checkWrite();rateLimit('users|'.$u['auth_user_id'],100,60);
    return transaction(function()use($u,$b){
        run("SELECT name FROM ekwl_locks WHERE name='users' FOR UPDATE");
        $action=$b['action']??'';
        if ($action==='requests')return ['requests'=>run('SELECT * FROM ekwl_reset_requests WHERE resolved_at IS NULL ORDER BY id LIMIT 100')->fetchAll()];
        if ($action==='create') {
            $email=strtolower(trim((string)($b['email']??'')));
            if (!filter_var($email,FILTER_VALIDATE_EMAIL))throw new ApiError('Valid email required.');
            $password=(string)($b['password']??'');passwordRules($password);$uid=uuid();
            $role=$b['role']??'user';$status=$b['status']??'active';
            if(!in_array($role,['admin','user'],true)||!in_array($status,['active','disabled'],true))throw new ApiError('Invalid role or status.');
            run('INSERT INTO ekwl_site_users (auth_user_id,email,role,status,permissions,created_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP(6))',[$uid,$email,$role,$status,permissionsJSON($b['permissions']??[])]);
            run('INSERT INTO ekwl_users (id,password_hash,created_at) VALUES (?,?,UTC_TIMESTAMP(6))',[$uid,password_hash($password,PASSWORD_DEFAULT)]);
            audit('user.create',$uid);return ['success'=>true,'auth_user_id'=>$uid];
        }
        $p=run('SELECT * FROM ekwl_site_users WHERE id=? FOR UPDATE',[$b['site_user_id']??0])->fetch();
        if (!$p)throw new ApiError('User not found.',404);
        if (in_array($action,['delete','update'],true)&&$p['auth_user_id']===$u['auth_user_id'])throw new ApiError('Use another administrator to change your own access.',409);
        if ($action==='reset-link') {
            $token=bin2hex(random_bytes(32));
            run('UPDATE ekwl_password_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND used_at IS NULL',[$p['auth_user_id']]);
            run('INSERT INTO ekwl_password_tokens VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE),NULL)',[hash('sha256',$token),$p['auth_user_id']]);
            run('UPDATE ekwl_reset_requests SET resolved_at=UTC_TIMESTAMP() WHERE LOWER(email)=LOWER(?)',[$p['email']]);
            audit('user.reset_link',$p['auth_user_id']);
            return ['success'=>true,'url'=>config()['origin'].config()['base_path'].'index.html?type=recovery&token='.rawurlencode($token),'expires_minutes'=>30];
        }
        if ($action==='delete') {
            // Preserve ownership/audit history: revoke login instead of destroying referenced identity.
            run("UPDATE ekwl_site_users SET status='disabled' WHERE id=?",[$p['id']]);
            run('UPDATE ekwl_users SET password_hash=NULL,auth_version=auth_version+1 WHERE id=?',[$p['auth_user_id']]);
            audit('user.deactivate',$p['auth_user_id']);return ['success'=>true];
        }
        if ($action!=='update')throw new ApiError('Unknown user operation.');
        $role=$b['role']??'';$status=$b['status']??'';
        if (!in_array($role,['admin','user'],true)||!in_array($status,['active','disabled'],true))throw new ApiError('Invalid role or status.');
        run('UPDATE ekwl_site_users SET role=?,status=?,permissions=? WHERE id=?',[$role,$status,permissionsJSON($b['permissions']??[]),$p['id']]);
        run('UPDATE ekwl_users SET auth_version=auth_version+1 WHERE id=?',[$p['auth_user_id']]);
        audit('user.update',$p['auth_user_id']);return ['success'=>true];
    });
}
function permissionsJSON($permissions): string {
    if (!is_array($permissions))throw new ApiError('Permission object required.');
    $out=[];
    foreach($permissions as $k=>$v) {
        if (!preg_match('/^(slide_(?:[0-9]|1[0-9]|2[01])|planning_upload|fabric|sewing|production|embellishment_upload|user_admin|admin_settings)$/',(string)$k)||!is_bool($v))throw new ApiError('Invalid permission.');
        $out[$k]=$v;
    }
    return json_encode((object)$out,JSON_THROW_ON_ERROR);
}
