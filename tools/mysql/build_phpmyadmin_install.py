"""Build a one-time empty-staging SQL import with migration hash ledger.
No database connection or credentials. Never overwrites an existing installation.
"""
import hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SQL=ROOT/'database/mysql'
files=[SQL/'schema.sql',*sorted((SQL/'migrations').glob('*.sql')),SQL/'indexes.sql']
parts=[
 '-- ONE-TIME INSTALL: NEW EMPTY if0_43242550_ekwl_stage ONLY.',
 '-- If an error appears, stop and inspect it. Do not rerun or delete tables.',
 '-- Contains schema only: no passwords, source data, account activation or live cutover.',
 'USE `if0_43242550_ekwl_stage`;',
 'SET NAMES utf8mb4;',
 "SET time_zone = '+00:00';",
 # Deliberately no IF NOT EXISTS: a second import must stop before any schema change.
 'CREATE TABLE ekwl_schema_migrations (name VARCHAR(150) PRIMARY KEY,sha256 CHAR(64) NOT NULL,applied_at DATETIME NOT NULL) ENGINE=InnoDB;'
]
for path in files:
    content=path.read_text();digest=hashlib.sha256(path.read_bytes()).hexdigest()
    parts.extend(['\n-- BEGIN '+path.name,content.rstrip(),"INSERT INTO ekwl_schema_migrations(name,sha256,applied_at) VALUES ('"+path.name+"','"+digest+"',UTC_TIMESTAMP());",'-- END '+path.name])
parts.append("SELECT 'STAGING SCHEMA INSTALLED' AS result,COUNT(*) AS verified_migration_files FROM ekwl_schema_migrations;")
output=SQL/'staging-install-if0_43242550_ekwl_stage.sql'
output.write_text('\n\n'.join(parts)+'\n')
print('Built',output,'from',len(files),'reviewed files. Import once into the empty staging database only.')
