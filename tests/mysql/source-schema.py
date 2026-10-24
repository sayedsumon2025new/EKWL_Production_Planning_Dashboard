"""Check real local MySQL DDL against read-only observed production columns/keys."""
import json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
script="require '/app/backend/src/bootstrap.php';$out=[];foreach(Ekwl\\catalog() as $name=>$c){$rows=Ekwl\\run('SHOW COLUMNS FROM '.Ekwl\\ident('ekwl_'.$name))->fetchAll();$out[$name]=$rows;}echo json_encode($out);"
actual=json.loads(subprocess.check_output(['docker','exec','ekwl-migration-api','php','-r',script],text=True))
source=json.loads((ROOT/'database/mysql/source-schema-20261024.json').read_text())
catalog=json.loads((ROOT/'backend/catalog.json').read_text())
for table in source['tables']:
    name=table['name'].split('.')[1];spec=catalog[name]
    columns={r['Field'] for r in actual[name]}
    for column in table['columns']:assert spec['storage_names'].get(column['name'],column['name']) in columns,(name,column['name'])
    keys=[r['Field'] for r in actual[name] if r['Key']=='PRI']
    assert set(keys)==set(table['primary_keys']),(name,keys,table['primary_keys'])
print('PASS actual MySQL DDL preserves every observed column and primary key across all 20 production tables')
