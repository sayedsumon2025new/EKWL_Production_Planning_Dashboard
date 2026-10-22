# MySQL staging database

This is an additive candidate schema, not a verified copy of the complete live
PostgreSQL schema. `backend/catalog.json` is the query allowlist and source-field
type mapping. `tools/mysql/build_catalog.py` generates it and `schema.sql` from
repository evidence. Unknown source tables or columns stop migration instead of
being discarded. Production introspection and reconciliation remain required.

Use a newly created staging database. Do not use
`if0_43242550_ekwl_extra`: its existing Notes schema has not been inspected and is
protected by a staging configuration guard. All new tables use `ekwl_` prefixes;
no migration contains DROP TABLE or changes the existing `/ekwl-mysql/` files.

Tested locally: PHP 8.2 with PDO MySQL and MariaDB 10.11. Actual InfinityFree PHP,
MySQL/MariaDB version, InnoDB, foreign-key support, charset/collation, storage and
request limits are unverified. This schema uses InnoDB, utf8mb4_bin, DECIMAL(24,8),
UTC DATETIME(6), DATE and JSON encoded in LONGTEXT for cross-engine portability.
Source calendar dates retain their written day. Business Dhaka dates remain in
frontend calculations. Source JSON objects/column lists are retained; source
names with trailing whitespace/newlines map to safe physical columns.

## Applying to an isolated database with PHP CLI

1. Copy `backend/config/config.example.php` to `backend/config/config.local.php`.
   Set the dedicated staging DSN, credentials, exact HTTPS origin and base path
   using a secure server file or environment. Do not commit this file.
2. Run `php tools/mysql/migrate.php`. Run it again to verify the migration ledger
   reports SKIP. DDL is not transaction-safe in MySQL; keep an empty staging backup
   and inspect partial failures before retrying. The runner records file hashes.
3. Create the first test administrator with
   `php tools/mysql/bootstrap-admin.php admin@example.com`, supplying a randomly
   generated 12+ character password via protected stdin. No seeded password exists.
4. Reduce the API database account to SELECT/INSERT/UPDATE/DELETE on this database;
   use a separate operator identity for DDL and restore tools.

InfinityFree may not provide SSH/PHP CLI. Use phpMyAdmin for reviewed SQL only;
generate initial administrator SQL offline with `php tools/mysql/create_admin_seed.php
admin@example.com` (password via protected stdin) and save its output privately.
For an imported Admin profile, pass its verified Auth UUID as the second argument.
Review and execute that SQL only in the NEW staging database through phpMyAdmin.
The seed refuses the existing Notes database and does not replace an established
Admin password. Delete the private seed after use. Never expose CLI tools as a
public web installer. Actual hosted setup is still unverified.

## Integrity and indexes

Planning records reference uploads; daily rows reference the exact record/upload
pair. Order Bank rows reference the corresponding upload batch. UUID identities
stay strings. Numeric source EWO columns are mapped to strings so identifiers are
not rounded; new planning CSV uploads retain leading zeros. Known source uniqueness
is enforced for staged rows. The repository-documented daily `(record_id,plan_date)` uniqueness
must still be confirmed against the live schema before data migration; source export
preserves all rows and import refuses incompatible data.

`indexes.sql` is applied once by the migration ledger. It covers upload/date,
record/date, source order, active snapshot lookups, EWO/color and production date.
Source constraints not visible in this repository are not claimed to be migrated.

## Read-only source export and import

Install the pinned optional PostgreSQL export dependency on an operator machine.
Configure `EKWL_SOURCE_PG_DSN` securely; never paste it in chat or commit it.
Run `python tools/mysql/export_source.py --project-id rdslpcazdzqjlenbezaf --out
/private/new-export` (one shell line). The tool requires a project-specific
connection identity, opens a read-only repeatable-read transaction, inventories
all public base tables and exports every row, constraints and auth identity
metadata. It does not export hashes, sessions, reset tokens or MFA secrets.

Run `php tools/mysql/import_source.php /private/new-export/manifest.json` first.
It verifies every checksum, row count and mapped field. With `--apply`, batches
of 250 rows commit together with checkpoints. Repeating the exact manifest is
retry-safe. New manifests reapply mapped source rows; removals are deliberately
not synchronized automatically. The final frozen export must be imported into a
fresh staging database, not over a target containing unrelated test fixtures.
Run `php tools/mysql/reconcile.php /private/new-export/manifest.json` and require
exact row and field agreement for every mapped source table. A sample is not
sufficient. Source unknown tables/schema differences block import until reviewed.
Imported identities have NULL password hashes and cannot sign in until an Admin
issues a one-use activation/reset link. Existing passwords are not transferred.

## Quarter archive / restore

The Admin Account & Data screen estimates source counts, starts or resumes an
export and advances 500-row batches. Set server configuration `maintenance=true`
first to pause application writes. Keep all external writers paused as well.
Exports contain quarter-uploaded planning snapshots and their records/daily
cells, quarter Order Bank batches/rows and quarter report evidence. Production
uses output_date for quarter membership. Notes, credentials and sessions are
excluded; this is a historical-data archive, not a complete disaster-recovery
backup of every application table. Full database backups remain necessary.

Export files live under private storage. Download requires an active Admin
session and a file listed in that job's manifest. Verification checks SHA-256,
NDJSON parseability and source/table row totals. Restore with
`php tools/mysql/restore_archive.php /private/archive/manifest.json` for a dry
run, then `--apply` against an empty dedicated database. Restore resumes the same
archive and checks every restored field and count. It refuses unrelated nonempty
target tables. Historical report pointers, full application state and current
master configuration are not reconstructed by quarter restore; restore testing
is data-integrity verification, not application cutover verification.

No automatic deletion runs. `tools/mysql/cleanup_archive.php` defaults to dry run.
It requires a matching HMAC-signed successful restore report (configure a private
32+ character `archive_attestation_key` on export/restore/cleanup environments),
a fully elapsed quarter, unchanged archived rows, explicit server enablement
`allow_archive_cleanup=true`, `maintenance=true`, paused external writers,
`--execute --authorization=RECORDED-APPROVAL-REFERENCE --admin-auth-id=VERIFIED-UUID`.
Current plan/Order Bank snapshots, active module/report evidence and all Notes/users
are protected. The CLI takes the archive manifest and saved restore report paths
as its first two arguments. Deletion is checkpoint-like and partial commits can
occur: inspect output and audit log before resuming. Latest/active data may remain;
this is not an automatic space-reclamation guarantee. Production authorization,
retention review and full backup are still required; no production cleanup ran.
