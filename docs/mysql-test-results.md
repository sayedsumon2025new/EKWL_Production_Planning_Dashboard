# MySQL migration test results — 2026-10-22

Status: **local implementation verified; production migration and deployment blocked**.
Branch: `migration/php-mysql`. Baseline: `25f9d3a6403bc2a8852285a2858b03e1fe1563f8`.
All data used below are synthetic fixtures. No production database was exported,
imported, deleted or changed. Local MariaDB results do not establish InfinityFree
or Oracle MySQL compatibility/capacity.

| Check | Result and scope |
| --- | --- |
| Existing JavaScript regressions | 17 repository Node suites pass: Admin, audit, auth/cache, date parser, EWO feeding/readiness, frontend runtime, Gantt, line popup, SAH/loading, Order Bank, coverage |
| New adapter | `tests/mysql/api-client.cjs` passes cookie/CSRF, paging, error/session expiry and chunked-report behavior; 18 Node suites total |
| JavaScript syntax | All 21 root runtime JS files pass `node --check` |
| PHP syntax | All 22 non-secret PHP implementation/tool/test/example files pass PHP 8.2 lint |
| Real API/DB | `api-integration.py`: authentication, CSRF/Origin, SQL allowlist, Admin/general-user permissions, Notes IDOR isolation, incomplete-plan invisibility, exact decimals and identifiers, chunk recovery/conflicts, report activation, date replacement, dynamic Order Bank cells, source headings/newlines, one-use recovery/revocation, scoped readiness/coverage and source-text Accessories dates pass |
| Concurrent sessions | 31 registered fixture accounts; 29 independent logins at concurrency 10 in 1.973 seconds. Not a 30-user sustained-load or hosted-capacity test |
| Real browser/DB | Chromium: login, PSD range, refresh/cache, private Notes literal HTML/XSS probe, Order Bank strings, Load Analysis iframe, themes, logout, protected paths; zero hosted Supabase runtime requests |
| PostgreSQL calculation oracle | Repository PostgreSQL 17 fixtures and PHP exact-decimal engine agree on all returned fields and nested evidence: 29 readiness rows and 9 coverage rows |
| Actual MySQL derived queries | `derived-database.py` independently loads those fixtures into new MariaDB databases and runs scoped SQL loaders plus PHP engine; exact agreement with the same PostgreSQL outputs |
| Source migration tooling | `source-pipeline.py`: read-only local PostgreSQL export; Unicode, leading zeros, 8-place decimals, UTC timestamps; fresh MySQL dry-run/import/retry; every exported field/count reconciles; source accounts have NULL password hashes |
| Legacy Notes tooling | Same pipeline verifies explicit owner map, dry-run, import/retry, rejected missing owner map; actual existing Notes source and privacy remain unverified |
| Offline Admin bootstrap | Generated private SQL applied to the imported fixture Admin; no real/seeded production password included |
| Multipart backup | Valid CSV accepted; anonymous, unauthorized, invalid extension and oversized files rejected. Private server-generated identifier; actual hosted limits pending |
| Archive/restore | Estimate, write pause, duplicate-job protection, resumable batches, SHA checksums, authenticated download, fresh isolated restore, every field/count and repeat restore pass |
| Cleanup gates | Synthetic elapsed-quarter archive: signed successful restore proof, dry-run, refusal without explicit gates, active Admin attribution, authorization reference, deletion/retry tested. API cleanup remains unavailable; no production cleanup occurred |
| Schema retries | Additive schema/index migration ledger reports SKIP on repeat. MySQL DDL partial failures still require operator inspection |
| Package | Secret-free offline staging package with SHA-256 inventory; production_ready=false and cutover_approved=false |

Synthetic CLI performance (`tests/mysql/performance.php`): 1,000 planning records,
100,000 daily cells, 200 batches of 500; 1.913 seconds import, slowest batch
0.2064 seconds, first 1,000-row indexed read 3.403 ms, exact sum
`100125.00000000`, PHP peak allocation 2 MiB. There were 32 fixture users after
an additional storage-test user. The index used was `ekwl_plan_daily_upload_date`.
This measures local batched SQL/CLI work, not browser upload time, hosted request
time, full dashboard memory or shared-host throughput.

## Source access and schema alignment update — 2026-10-24

Reconnect succeeded. Read-only inspection covered all 20 public base tables,
columns/keys/constraints, functions/views/policies and exact counts. Source has
13 uploads, 68,161 planning records, 1,552,043 daily cells, 245,979 raw Order Bank
rows, 31,057 legacy staging rows, 4 Auth identities/4 profiles without ID linkage
orphans and 14 private Storage objects. These are snapshot counts, not estimates.

Additive migration 002 passed against both a previously migrated fixture and a
fresh database; original migration hashes remain unchanged. `source-schema.py`
confirms actual MySQL DDL preserves every observed column and primary key across
all 20 source tables. `master-contracts.py` verifies the real frontend Floor
Allocation field names/result shape, rollback on invalid/duplicate/Line 46 rows,
strength trim/order/duplicates/range validation and chassis clear/append.
Expanded source pipeline passed with 9 synthetic source tables, including rejected
checksum-valid missing-primary-key exports before any import, explicit
source IDs, legacy staging, Unit and free-form fabric time strings.

Seven source calculation helper/RPC definitions and both readiness/coverage view
definitions match the PostgreSQL oracle definitions exactly after CRLF normalization.
The fixture permission helper intentionally differs from production authorization;
API permissions are independently tested. Both original PostgreSQL fixtures and
actual scoped MySQL loaders again pass 29 readiness + 9 coverage every-field parity.
The real API regression passed after alignment (29 independent sessions/concurrency
10, 1.917 seconds). These are local fixture results, not live report reconciliation.

## Blocked

- Bulk source export still needs a secure project-specific PostgreSQL DSN for
  the repeatable-read exporter. Connector read access is restored; full actual
  row/field export/import and live report comparison have not run.
- Actual source data, Auth/profile/owner reconciliation and Storage objects have
  not been migrated. The new backup endpoint does not copy old Storage objects.
- No authenticated new InfinityFree staging DB/files/runtime connection. Account
  links alone grant no API/database/FTP session.
- Existing `/htdocs/ekwl-mysql/` and `if0_43242550_ekwl_extra` were not inspected
  or modified; existing Notes export and verified owner mapping are unavailable.
- Full source-to-target totals, every live report and production deployment cannot
  be certified from synthetic fixtures.

## Untested / limits

Actual InfinityFree PHP/MySQL version, mbstring, PDO, sessions, .htaccess denial,
HTTPS/Secure cookies, upload/request/storage quotas, query execution limits,
large Order Bank finalization, archive size, concurrent sustained usage and monthly
growth remain unmeasured. Hosted email recovery is not implemented; an Admin
issues a short-lived one-use link through a trusted channel. Quarterly restore
verifies historical rows, not a complete application/disaster recovery image.

## Reproduce locally

See `tests/mysql/README.md`. Tests require an isolated checkout/runtime and use
new fixture databases. Never point them at a hosted or production database.

## Guided phpMyAdmin installer

The 20.8 KB one-time installer was executed on a new isolated local fixture
(substituting only its USE target). Complete schema and four migration hashes
verified; repeated ledger creation was blocked; CLI migration recognized all
four hashes and returned SKIP. The generated bundle explicitly targets the
confirmed empty `if0_43242550_ekwl_stage` and contains no source data or credentials.
Actual hosted phpMyAdmin import is pending user execution/verification.
