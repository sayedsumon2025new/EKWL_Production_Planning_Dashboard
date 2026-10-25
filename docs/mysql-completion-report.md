# Migration completion report — implementation candidate

Branch: `migration/php-mysql`, based on
`25f9d3a6403bc2a8852285a2858b03e1fe1563f8`. **Not fully complete and not live.**
The implementation/tooling and local validation requested without source access
are delivered. Full source type/value audit, real-data migration, hosted validation
and separately approved production deployment remain blocked.

## Changed files and modules

- `backend/catalog.json`, `database/mysql/`: typed candidate table/field mappings,
  source-name aliases, constraints/indexes, additive services and hash ledger.
- `backend/src/`, `api/`: PDO allowlisted API; sessions/CSRF/roles/auth lifecycle;
  private Notes; planning/module/report imports and snapshots; exact-decimal
  readiness/coverage ports; Admin archive/verification/download/runtime endpoints.
- `mysql-api-client.js`, `mysql-management.js`, `index.html`, `dashboard-main.js`:
  same-origin adapter replaces hosted SDK; original modules/formulas retained;
  Account & Data UI for private Notes, recovery/import/archive operations.
- `tools/mysql/`: source export/import/reconcile, first Admin and offline SQL seed,
  explicit owner-mapped Notes import, archive restore and default-off authorized
  cleanup, schema/audit generators and secret-free staging packager.
- `tests/mysql/`, `tests/frontend-runtime.cjs`: real PHP/MariaDB/browser tests,
  original PostgreSQL oracle comparisons, migration/restore/security/performance
  fixtures and local Docker reproduction instructions.
- `.github/workflows/deploy-infinityfree.yml`, `.gitignore`, denial `.htaccess`
  files: isolate migration, block accidental frontend-only PHP deployment,
  exclude secrets/private data and protected server implementation.
- `docs/mysql-*`: baseline inventory, feature checklist, security review, tests,
  hosting assessment, exact setup, cutover and rollback procedures.

## Verified outcome

18 Node suites; syntax checks for 21 JS/22 PHP files; real API, browser, upload,
archive/restore/authorization regressions pass. Actual MySQL loader + PHP engine
agrees on every field of 29 readiness and 9 coverage rows with repository PG
fixtures. Local synthetic source export/import/retry reconciles every exported
field/count and preserves NULL passwords, Unicode, identifiers, decimals and UTC.
The 100,000-row synthetic CLI workload and 29 independent sessions at concurrency
10 pass locally. See `mysql-test-results.md` for measurements and strict limits.

## Source reconnect update — 2026-10-24

All 20 observed tables/columns/primary keys are covered by actual local MySQL DDL
tests. Source calculation definitions (7 helpers/RPCs + 2 views) agree exactly
with the PostgreSQL oracle used for fixture parity. Source-ID, legacy staging,
Unit/free-form time import preservation and actual frontend Floor/Strength RPC
contracts are now tested. The source inventory is
`database/mysql/source-schema-20261024.json`. This adds source metadata evidence;
it is not full production row/result migration or cutover approval.

## Actual migration / authentication / archives

**Production rows migrated: zero.** No production SQL/export/FTP write, merge or
cutover was performed. Source access was restored on 2026-10-24; all 20 public table schemas, keys,
constraints, functions/views/policies and exact counts were inspected read-only.
Additive migration 002 preserves missing fields/source IDs and legacy staging.
Bulk repeatable-read export still needs a private source DSN; actual staging
DB/files/runtime access is not configured. Account links alone do not grant it. Actual Auth
accounts/passwords/sessions and existing Notes have not been moved. New identities
preserve UUIDs and require controlled password activation; automatic recovery
email is not implemented. Existing Notes files and database remain intact.

Quarter archives and exact data restore are verified locally. Signed restore
proof, explicit server enablement, write pause, active Admin identity and recorded
authorization gate separate cleanup; it never runs after export automatically.
Archives are historical data, not a full application backup. Production cleanup
has not run. New CSV backup is tested; old source Storage objects remain unmigrated.

## Required next steps

Follow `mysql-deployment.md` for exact manual steps. Securely configure the bulk-export DSN and NEW staging DB/files/runtime access;
complete source type-range checks and inspect Notes ownership; migrate/reconcile all real data and Storage;
validate every live KPI/permission and actual hosted quotas/load/restore; establish
trusted activation delivery and full rollback backups. Freeze writers for a final
fresh export/import/reconciliation, then obtain explicit production approval.

The review package is `dist/mysql-staging-20261024/` (latest), with a SHA manifest and
`production_ready=false`. It excludes real config, private files and exports.
No automatic deployment from this branch is enabled. Existing live dashboard,
`/htdocs/ekwl-mysql/` and `if0_43242550_ekwl_extra` were not modified.
