"""Verify code-only updates cannot contain configuration, private data or SQL."""
import json,subprocess,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory() as d:
    out=Path(d)/'release'
    subprocess.run([sys.executable,str(ROOT/'tools/mysql/build_deploy.py'),'--out',str(out),'--version','test-release-123'],check=True)
    paths={f['path'] for f in json.loads((out/'deploy-manifest.json').read_text())['files']}
    assert {'index.html','api/index.php','backend/src/auth.php','backend/.htaccess','mysql-api-client.js'}<=paths
    assert not any('/config/' in '/'+p or '/private/' in '/'+p or p.endswith(('.sql','.local.php','.ndjson','.zip')) for p in paths)
    assert not (out/'ekwl-live-root.zip').exists()
    html=(out/'site/index.html').read_text()
    assert 'mysql-api-client.js?v=test-release-123' in html and '@supabase/supabase-js' not in html
    assert (out/'site/backend/.htaccess').read_text()=='Require all denied\n'
    workflow=(ROOT/'.github/workflows/deploy-infinityfree.yml').read_text()
    assert '--delete' not in workflow and '--delete-first' not in workflow
    assert 'refs/heads/main' in workflow and 'needs: validate' in workflow
    assert 'set ssl:verify-certificate yes' in workflow
    assert 'mput *.html' in workflow
    assert '--include-glob' not in workflow
    assert 'tools/mysql/verify_live.py --version' in workflow
print('PASS code-only release isolation, fresh assets, test/branch gates and verified FTPS without deletion')
