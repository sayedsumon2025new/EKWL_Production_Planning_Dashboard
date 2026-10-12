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
