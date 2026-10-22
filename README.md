# EKWL_Production_Planning_Dashboard
Planning Analysis

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

Uploads use isolated tokens and 500-row requests, with progress and a final
CSV-to-SQL row-count check. Only a completely verified snapshot becomes latest;
historical snapshots remain stored. Uploads require an active admin. Viewing
requires an active admin or the `slide_14` permission. SQL setup is in
`supabase/order-bank-flexible-import.sql`; the read-policy repair is in
`supabase/order-bank-read-access.sql`. These changes have already been applied to
the configured project through Supabase migration history; do not rerun them.

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
