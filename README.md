# EKWL_Production_Planning_Dashboard
Production Planning on PHP/MySQL: https://littleboy.kesug.com/

## Live updates

`main` is the MySQL application used by the live root site. Open a pull request
for design, slide, calculation or backend changes. GitHub Actions validates PHP
and JavaScript, runs regressions, and checks the code-only deployment package.
After merging into `main`, the FTPS workflow updates `/htdocs/` automatically
when the three InfinityFree Actions secrets are configured. Missing credentials
fail visibly; a successful build alone does not establish a live deployment.

Server config, CSV data, private storage, `ekwl-staging` and the legacy
`ekwl-mysql` Notes module are preserved. The root site's existing config still
uses the protected configuration in `ekwl-staging`; do not delete that folder.
No SQL is executed automatically. Schema changes need a reviewed versioned SQL
migration and a private database backup before an operator applies them through
phpMyAdmin, followed by the compatible code release.

See [automatic deployment setup](docs/mysql-automatic-deployment.md).

## Order Bank CSV uploads

In Admin Settings → Upload Reports → Order Bank, select a CSV and choose
**Upload & Validate Order Bank**. Any positive number of source columns and data
rows is supported; future uploads can add or remove columns. The first CSV record
must contain unique, nonblank column names (case-insensitive uniqueness). Each
record must have the same number of cells as its header. Header-only or entirely
blank files are rejected.

All source cell strings, leading zeroes, quoted commas/newlines, delimiter-defined
blank records, and column order are retained. Header names are trimmed. The table
shows the current upload's columns; familiar filters and totals appear only when
the corresponding columns exist. Existing 40-column snapshots remain readable.

Uploads use isolated tokens and chunked requests, with progress and a final
CSV-to-SQL row-count check. Only a completely verified snapshot becomes latest;
historical snapshots remain stored. Uploads require an active admin. Viewing
requires an active admin or the `slide_14` permission. The live system uses the
existing MySQL schema. Retained Supabase SQL is historical reference; do not
run it against MySQL or reimport the initial installer for normal uploads.

Validation:

```sh
node tests/order-bank-upload.cjs
node tests/order-bank.cjs
node tests/loading.cjs
# Optionally validate the supplied reference file without adding it to Git:
node tests/order-bank-upload.cjs /absolute/path/to/Order\ Bank.csv
```

`tests/order-bank-import.sql` verifies SQL snapshot activation using an existing
active admin fixture and rolls back all fixture rows and batches.

## Planning refresh cache

On browser refresh, startup reads the completed-upload catalog and compares the
selected upload metadata with the cached snapshot. Matching complete snapshots
reuse their planning records and daily values for up to 15 minutes from the last
full fetch. The cache stamp includes the signed-in user, master line set, and
snapshot schema version. Legacy, incomplete, expired, or mismatched snapshots
are downloaded again. Normal app uploads create a new upload ID and invalidate
planning caches; selecting a new version fetches its details.

Direct SQL edits to detail rows might not change upload metadata. They become
visible on the next full fetch, including startup after the 15-minute reuse
window expires. The interval is checked on load, not by a background timer.
Explicit internal full reloads and successful planning uploads bypass reuse.
The Home status distinguishes a reused snapshot from freshly downloaded data.

Validation: `node tests/loading.cjs` covers version changes, expiry, ownership,
master lines, invalid caches, new uploads, forced loads, and session races.
`python tests/step1-browser.py` verifies actual reloads through sessionStorage
and IndexedDB with unchanged Home totals and no planning-detail requests.
