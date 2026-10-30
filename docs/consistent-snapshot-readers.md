# Consistent snapshot readers and data-quality boundaries

The dashboard's authority is the selected completed MySQL upload and the current active report snapshots. This change does not certify the original business reports and does not change WIP allocation, process-routing, SMV or evidence-based loss-reason rules.

## Planning

`POST planning/snapshot` uses the same signed-in session, CSRF/origin validation and `home` read permission as ordinary planning queries. One repeatable-read transaction reads metadata, audits source/daily counts, checks source-row continuity and uniqueness, rejects orphan/null/missing daily cells, and reconciles non-summary Plan/Day, SAH/Day and Clock Hour/Day stored totals against exact SQL decimal sums. Effi/Day is excluded from sum reconciliation because a percentage total has different semantics.

A mismatch returns 409, including source row and criterion for total mismatches. The frontend does not fall back to an unverified path. It checks plan/revision/counts/completion, duplicate IDs/daily keys, dates and finite numeric values before publishing a plan. Metadata and derived arrays are published together. A failed switch retains prior facts internally but hides plan-dependent content; it cannot present previous data under the new selection.

Daily values are streamed as `[record_id, plan_date, decimal_text]`, preserving SQL decimal text and the existing date/record ordering. The PHP cursor is unbuffered, and gzip is negotiated when supported. This bounds PHP buffering and avoids many HTTP round trips. It is not a server-side aggregation rewrite: the browser still calculates the existing dashboard views.

## Other reports

`POST reports/snapshot` accepts six fixed dataset names: fabric, sewing, production, size, accessories and embellishment. It delegates authorization, column selection and active-head filtering to the existing query policy. A single unbuffered SQL cursor runs in a repeatable-read transaction, so activation during the read cannot mix batches. This also avoids repeated OFFSET scans inside the server request. Headers, source rows and evidence fields selected previously are preserved.

The client requires a complete row-count receipt. Live failure does not mark cached data ready for fresh calculations. Successful shared/module reads expire after 60 seconds on the next access. Owner/session guards and explicit upload invalidation remain in place. These caches are not push subscriptions; a view already open does not automatically observe another user's new upload.

## Cold starts and failure

Persisted report values are not shown before live verification on reload. Only a small selected-upload preference is reused. Previously validated in-session plan reuse is bounded to 60 seconds. Full reports are no longer serialized to sessionStorage or cloned into IndexedDB on render; only the selected upload ID is persisted. Legacy cleanup helpers remain, but live boot never invokes the old report restore functions. Read-only requests time out after 60 seconds and cannot publish partial JSON. Writes are not retried or aborted by the new read timeout policy.

## Validation and limits

Synthetic MySQL tests compare 90,000 cells from the new one-request reader against all legacy query pages, preserving every value and order. They exercise gzip, counts, exact totals, authentication/CSRF, report permissions and a 1,201-row report across internal pages. A real PHP/MySQL browser test verifies cold boot, no plan-detail paging, error hiding, recovery and logout. These tests run in CI before automatic deployment, in an isolated database with generated test credentials.

This proves consistency and the documented checks against database contents. It does not prove that an original report is factually correct, that two differently dated business reports describe the same physical stock, that a matching reason caused the SAH loss, or that hosting/network speed meets a universal latency guarantee. Private MySQL-to-original-report reconciliation remains pending access to matching original reports and the actual database export/session.

## Progressive Gantt display

The Gantt planning grid does not wait for the independent Fabric, Sewing and Production reads. Verified plan rows, dates and filters appear immediately. Coverage colors and stock-bearing popup buttons remain unavailable until those reports complete; forecast/stage totals stay unknown while required reports are pending or failed. A failed WIP read retains the planning grid and can be retried by reopening/filtering the view. Other report-dependent views retain their blocking validation behavior. Closed summary panels do not run full-plan allocation; opening the summary or lower stock details computes the same existing figures after source checks.
