# Staging setup, hosting assessment and cutover

**Do not deploy this branch to production yet.** The user requested an isolated
migration with no production changes. GitHub Pages cannot execute PHP; the new
frontend and API must share a PHP-capable HTTPS origin. Keep the existing live
GitHub Pages/InfinityFree application and Notes module intact during staging.

## Exact staging setup

1. Configure privileged **read-only export** access to Supabase project
   `rdslpcazdzqjlenbezaf` in a protected environment. The current connector returns
   permission denied. Account URLs are not credentials. Never put secrets in chat,
   a commit, frontend JS, PR body or a web installer.
2. Create a **new dedicated staging database** and a separate staging folder/site,
   for example `/htdocs/ekwl-staging/`. Never select the existing Notes database
   `if0_43242550_ekwl_extra` or upload into `/htdocs/ekwl-mysql/`. Record exact PHP,
   MySQL/MariaDB version, InnoDB/FK/utf8mb4 support and storage quota.
3. In an isolated checkout, run `python tools/mysql/package_staging.py`. Review
   `dist/mysql-staging/package-manifest.json`; it explicitly says not production
   ready. Upload only this reviewed package into the NEW staging folder. Do not
   synchronize with remote-delete or copy the entire repository.
4. Before adding real config, verify direct requests to `/backend/`,
   `/database/`, `/tools/`, any `*.local.php` and private exports are denied.
   If the host ignores .htaccess, stop and move all sensitive files outside the
   document root with reviewed path changes. Confirm API requests reach PHP and
   never return PHP source. Keep directory listing disabled.
5. Set `backend/config/config.local.php` privately from `config.example.php`:
   dedicated DSN, runtime DB user/password, exact `https://STAGING_HOST` Origin,
   `base_path=/ekwl-staging/`, Secure cookies true and writable protected private
   directory. Do not reuse local test configuration. Set a private random 32+
   character archive attestation key if using signed restore evidence.
6. With staging CLI/operator credentials run `php tools/mysql/migrate.php`, then
   repeat and require SKIP. This applies `schema.sql`, services migration and
   `indexes.sql`. For phpMyAdmin-only hosting, import these files in that order
   into the NEW database and keep a private application ledger of file hashes;
   do not expose the CLI migration runner as an unauthenticated HTTP installer.
   DDL partial failure needs inspection, not a blind retry.
7. Bootstrap an initial test Admin via `bootstrap-admin.php` (password from
   protected stdin). Without hosted CLI, generate a PRIVATE SQL seed offline
   using `create_admin_seed.php EMAIL [VERIFIED-EXISTING-AUTH-UUID]`, then run it
   in the NEW database through phpMyAdmin. Do not overwrite imported profiles or
   existing established Admin credentials. Delete the private seed after use.
8. Reduce runtime DB permissions to application SELECT/INSERT/UPDATE/DELETE;
   separate DDL/import/restore operator credentials. Confirm sessions are writable
   and protected, HTTPS/Secure/HttpOnly/SameSite flags, logout/revocation and no
   anonymous database/Notes/archive access.
9. Exercise login, Admin and general-user roles, owner-isolated Notes, every
   module, local CSV uploads, snapshot activation, cache refresh, ABP target and
   PSD filter. Use Admin Account & Data runtime probe to record actual PHP/DB,
   memory/time/post/upload limits. Measure large Order Bank finalization, 100k-row
   planning, archive export/restore and concurrent sustained browser usage.
10. Export source into a NEW PRIVATE folder with `export_source.py --project-id
    rdslpcazdzqjlenbezaf --out PRIVATE_PATH`, setting `EKWL_SOURCE_PG_DSN` only
    through protected environment configuration. Install pinned requirements in
    `tools/mysql/requirements-export.txt`. Complete source schema/PK/RPC/policy,
    duplicate/orphan/Auth/Storage inventory before applying. Unknown mappings or
    orphan Auth identities must be resolved explicitly, not skipped.
11. Import into a fresh dedicated candidate database: `import_source.php
    PRIVATE_PATH/manifest.json` for dry run, then `--apply`, retry the same manifest
    and run `reconcile.php` requiring every source row/field/count to match. The
    export is read-only; imports use 250-row transactional checkpoints. Existing
    source removals are not automatically propagated to an already populated DB.
12. If the host has no CLI and disallows remote MySQL (common on shared hosting),
    run the reviewed migration/restore in an operator-controlled local database
    first, reconcile completely, then produce a private full SQL dump using the
    matching MySQL/MariaDB client and a protected defaults file (never a password
    argument). Import it via phpMyAdmin only into the NEW staging database and
    reconcile hosted counts/results. Actual phpMyAdmin file/time limits and
    supported chunking must be measured. No hosted transfer is verified yet.
13. Obtain an explicit legacy Notes export and verified source-owner → preserved
    Auth UUID mapping; build `ekwl-notes-v1` manifest with `file`, `rows`, `sha256`,
    `owner_map`. Notes NDJSON fields: id, source_owner, title, content, updated_at.
    `import_notes.php MANIFEST` validates without writing; `--apply` imports with
    retries and rejects owner/content overwrite. Never guess owners. Existing
    Notes files/database remain unchanged. Re-test two users and Admin privacy.
14. Imported Auth identities retain UUIDs but receive NULL local password hashes.
    Use verified imported Admin UUID for the protected initial seed, then issue
    one-use activation links through trusted delivery. Do not migrate password
    hashes, sessions, refresh tokens or browser JWTs. Automatic email is absent.
15. Inventory/migrate required source Storage objects separately. The implemented
    private CSV endpoint handles new backups up to the smaller of application
    4 MiB and actual PHP limits; it does not migrate existing Storage contents.
    This remains an explicit cutover gate.

## Hosting compatibility assessment

Locally tested PHP 8.2 + PDO_mysql, MariaDB 10.11 and PostgreSQL 17 oracle. There
is no hosted compatibility claim. mbstring is needed if non-ASCII case-folded
source matching occurs; missing support fails explicitly rather than changing
results. Same-origin deployment avoids CORS/JWT requirements. No Node server,
Supabase SDK, cron, queue worker or persistent process is required at runtime.
Archive work advances via Admin requests. CLI migration/restore/cleanup needs a
trusted operator environment; on no-SSH hosts the private SQL transfer above is
required. Shared-host limits may require smaller chunks or a different hosting
plan. Order Bank finalization uses one transaction and is a known duration risk.

## Production cutover checklist — all pending

- [ ] Live source schema/RPC/constraints/owners/Storage inventoried and mapped.
- [ ] Every row/field/count, relationships, duplicate/orphan scans pass in staging.
- [ ] All live KPIs, reports, charts, Readiness and Coverage match source results.
- [ ] Actual hosting isolation, HTTPS, cookies, quotas and load tests pass.
- [ ] Legacy Notes migrated with verified ownership and cross-user denial tests.
- [ ] Activation/recovery accepted; existing source password/session reset explained.
- [ ] Full backups of current production database and files restored successfully.
- [ ] Agreed write freeze; maintenance mode and all external writers paused.
- [ ] Final frozen export imported into a fresh candidate and fully reconciled;
      no data drift, source removals or post-export changes overlooked.
- [ ] Explicit production approval; reviewed release artifact, config and target.
- [ ] Switch frontend/API together on the PHP host; smoke-test roles, uploads,
      complete snapshots, Notes, report totals and logs before opening writes.
- [ ] Monitor real performance/errors and reconcile initial accepted writes.

The migration branch cannot auto-deploy via the existing workflow: branch-ref
and PHP-candidate guards prevent it. Production release needs a separately
reviewed deployment process. Never merge merely to obtain deployment.

## Rollback

Before cutover: retain baseline files, source Supabase service, existing Notes,
private complete backups and verified restore instructions. Do not decommission
or delete source data after cutover. Before target accepts writes, rollback can
restore the baseline frontend/config and point to the unchanged source. After
any target writes, first pause all writers, export those changes and reconcile
IDs/Notes/production records against source in a reviewed reverse migration.
Do not silently switch back and lose accepted writes. Restore files/database
only from verified private backups with explicit authorization. Quarter archives
exclude master/auth/session/Notes state and cannot replace a full backup.
