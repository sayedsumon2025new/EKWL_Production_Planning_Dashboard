<?php
// Local PHP built-in server only; production uses Apache .htaccess protection.
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if(preg_match('#^/(?:backend|database|tools|docs|\.git)(?:/|$)#',$path)||str_contains($path,'..')){
 http_response_code(404);echo 'Not found';return true;
}
return false;
