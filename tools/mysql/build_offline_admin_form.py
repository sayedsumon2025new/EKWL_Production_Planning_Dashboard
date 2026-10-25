"""Build one offline HTML file. No network or database connection at runtime."""
import base64,hashlib,html,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
base=ROOT/'tools/mysql'
vendor=(base/'vendor/bcryptjs-3.0.2.js').read_text()
provenance=json.loads((base/'vendor/bcryptjs-3.0.2.provenance.json').read_text())
assert hashlib.sha256(vendor.encode()).hexdigest()==provenance['javascript_sha256']
app=(base/'admin-seed/form.js').read_text()
style='body{margin:0;background:#f1f5fa;color:#14243b;font:16px system-ui,sans-serif}main{max-width:540px;margin:36px auto;padding:28px;background:white;border:1px solid #d6dfeb;border-radius:12px}h1{font-size:25px;margin-top:0}label{display:block;margin:20px 0 6px;font-weight:600}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #8698ae;border-radius:6px;font:inherit}button{width:100%;margin-top:24px;padding:13px;border:0;border-radius:6px;background:#183b62;color:white;font:inherit;font-weight:600;cursor:pointer}button:disabled{opacity:.55;cursor:wait}p{line-height:1.65}small{color:#47596f}#status{white-space:pre-line;color:#173e71}code{overflow-wrap:anywhere}'
def digest(s):return "'sha256-"+base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()+"'"
csp="default-src 'none'; script-src "+digest(vendor)+' '+digest(app)+"; style-src "+digest(style)+"; connect-src 'none'; base-uri 'none'; form-action 'none'"
page='''<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="'''+html.escape(csp,quote=True)+'''">
<meta name="referrer" content="no-referrer"><title>EKWL — Admin account-এর SQL তৈরি করুন</title><style>'''+style+'''</style></head>
<body><main><h1>নতুন dashboard-এর Admin login</h1>
<p>আপনার email ও নতুন password দিন। এই form আপনার কম্পিউটারেই কাজ করে; email/password কোনো server-এ পাঠায় না।</p>
<form id="seed-form" autocomplete="off">
<label for="email">আপনার email</label><input id="email" type="email" maxlength="255" required autocomplete="off" spellcheck="false">
<label for="password">নতুন password</label><input id="password" type="password" required autocomplete="new-password"><small>কমপক্ষে ১২ অক্ষরের নতুন password বেছে নিন।</small>
<label for="confirm">একই password আবার দিন</label><input id="confirm" type="password" required autocomplete="new-password">
<button id="generate" type="submit">Admin SQL ডাউনলোড করুন</button></form>
<p id="status" role="status" aria-live="polite"></p>
<p><small>শুধু নতুন <code>if0_43242550_ekwl_stage</code> database-এর জন্য। HTML ফাইলটি website-এ upload করবেন না। তৈরি হওয়া private SQL ফাইল chat-এ পাঠাবেন না।</small></p>
</main><script>'''+vendor+'''</script><script>'''+app+'''</script></body></html>
'''
out=ROOT/'downloads/create-staging-admin-offline.html'
out.write_text(page)
print('Built offline Admin form:',out,'bytes:',out.stat().st_size,'no external resources; CSP script hashes verified at build time')
