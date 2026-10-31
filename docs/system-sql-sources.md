# System SQL sources and loading policy

All live modules read the application's MySQL database through authenticated same-origin PHP endpoints. Report uploads remain the upstream source of that database: this change does not connect an external ERP or certify the original business reports. CSV previews remain explicitly labelled local previews until the user completes an upload.

| Module | SQL source and loading path |
|---|---|
| Home, Order Table, Buyer Summary, Item/Style, EWO Detail, Plan/HW Charts, Chassis and Efficiency | One validated selected-upload read from plan_uploads, plan_records and plan_daily, reused by the planning views. |
| EWO Gantt and PSD action calendars | Verified planning renders first. Fabric, Sewing, Production and relevant follow-up sources use direct SQL reads. Unavailable stock does not produce verified coverage colors or forecasts. |
| Fabric & Cutting | Current active fabric/sewing/embellishment tables; fixed server projections and read permissions, one SQL cursor per raw report. |
| Admin parameters, ABP, ladder, chassis strengths and floor allocation | Small direct SQL settings queries, shared in-flight reads and bounded 60-second reuse. Saving invalidates affected settings. |
| Users / Account & Data | Existing SQL profile, permission, session, notes and import-management routes. Notes remain private to their owner. |
| Order Bank | One SQL cursor over the latest successful batch. Exact source headers and source_data cells are retained. Browser table pagination does not cause another full report download. |
| Order Execution | Current SQL Order Bank plus one selected-upload plan-record read with revision validation. Fresh SQL results take precedence over previously opened Order Bank UI rows. |
| Size Set Source, TNA Performance and Andon | One shared active Size Set SQL read; existing selected-plan, line, color and first-PSD rules remain. The iframe receives the same authenticated source rows. |
| Accessories and Embellishment | One active SQL read shared by the module and full-EWO follow-up consumers. Exact source columns, dates and spaces/newlines in headings are retained. |
| Load Analysis | Verified planning plus the same shared SQL stock and evidence readers, and owner/plan-scoped corrections. Arithmetic and source-evidence reconciliation remain in place. |
| Readiness Board / ready-input coverage | SQL sources feed the existing backend readiness engine. The board and coverage are calculated once per requested read instead of recalculating it for every HTTP page. Existing source-row budgets and slide_21 authorization remain. |

## Integrity and freshness

- Server table names, projections, filters and scope validation are fixed or allowlisted. Request JSON cannot enable internal cursor or full-derived-result flags.
- Scoped plan-record and readiness reads require a completed upload. Plan-record consumers validate its revision.
- Source reads complete within a repeatable-read transaction; incomplete JSON or count/version mismatch cannot become a successful dataset.
- Order Bank checks complete row receipts and rejects mixed batches. Order Execution validates flexible source cells against the declared headers before use.
- Successful in-session report/settings/view reuse expires after 60 seconds on the next access. It is not a background push subscription. A page reload starts fresh SQL verification; full reports are not restored from persisted browser blobs.
- Concurrent opens share in-flight reads. A module refresh cannot accidentally reuse an older fenced follow-up source. A newer full SQL source takes precedence over an older follow-up cache.
- Planning reconciliation uses one selected-upload grouped daily scan, retaining exact SQL decimal sums, source identities, missing/orphan/null checks and declared-count checks. It replaces repeated joins and correlated existence probes. Grouping the exact BIGINT expression avoids an ordered grouping walk over unrelated uploads. The streamed response keeps its original date/record ordering.
- Authenticated read-only queries release the PHP session lock after identity and CSRF validation. A long read does not retain that lock and queue other panels or tabs. Planning responses expose preparation duration in the authenticated `Server-Timing` header.
- Source upload invalidation, owner/session checks and failure eviction remain active. Read-only requests have a 60-second timeout; writes are not replayed by that timeout policy.

## Validation and practical limits

A local stress read also preserved all 900,000 exact decimal daily cells across 10,000 synthetic records (90 days) in 4.745 seconds; 90,000-cell runs took 0.457–2.495 seconds, including a run overlapping the larger fixture setup. These are local test measurements, not a production hosting SLA.

The synthetic PHP/MariaDB suite compares complete readiness output against the existing engine, checks exact 1,201-row Order Bank headers/cells, preserves 90,000 planning cells, tests selected-upload revision and permission denial, and confirms external API page limits cannot be bypassed through JSON. Browser checks exercise the real SQL-backed Order Bank, Order Execution and Readiness screens. Unit tests cover shared reads, expiry, invalidation, stale-global prevention and module-cache shortcuts.

This is a change to transport, source selection and cache lifecycle, not a rewrite of business calculations. Private production SQL timings, execution plans, source-file factual correctness and hosting capacity have not been measured. Extremely large datasets still incur transfer, browser-memory and computation costs. The existing derived-report source budget fails explicitly rather than silently truncating evidence.
