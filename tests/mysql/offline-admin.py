"""Offline local browser -> private SQL -> local MySQL -> PHP auth. No real secrets."""
import http.server,json,os,secrets,subprocess,tempfile,threading,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];API='ekwl-migration-api'
def php(code,payload=None,config=None):
 cmd=['docker','exec','-i']
 if config:cmd+=['-e','EKWL_CONFIG_FILE='+config]
 r=subprocess.run(cmd+[API,'php','-r',code],input=json.dumps(payload or {}),text=True,capture_output=True)
 if r.returncode:raise RuntimeError((r.stdout+r.stderr)[-1800:])
 return r.stdout
counter=0
def fixture():
 global counter
 counter+=1;name='ekwl_admin_form_'+secrets.token_hex(4);config='/app/backend/config/admin-form-'+str(counter)+'.local.php'
 php("require '/app/backend/src/bootstrap.php';if(!str_contains(Ekwl\\config()['dsn'],'host=ekwl-migration-db;'))exit(1);Ekwl\\db()->exec('CREATE DATABASE "+name+" CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');$c=Ekwl\\config();$c['dsn']=preg_replace('/dbname=[^;]+/','dbname="+name+"',$c['dsn']);file_put_contents('"+config+"','<?php return '.var_export($c,true).';');")
 subprocess.run(['docker','exec','-e','EKWL_CONFIG_FILE='+config,API,'php','tools/mysql/migrate.php'],check=True,capture_output=True)
 return name,config
apply=r"""require '/app/backend/src/bootstrap.php';$in=json_decode(stream_get_contents(STDIN),true);$sql=$in['sql'];
$target='USE `if0_43242550_ekwl_stage`;';if(substr_count($sql,$target)!==1)exit(1);
$sql=str_replace($target,'USE `'.$in['database'].'`;',$sql);$sql=preg_replace('/^--[^\n]*$/m','',$sql);$last=[];
foreach(explode(';',$sql) as $s)if(trim($s)){$q=Ekwl\db()->query($s);if($q->columnCount())$last=$q->fetchAll();$q->closeCursor();}
echo json_encode($last);
"""
class LocalForm(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  body=(ROOT/'downloads/create-staging-admin-offline.html').read_bytes()
  self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(body)
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),LocalForm)
threading.Thread(target=server.serve_forever,daemon=True).start();local='http://127.0.0.1:'+str(server.server_port)+'/'
with tempfile.TemporaryDirectory(prefix='ekwl-private-admin-test-') as folder,sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(accept_downloads=True);remote=[];errors=[]
 page.on('request',lambda req:remote.append(req.url) if not req.url.startswith(local) else None)
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.goto(local)
 assert page.title().startswith('EKWL') and not page.locator('#generate').is_disabled()
 address="o'hara-"+secrets.token_hex(4)+'@fixture.invalid';password="Fixture-'"+secrets.token_hex(14)
 page.locator('#email').fill(address);page.locator('#password').fill('x'*73);page.locator('#confirm').fill('x'*73);page.locator('#generate').click()
 assert '১২ byte' in page.locator('#status').inner_text()
 page.locator('#password').fill(password);page.locator('#confirm').fill(password+'mismatch');page.locator('#generate').click()
 assert 'মিলছে না' in page.locator('#status').inner_text()
 def generate(address,secret):
  page.locator('#email').fill(address);page.locator('#password').fill(secret);page.locator('#confirm').fill(secret)
  with page.expect_download(timeout=45000) as info:page.locator('#generate').click()
  out=Path(folder)/('private-'+secrets.token_hex(4)+'.sql');info.value.save_as(out);out.chmod(0o600)
  text=out.read_text();assert secret not in text
  assert page.locator('#password').input_value()=='' and page.locator('#confirm').input_value()==''
  return text
 sql=generate(address,password)
 assert not remote and not errors,(remote,errors)
 # CSP must block networking even if a later script tries to send input remotely.
 assert page.evaluate("fetch('https://example.invalid/').then(()=>false,()=>true)")
 name,config=fixture();got=json.loads(php(apply,dict(sql=sql,database=name),config));assert got==[{'ready_admin_accounts':1}],got
 login=r"""require '/app/backend/src/bootstrap.php';require '/app/backend/src/auth.php';$in=json_decode(stream_get_contents(STDIN),true);
$_SERVER['REMOTE_ADDR']='127.0.0.1';$_SERVER['REQUEST_METHOD']='POST';$_SERVER['HTTP_ORIGIN']=Ekwl\config()['origin'];
Ekwl\startSession();$_SERVER['HTTP_X_CSRF_TOKEN']=$_SESSION['csrf'];$result=Ekwl\authAction('login',$in);if(empty($result['session']['user']['id']))exit(1);echo 'authenticated';
"""
 assert php(login,dict(email=address,password=password),config)=='authenticated'
 before=php("require '/app/backend/src/bootstrap.php';echo json_encode(Ekwl\\run('SELECT id,password_hash,auth_version FROM ekwl_users')->fetchAll());",config=config)
 # Another candidate / password cannot overwrite an established Admin or create a new one.
 second=generate('other@fixture.invalid','অ'*24)
 assert json.loads(php(apply,dict(sql=second,database=name),config))==[{'ready_admin_accounts':1}]
 php(apply,dict(sql=sql,database=name),config)
 after=php("require '/app/backend/src/bootstrap.php';echo json_encode(Ekwl\\run('SELECT id,password_hash,auth_version FROM ekwl_users')->fetchAll());",config=config)
 assert before==after
 # An imported active Admin keeps the original Auth UUID and profile ID/permissions.
 imported,ic=fixture();uid=str(uuid.uuid4())
 php(r"""require '/app/backend/src/bootstrap.php';$in=json_decode(stream_get_contents(STDIN),true);Ekwl\run("INSERT INTO ekwl_site_users(id,auth_user_id,email,role,status,permissions,created_at) VALUES(782,?,?,'admin','active','{\"slide_21\":true}',UTC_TIMESTAMP())",[$in['uid'],$in['email']]);Ekwl\run('INSERT INTO ekwl_users(id,password_hash,created_at) VALUES(?,NULL,UTC_TIMESTAMP())',[$in['uid']]);""",dict(uid=uid,email=address),ic)
 assert json.loads(php(apply,dict(sql=sql,database=imported),ic))==[{'ready_admin_accounts':1}]
 result=json.loads(php("require '/app/backend/src/bootstrap.php';echo json_encode(Ekwl\\run('SELECT id,auth_user_id,permissions FROM ekwl_site_users')->fetch());",config=ic))
 assert result['id']==782 and result['auth_user_id']==uid and json.loads(result['permissions'])=={'slide_21':True}
 assert php(login,dict(email=address,password=password),ic)=='authenticated'
 # A matching general-user account is never promoted by the bootstrap helper.
 refused,rc=fixture()
 php(r"""require '/app/backend/src/bootstrap.php';$in=json_decode(stream_get_contents(STDIN),true);Ekwl\run("INSERT INTO ekwl_site_users(auth_user_id,email,role,status,permissions,created_at) VALUES(?,?,'user','active','{}',UTC_TIMESTAMP())",[$in['uid'],$in['email']]);""",dict(uid=str(uuid.uuid4()),email=address),rc)
 assert json.loads(php(apply,dict(sql=sql,database=refused),rc))==[{'ready_admin_accounts':0}]
 assert php("require '/app/backend/src/bootstrap.php';echo Ekwl\\run(\"SELECT role FROM ekwl_site_users\")->fetchColumn();",config=rc)=='user'
 assert not errors and not remote,(errors,remote)
 online=browser.new_page();online.route('https://staging-helper.invalid/**',lambda route:route.fulfill(body=(ROOT/'downloads/create-staging-admin-offline.html').read_text(),content_type='text/html'))
 online.goto('https://staging-helper.invalid/')
 assert online.locator('#generate').is_disabled() and online.locator('#password').is_disabled() and online.locator('#email').is_disabled()
 browser.close()
server.shutdown()
print('PASS offline no-network/CSP form, password validation/clearing, private bcrypt SQL, PHP login, replay/no overwrite, source UUID/profile preservation and refusal to elevate general users')
