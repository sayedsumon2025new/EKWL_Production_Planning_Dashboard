# Load Analysis responsiveness

The loss model previously deduplicated and scanned the entire SAH dataset for every date/line/EWO record. It also rescanned plan and metadata arrays per record. On the instrumented synthetic 6,000-record / 12,001-SAH-row fixture, the old model took 19.588 seconds locally. The indexed model took 0.300–0.353 seconds with identical instrumentation. These are model timings, not live hosting or end-to-end guarantees.

The model now indexes the same source rows once, preserving first-record duplicate semantics, source ordering, exact existing arithmetic, mixed-color/SMV scope, signed adjustments and correction eligibility. Matching line/EWO/color scopes reuse immutable evidence results within one calculation; each date retains its own allocation and correction values. Date aggregation uses indexed records too.

The iframe previously constructed every evidence row even when the evidence panel was closed. It now creates no hidden evidence rows, and shows 100 records per page when opened. All model records remain available, including the last page. Date filters and corrections remain intact. Printing an open evidence panel temporarily includes all filtered evidence rows, then restores its current page.

Validation:

- Complete before/after model equality across five WIP selections, signed rows, duplicate SAH, mixed colors/SMVs and saved corrections.
- A large fixture bounds SAH source inspections (48,004 for 12,001 rows), checks 6,000 model records and reconciliation, and enforces a generous calculation budget to catch repeated whole-source scans.
- Browser tests verify closed-panel lazy rendering, all pagination boundaries and the last source row, full print evidence, existing correction behavior, filter arithmetic, reconciliation failures, owner/logout isolation and responsive tables.
- The existing loss-reason, evidence, department conservation and Gantt allocation tests remain in place. No SQL schema, data source, forecast definition or reconciliation rule changes.
