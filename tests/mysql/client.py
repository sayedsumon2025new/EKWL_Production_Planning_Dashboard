"""Destructive FIXTURE test. Run only against the isolated localhost test runtime.
python tests/mysql/api-integration.py /tmp/ekwl-test-auth.json
"""
import concurrent.futures, http.cookiejar, json, secrets, sys, time, urllib.error, urllib.parse, urllib.request, uuid
from pathlib import Path
BASE='http://127.0.0.1:18080/api/index.php'
class Client:
    def __init__(self):
        self.jar=http.cookiejar.CookieJar();self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar));self.csrf=''
        self.call('auth/session',get=True)
    def call(self,route,payload=None,get=False,expected=200,csrf=True,origin='http://127.0.0.1:18080'):
        headers={'Origin':origin}
        if csrf:headers['X-CSRF-Token']=self.csrf
        if not get:headers['Content-Type']='application/json'
        req=urllib.request.Request(BASE+'?route='+urllib.parse.quote(route),data=None if get else json.dumps(payload or {}).encode(),headers=headers)
        try:
            with self.opener.open(req,timeout=60) as r:status=r.status;body=json.load(r)
        except urllib.error.HTTPError as e:status=e.code;body=json.load(e)
        if isinstance(body.get('data'),dict):self.csrf=body['data'].get('csrf',self.csrf)
        assert status==expected,(route,status,body)
        return body
    def query(self,table,op='select',expected=200,**kwargs):return self.call('query',dict(table=table,op=op,**kwargs),expected=expected)
    def login(self,email,password,expected=200):return self.call('auth/login',dict(email=email,password=password),expected=expected)
