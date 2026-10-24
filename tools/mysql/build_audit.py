"""Inventory the pre-migration Git tree; exclude third-party minified implementation text."""
import collections,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
base=subprocess.check_output(['git','merge-base','HEAD','main'],cwd=ROOT,text=True).strip() if subprocess.run(['git','rev-parse','--verify','main'],cwd=ROOT,capture_output=True).returncode==0 else subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
# This task's known production baseline is retained independently of future branch commits.
base='25f9d3a6403bc2a8852285a2858b03e1fe1563f8'
files=subprocess.check_output(['git','ls-tree','-r','--name-only',base],cwd=ROOT,text=True).splitlines()
items=[];functions=[];deps=[]
for name in files:
 p=Path(name)
 if p.suffix not in {'.html','.js','.css','.php','.sql','.yml','.yaml','.cjs','.py'}:continue
 text=subprocess.check_output(['git','show',base+':'+name],cwd=ROOT,text=True)
 items.append({'path':name,'bytes':len(text.encode()),'kind':p.suffix[1:],'third_party':name.endswith('.min.js')})
 if name.endswith('.min.js') or name.startswith('tests/'):continue
 for line_no,line in enumerate(text.splitlines(),1):
  if re.search(r'\b(?:SB\.(?:from|rpc|auth|storage|functions|channel)|supabase\.createClient)',line):deps.append({'file':name,'line':line_no,'source':line.strip()})
 for match in re.finditer(r'^(?:async )?function (\w+)\(',text,re.M):
  functions.append({'file':name,'line':text[:match.start()].count('\n')+1,'function':match.group(1)})
inventory={'baseline':base,'files':items,'service_references':deps,'functions':functions,'catalog':json.loads((ROOT/'backend/catalog.json').read_text())}
(ROOT/'docs/mysql-dependency-inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
lines=['# EKWL MySQL migration audit','',f'Baseline: `{base}`. Inventory covers {len(items)} HTML/JS/CSS/PHP/SQL/workflow files and {len(deps)} explicit service reference sites. Machine-readable details: `mysql-dependency-inventory.json`.','',
'## Source identity and evidence limits','',
'The production repository initializes `https://rdslpcazdzqjlenbezaf.supabase.co`; this is the expected project ref. Access initially returned permission denied on 2026-10-22. After reconnect on 2026-10-24, read-only source inspection succeeded: all 20 public base tables, columns, primary/unique/foreign/check constraints, function/view definitions, RLS policies, exact counts, identity linkage counts and Storage inventory were inspected. The versioned schema inventory is `database/mysql/source-schema-20261024.json`. Additive migration 002 preserves previously missing fields, source IDs/primary keys and the legacy Order Bank staging table. No source writes or full data export occurred. There are 13 uploads, 68,161 planning records and 1,552,043 daily cells at the inspected snapshot; 4 Auth identities and 4 profiles have no ID linkage orphans. Source has 14 private Storage objects. Full row/field migration and live result reconciliation remain pending. Environment readiness still has no staging credentials; InfinityFree runtime and existing Notes source/database remain unavailable.','',
'## Runtime and API mapping','',
'| Existing behavior | Candidate replacement | Status |','| --- | --- | --- |',
'| Hosted SDK query builder / browser publishable key | `mysql-api-client.js` → same-origin `api/index.php` → allowlisted PDO queries | Implemented; local API and adapter tests pass |',
'| Auth sessions / JWT | HttpOnly SameSite PHP cookie; CSRF; auth_version revocation | Implemented; local authentication tests pass |',
'| Admin Edge Function create/update/remove | `users` operation, server-checked active Admin | Implemented; remove revokes access and preserves audit/ownership references |',
'| Email password recovery | Admin-issued hashed one-use 30-minute token; restricted recovery session | Implemented; automatic email delivery is not available/claimed |',
'| Planning catalog/records/daily cells | Typed MySQL tables, owned staging uploads, FK/count-verified completion | Implemented; local tests pass |',
'| Report replace RPC | Resumable chunk jobs and atomic active-batch pointers | Implemented; per-date production replacement tested |',
'| Flexible Order Bank import | Owned staging tokens, preserved JSON cells/source-column manifest, verified snapshot | Implemented; local exact-cell tests pass; large finalization/hosting duration unverified |',
'| Size Set / Accessories / Embellishment | Source-preserving staged tables and atomic finalize RPC equivalents | Implemented; local tests pass |',
'| Chassis, strength, efficiency, ABP, floor/settings | Allowed master-table reads/writes and transactional replacements | Implemented; source columns and keys inspected; full data reconciliation pending |',
'| EWO readiness view | Scoped MySQL loader + exact-decimal PHP engine | Local PostgreSQL fixture parity passed; live parity pending |',
'| Ready-input coverage RPC | Scoped MySQL loader + exact-decimal PHP engine | Local PostgreSQL fixture parity passed; live parity pending |',
'| Plan-data CSV Storage backup | Authenticated size-limited private CSV storage | Implemented; multipart/hosting tests pending; existing Storage objects are not migrated |',
'| Realtime | No channel/subscription reference found in production application source | No replacement required from repository evidence |',
'| Existing `/ekwl-mysql/` Planning Notes | Owner-mapped importer available; actual source unavailable; leave existing directory/database intact | Owner-mapped import CLI implemented; actual legacy export unavailable |',
'| New migrated private Notes | Owner-constrained PDO CRUD, Admin does not inherit read access | Implemented and API isolation tested; legacy Notes are not imported |',
'| Quarterly archive | Admin estimate/step/verify/download and isolated CLI restore | Implemented; local export/restore tests pass; separate signed-proof cleanup CLI defaults off; production authorization pending |','',
'## Feature and calculation preservation','',
'Business aggregations remain in the existing dashboard/module functions. The new adapter preserves row shapes, query filters, ordering, paging and error envelopes. This is an application-specific adapter, not a permissive SQL proxy. Each table/column/operator is allowlisted server-side. Server values, not browser role flags, authorize access. Factory planning data are shared across active dashboard accounts because Home already computes from that data; private Notes remain per-owner. Table permissions include the documented cross-feature evidence dependencies.','',
'| Feature | Source / calculations | API data |','| --- | --- | --- |',
'| Home / planning KPIs | `renderHome`, `renderS1`, `getFiltered`, selected complete upload | plan_uploads, plan_records, plan_daily |',
'| Buyer / product / efficiency summaries | renderS3, renderS5, ladder helpers; original frontend formulas | planning + efficiency_run_day_ladder |',
'| EWO/Feeding / PSD range | buildS6Rows, renderS6 and renderS8; PSD filtering before EWO grouping | selected planning snapshot |',
'| EWO Gantt / popup / action calendars | build indexes, pooled EWO/color evidence, date/calendar parsers | planning + fabric/sewing/production + active module snapshots/Order Bank |',
'| Plan vs HW / chassis | renderS7/renderS4, configured master lines, strength and ABP | planning + master settings |',
'| Fabrics & Cutting | renderS12, source report joins | fabric/sewing/active embellishment |',
'| Admin/User | existing UI with local API adapter | master tables / self-profile / Admin users endpoint |',
'| Order Bank / execution | dynamic source JSON, exact strings, pinned batch; existing joins | latest successful Order Bank + planning |',
'| Size Set / Accessories / Embellishment | existing CSV parser/render/filter/date logic | active or own staging module rows |',
'| Load Analysis | exact selected SAH/Day totals and shared ABP Daily Capacity | hydrated planning + abp_target |',
'| Readiness / Coverage | PostgreSQL CTEs and conflict/unknown gates in repository SQL | ported PHP engine, exact local PostgreSQL fixture parity (29 readiness + 9 coverage rows) |','',
'All calculation/helper function locations follow in the machine-readable inventory. Historical SQL, source tests, PostgreSQL functions, RLS policies and fixture files remain in Git for review; staging packaging excludes them. One deliberate CSV correction preserves new planning EWO leading zeros. One feeding-chart label fix escapes source text. No wider business formula rewrite is claimed.','',
'## Source file inventory','', '| File | Kind | Bytes |','| --- | --- | ---: |']
lines += [f"| `{x['path']}` | {x['kind']}{' (third party)' if x['third_party'] else ''} | {x['bytes']} |" for x in items]
lines += ['','## Explicit service reference inventory','', '| Source location | Original reference |','| --- | --- |']
lines += [f"| `{x['file']}:{x['line']}` | `{x['source'].replace('|','&#124;')}` |" for x in deps]
lines += ['','## Cache / synchronization audit','',
'The current frontend has owner-scoped sessionStorage/IndexedDB bootstrap, a 15-minute planning validation window, per-upload caches, session-generation fences, shared report promises and source-specific invalidation. The migration changes the cache namespace to the local API URL so hosted-source cache data are not reused as MySQL data. Imported source identities retain their IDs; no old browser auth token is trusted. API session revocation also triggers local sign-out. Source migrations must be frozen and reconciled before cutover; removals are not automatically applied by import tools.','',
'## Workflow and deployment audit','',
'The original main-only FTP workflow uploads frontend files without deleting server files and skips missing FTP configuration. On this migration branch, a branch-ref guard blocks manual dispatch from a development branch; an explicit guard refuses to deploy a PHP migration using the frontend-only pipeline. Backend/database/tools/docs/API/private paths are excluded. No production workflow run or production FTP write was requested for this task. A separate offline staging packager excludes real config, private data, exports and source migrations.','',
'## Remaining audit gates','',
'Source metadata and exact counts were inspected read-only on 2026-10-24. Full source row/field export/import, numeric/text range checks, source-to-target live result parity, actual Notes source/ownership, source Storage transfer and actual InfinityFree PHP/MySQL/HTTPS/session/.htaccess/upload limits remain unverified. The reviewed source schema inventory is versioned; unknown new schema drift is rejected instead of discarded.']
(ROOT/'docs/mysql-migration-audit.md').write_text('\n'.join(lines)+'\n')
print(f'Inventoried {len(items)} source files, {len(deps)} service sites and {len(functions)} calculation/lifecycle functions.')
