# Phase 1 — Step 1 report

Branch: `perf/step1-demand-reports`. Baseline: public main `479090de208a15c90bbac6e4a17039cf84e550d7`. Date: 14 October 2026 (Asia/Dhaka).

Step 1 separates raw shared-report reads from planning startup. Home renders its existing planning summaries after the required settings and selected planning snapshot. Planning record/daily queries and every calculation remain unchanged; this step adds no summary RPC, row filtering, pagination change, worker, or new database object.

## Changes

- `index.html`: planning boot no longer downloads Fabric/Cutting, Sewing I/O or Date Wise Production. One ABP read promise serves both startup consumers. Line priority, ladder, chassis strengths and master settings still finish before cache restoration / planning filtering. Saved tabs open after planning boot, with their own dependencies loaded separately. Direct Gantt/Fabric render handlers wait for their reports. Upload refresh invalidates report caches and waits only for the opened slide's dependencies. Logout clears the user before reset callbacks can start reads.
- `shared-report-loader.js`: one promise per report/user/session, complete-result publication, successful empty-result caching, invalidation guards, loading/error messages and opt-in timings. Same columns, ordering, 1,000-row pagination and transformations as baseline. Existing owner-checked sessionStorage/IndexedDB snapshots remain compatible and can supply complete cached fallback after a failed live read. New availability flags distinguish an unopened empty array from a verified empty report. Newly loaded visible reports are persisted through the existing cache functions.
- `gantt-action-calendars.js`: action/calendar rendering also waits for the Gantt report dependencies, including when its tab is clicked during initial loading.
- `tests/loading.cjs`: dependency request counts, baseline result parity, concurrent openers, empty caches, failed pages/retry, persistent fallback, permissions, session/invalidation races, settings-before-filter ordering and timing checks.
- `tests/audit.cjs`, `tests/gantt-multiple-ewos.cjs`: retain logout/render/number checks with the new lifecycle.
- `tests/step1-browser.py`: new fully mocked browser integration for actual startup, saved tabs, Home totals, Gantt/filter/action races, repeat visits, themes and logout.
- `tests/gantt-multiple-visual.py`, `tests/theme-visual.py`: fully loaded render fixtures are marked accordingly; the focused theme test uses mocked Supabase SDK/local screenshot library rather than relying on CDN availability.
- `PERFORMANCE_AUDIT.md`: preserves the approved Phase 0 audit. No existing SQL/migration or source data was changed.

## Which opened features fetch raw reports?

| Feature / logical slide | Raw shared reports loaded on first open |
| --- | --- |
| Home (0), Order Table (1), Buyer (3), Item (5), Feeding (6), Plan/HW charts (8), Chassis (10) | None |
| Gantt (7), its popups and action calendars | Fabric + Sewing + Production |
| Fabrics & Cutting (11), its filters/details | Fabric + Sewing; existing embellishment loader remains lazy |
| Admin/User (12/13), Order Bank (14), Ladder (15), Execution (16), Size Set (17), Accessories (18), Embellishment (19), Load Analysis (20) | None; their existing independent loaders remain |
| Readiness / Ready Input Coverage (21) | None in browser memory; existing invoker view/RPC and scalar cutoff query read database evidence |

The current registry has no standalone Sewing/Production slide. Subsequent visits reuse complete in-memory reports without more downloads. First opens of Gantt and Fabric can overlap and share Fabric/Sewing requests. Planning switches retain these reports. Successful generic upload refreshes and new boots invalidate them; unopened reports stay unfetched. This preserves the previous broad refresh freshness guarantee while avoiding unrelated downloads.

## Request counts and timing evidence

The loading fixture has 1,005 records for each of four planning criteria, three daily dates, and 1,001 rows in each shared report. Mock pagination/normalization uses the actual loaders.

| Observation | Before | After |
| --- | ---: | ---: |
| Home planning/data-loader requests (excludes settings/Auth) | 24 | 18 |
| Raw shared-report requests at Home startup | 6 | 0 |
| ABP startup requests | 2 | 1 |
| First Gantt open, after Home | Already downloaded | 6, deferred until needed |
| First Fabric open, after Home | Already downloaded | 4, no production download |
| Repeat shared-report visit / overlapping opener | No shared promise | 0 additional requests for completed/in-flight reports |

With the other settings included, that fixture's computed cold Home count is 30 → 23, excluding Auth/profile and active-slide extras. Live counts depend on actual table cardinalities. Total Gantt data volume is unchanged when Gantt is eventually opened; Step 1 removes it from Home's critical path.

One offline run with an artificial **25 ms per request**, using the dev helper and a wrapper around unchanged baseline boot:

| Measurement | Before | After |
| --- | ---: | ---: |
| Home first data render | 635.7 ms | 541.2 ms |
| Boot completion | 636.0 ms | 545.7 ms |
| Deferred report loads | Part of boot | Fabric 59.7 ms; Sewing 64.0 ms; Production 68.2 ms |

These are synthetic Node fixture timings, not production browser paint or Supabase measurements. They vary with scheduling/fixture processing and do not establish a live speedup. Live first paint, transferred bytes and real database/network times were not measured because no live credentials/project were used. Browser tests separately prove the saved Fabric tab works without issuing a Production request and Home renders unchanged totals (100 order / 300 plan in that fixture).

Enable timings with `?ekwlPerf=1` on the site, or `window.EKWL_PERF_ENABLED=true` before a load. Inspect `console.table(window.EKWL_TIMINGS)` or Performance measures starting `ekwl:`. Measurements include `boot`, `home.first-data`, `report.fabric`, `report.sewing`, `report.production`; report entries include request/row counts and loaded/cached/failed/discarded status. Home time ends after its data DOM render, not a browser paint event. Ordinary sessions record no timings; no credentials, user identifiers or source cells are logged.

## Verification and limits

All **14 `tests/*.cjs` pass**, including unchanged upload, totals, permissions, Gantt colours/SAH, date parsing, readiness and coverage semantics. Optional `DASHBOARD_BASELINE=/tmp/ekwl-step1-baseline.html node tests/loading.cjs` additionally compared complete planning/report state with original main and passed. Failed pages never publish partial data; stale requests cannot replace newer/session data.

Offline Chromium checks pass: Step 1 integration, central navigation, stacked Gantt entries/popups, readiness/coverage browser suite, and focused Fabric light/dark theme/filter regression. All relevant external/production requests were intercepted. JavaScript syntax and `git diff --check` pass. No live login/upload/export or real RLS/SQL test was performed; export implementations, layout CSS and SQL remain unchanged. The baseline Node experimental TypeScript-stripping warning remains.

Remaining limitations: each needed report still downloads its full accessible table using sequential pages; selected planning detail still loads exactly as before. Existing persistent cache can still be large. No data-version polling was added; cross-device changes follow the existing refresh/reload paths. First-ever Gantt/Fabric visit can show a loading message and, without a complete cached fallback, requires successful report reads. Persistent fallback is visibly marked as cached rather than fresh.

No SQL to run. No migration file, database mutation, deployment, main-branch change, or Step 2 work. **Stopped after Step 1 for approval.**
