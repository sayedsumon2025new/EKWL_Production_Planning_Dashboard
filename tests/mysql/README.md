# Isolated migration tests

These tests create users/data and some delete **local synthetic historical rows**.
Never configure them for production or a hosted staging dataset. Use a clean
checkout, Docker, Python 3, Node, Playwright and Chromium `/usr/bin/chromium`.
A trusted test operator needs Docker access; no production credentials required.

1. `python tests/mysql/start-runtime.py` creates PHP 8.2 and MariaDB 10.11 on a
   private Docker network, loopback port 18080 and random ignored local config.
   It refuses existing config/fixture containers. Docker may need the environment
   proxy/CA setup described by your managed cloud runtime. No fixed passwords.
2. `python tests/mysql/new-fixture.py` creates a NEW test DB and Admin (never drops
   an existing DB); private `/tmp/ekwl-test-auth.json` holds test credentials.
3. Run `python tests/mysql/source-schema.py` and
   `python tests/mysql/master-contracts.py /tmp/ekwl-test-auth.json`, then
   `python tests/mysql/api-integration.py /tmp/ekwl-test-auth.json`, then
   `python tests/mysql/browser.py /tmp/ekwl-test-auth.json`,
   `python tests/mysql/storage.py /tmp/ekwl-test-auth.json` and
   `python tests/mysql/archive-integration.py /tmp/ekwl-test-auth.json`.
   Use a fresh fixture before re-running the suites to avoid duplicate users/jobs.
4. `python tests/mysql/postgres-oracle.py` starts local PostgreSQL 17, runs original
   repository SQL fixtures and compares PHP every-field results. Then run
   `python tests/mysql/derived-database.py` for actual MySQL loader comparisons.
5. Install `tools/mysql/requirements-export.txt` in a private Python environment,
   then `python tests/mysql/source-pipeline.py` validates export/import/reconcile,
   Notes ownership import and offline SQL Admin bootstrap using synthetic PG.
6. `docker exec ekwl-migration-api php tests/mysql/performance.php` measures
   synthetic CLI insertion of 100,000 rows; run after browser/archive checks.
7. Run each `tests/*.cjs` and `tests/mysql/api-client.cjs` with Node; lint PHP
   implementation/tools/tests with `php -l`, and JS with `node --check`.

`tools/mysql/dev-router.php` is only a built-in-server test router enforcing
protected paths; production uses Apache .htaccess, which requires hosted tests.
Containers/databases/config/exports are deliberately not automatically deleted.
Stop the three `ekwl-migration-*` containers when finished; inspect private output
before any explicit cleanup. Do not commit ignored configuration or fixture data.

`python tests/mysql/offline-admin.py` verifies the local-only initial-Admin SQL helper against fresh isolated databases. Passwords and generated SQL remain in private temporary files; no real account is touched.
