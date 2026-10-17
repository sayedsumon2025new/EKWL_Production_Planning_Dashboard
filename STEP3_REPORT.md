# Phase 1 — Step 3 report (frontend only)

Branch: `perf/step3-indexed-caches`. Date: 15 October 2026 (Asia/Dhaka).

At branch creation, GitHub main still pointed to `479090de208a15c90bbac6e4a17039cf84e550d7`; it did not contain the approved Steps 1/2. This branch starts from that main and imports the approved audit, Step 1 and Step 2 commits before Step 3 (local imported commits `aaacff0`, `07bb53f`, `b7879eb`). Main was not changed. Comparisons below use the approved Step 2 implementation, not pre-Step-1 main.

## Changes

- `dashboard-main.js`: Gantt calculation indexes are built once for the current source-array versions, selected planning upload, master-line configuration and signed-in owner/session. Source replacement, appended rows, explicit invalidation or a different owner/session rebuilds them; visible filters reuse them. The index covers Plan/Day cells and colors, monthly clock totals, SMV/color fallbacks, Line/EWO sewing, all-line EWO input, exact production cells, EWO fabric totals, exact-color comments and informational colors. Cumulative demand is accumulated once in the original sorted order after the global production cutoff, then looked up by Line/EWO/date. No subtraction of large prefix totals changes floating-point addition order.
- The Gantt still sums legitimate PO/color allocations, suppresses duplicate record_id/date rows, stacks every planned EWO, and keeps hidden EWOs/earlier dates in demand. WIP → cutting → cutable → shortage priority, the global cutoff (including zero-quantity report rows), normalizers, popup payloads, source-row counts and all existing filters remain. No worker or chunked rendering was added: indexing removed the measured repeated-scan bottleneck in the synthetic fixtures.
- New `data-cache.js`: shared versioned promises/results for the latest Order Bank snapshot and active Size Set/Accessories/Embellishment rows. Successful empty arrays are cached. In-flight operations, refreshes and consumers share the read; errors are evicted for retry. Entry identity plus owner/session checks prevent superseded requests from publishing or deleting newer results. Upload invalidation also advances consumer tokens. Logout clears rows, versions, snapshot fences and the Gantt index.
- `order-execution-bridge.js` and `dashboard-main.js`: both Order Bank consumers use that loader, in either opening order or concurrently. It retains the existing Order Bank `select('*')`, first-page latest view, source-row ordering, subsequent raw-table batch pinning, mixed-batch rejection and complete pagination. Flexible source-column/cell validation and display mapping remain in the Order Bank slide. Execution retains its existing choice of already-mapped Order Bank rows when available; otherwise it uses the shared raw rows. Its planning queries/formulas are unchanged.
- `size-set-module.js`, `accessories-module.js`, `embellishment-module.js`: retain their existing module projections, active-row filters, ordering, pagination, previews, atomic staging/finalization and SQL row-count checks. Parallel opens share reads. Fabrics and Slide 19 consume the same embellishment array, including an empty result; a refreshed cache must also replace an older displayed array.
- `gantt-action-calendars.js`, `gantt-hover.js`: one owner/session-scoped source cache supplies Size Set/Accessories/Embellishment and Order Bank evidence. Print/EMB use the same seven movement columns and source promise. A popup reuses an already-available all-source/module superset, otherwise it queries only its exact EWO. PSD reuses matching source entries. Distinct query scopes can still require separate reads; a single-EWO popup does not download an entire table to populate a future calendar. Source results and derived popup/calendar results retain a 60-second validity window. Explicit calendar refresh clears derived entries and bypasses the same fresh module snapshot so it really rereads SQL. Date parsing is unchanged.
- `dashboard-main.js`, `data-cache.js`, `ewo-readiness.js`: successful uploads now invalidate the dependencies listed below. Only a planning upload reloads planning. Readiness can refresh without refreshing coverage when the upload changes only readiness evidence; opening the slide still loads both as before. Relevant report-cache availability flags are persisted so an invalidated report cannot be restored as current after reload.
- `index.html`: registers the new helper in the existing ordered deferred chain and updates modified asset versions. SDK/auth/theme order, CSS/layout and export entry points are unchanged. The supported Supabase `global.fetch` option delegates arguments/results to the existing native fetch while counting requests in dev mode; auth/client URL/key/options otherwise remain unchanged.

## Dependency invalidation

| Successful upload | Invalidated/refreshed dependencies | Reused |
| --- | --- | --- |
| Planning | Planning versions, Gantt index, derived popup/calendars, Execution render state, readiness, coverage | Fabric/sewing/production reports and independent active snapshots |
| Fabric | Fabric report, Gantt index, derived popup/calendars, readiness, coverage | Planning, sewing/production, module snapshots |
| Sewing | Sewing report, Gantt index, derived popup/calendars, readiness, coverage | Planning, fabric/production, module snapshots |
| Production | Production report, Gantt index, derived popup/calendars, coverage | Planning, fabric/sewing, readiness, module snapshots |
| Order Bank | Order Bank snapshot/source, derived popup/calendars, Execution render state | Planning, all shared reports, grid index, readiness/coverage |
| Floor | Floor allocation settings/read | Planning, all shared reports, independent snapshots and readiness/coverage |
| Size Set | Size Set snapshot/source, derived popup/calendars, readiness | Planning, shared reports, grid index, coverage, other snapshots |
| Accessories | Accessories snapshot/source, derived popup/calendars, readiness | Planning, shared reports, grid index, coverage, other snapshots |
| Embellishment | Embellishment snapshot/source, Fabrics movement rows, derived popup/calendars, readiness, coverage | Planning, shared reports, grid index, other snapshots |

This matrix follows the repository's current frontend and readiness/coverage SQL definitions, read without modification. Order Bank and Floor are not inputs to those SQL readiness/coverage calculations. The current Gantt grid's material quantities use fabric/sewing/production evidence, not embellishment movement rows. Invalidation refreshes affected visible consumers; unopened consumers load on demand. Floor's existing Admin read is refreshed after its save.

## Measured and synthetic evidence

| Observation | Step 2 baseline | Step 3 | Evidence |
| --- | ---: | ---: | --- |
| Gantt cold calculation + generated DOM, 2,500 plan rows | 858.0 ms | 52.1 ms | Same synthetic Node VM fixture; frozen old renderer vs current renderer |
| Gantt repeated render, same fixture | 829.1 ms | 30.1 ms | Same fixture; new index reused; about 27.6× faster in this run |
| Gantt index build alone, same fixture | Included in every render | 20.2 ms once | Dev timing helper in Node VM |
| Execution → Order Bank, or simultaneous openers | Two full snapshot downloads possible | One per cached version | Baseline source paths; actual offline browser open sequences and unit pagination tests |
| Order Bank → Execution → Order Bank | Two snapshot downloads | One | Baseline source paths and offline browser counters |
| Concurrent module opens / reopening an empty active snapshot | Duplicate/repeated reads | One / zero additional reads | Unit + real offline browser fixtures |
| Fabrics → Slide 19 embellishment | Two active-snapshot reads | One shared read | Baseline source paths; offline browser checks array identity and read count |
| Print + EMB cold source reads | Two identical movement-source reads | One | Offline browser query counters, 60-second TTL tests |
| Order Bank / Floor upload on Home | Planning reload and broad invalidation | Zero planning/report reads; Floor rereads its setting | Real refresh function + offline browser counters |

The frozen renderer is in `tests/fixtures/gantt-before-step3.js`. The parity suite compares complete DOM/encoded payload output on identical data: **35 cases**, covering the existing multiple-EWO fixture, all four coverage states, hidden/earlier demand, PO/color sums, SMV/color fallback, normalized EWO values, duplicate/missing record IDs, decimal quantities, literal separators, filters, owner/version changes, generated fixtures and the larger timing fixture.

One final offline Chromium run with **two plan cells across 47 displayed master lines** measured `gantt.build` **0.3 ms**, initial `gantt.render` **2.1 ms**, then cached renders **2.0 / 1.1 ms**. `gantt.render` includes index acquisition/build when needed and DOM string construction/insertion; it does not measure completed paint. These are synthetic timings, not production speed guarantees. Baseline request counts above describe existing code paths, not a recorded live Supabase session. The browser stub counts actual fixture queries but bypasses the real SDK transport, so its requests are not represented by the native-fetch dev counter.

No live credentials/project access was used. Live per-slide latency, production bytes transferred, compressed sizes, first paint and real-network before/after timings are unmeasured. The new shared helper is about **9 KB uncompressed**; the indexes trade session memory for repeated CPU work.

## Dev helper

Enable `?ekwlPerf=1` before opening the dashboard. Existing boot/Home/report/filter/library measures remain. Added `gantt.build`, `gantt.render`, `cache.hit`, `slide.open` in `window.EKWL_TIMINGS` and matching `performance` entries.

```js
console.table(EKWL_TIMINGS.filter(t => t.name.startsWith('gantt.')));
console.table(EKWL_TIMINGS.filter(t => t.name === 'cache.hit'));
console.table(EKWL_SLIDE_OPENS);
console.log(EKWL_DATA_REQUEST_COUNT);
```

`EKWL_SLIDE_OPENS` records requests issued and cache hits while each opening is visible; it continues accumulating for that opening as asynchronous work starts. The fetch counter includes Supabase paging, RPC, writes and auth traffic through this client; it excludes static assets and separate iframe-owned clients. Requests already issued before navigation belong to the earlier opening; this is an observation window, not dependency attribution. `slide.open` marks navigation, not a completed-load duration. Cache-hit records omit EWO/query values and user identifiers. Dev logs are in memory only.

## Verification and limits

All **17 `tests/*.cjs` pass** (15 from Step 2 plus `data-cache.cjs` and `gantt-index-parity.cjs`). All **seven offline browser scripts pass**: Steps 1, 2 and 3 integration, navigation, stacked Gantt/popup, readiness/coverage, and the full **13-test theme suite**. The new tests cover both Order Bank opening directions/concurrency, module empty/concurrent reads, shared Fabrics/Slide 19 rows, Print/EMB/popup reuse, explicit source refresh, all nine upload invalidation types, TTL, error/retry/invalidation/logout races, and dev timing/counters. Existing semantic total, role, upload, source-cell, pagination and race assertions remain.

Fourteen core planning/quantity/feeding/Gantt-condition/Fabrics/cache-capture/import helper bodies were compared with Step 2 and are byte-for-byte unchanged. JavaScript syntax checks and `git diff --check` pass. Supabase files, SQL tests, CSS, theme code, export implementations and library assets have no changes. The existing Node experimental TypeScript-stripping warning remains.

All browser API calls are mocked. Live CSV uploads, login/role/RLS checks against your project, production-scale DOM/paint behavior and other-device uploads remain for manual verification. No polling or DB metadata was added: independent snapshot caches remain valid for this owner/session until refresh/upload invalidation; EWO sources have their 60-second TTL. An already-open view does not refresh automatically when another device uploads. Gantt versions use replaced arrays/lengths plus explicit invalidation; any future same-length in-place source edit must call `invalidateGanttIndex()`. Larger real datasets may still need rendering work, which should be measured before adding a worker/chunking.

Deploy/revert the changed frontend files together, including `data-cache.js`; no database rollback is needed. **No SQL to run, no Supabase object/data changes, no deployment or main-branch edit. Stopped after Step 3 for approval.**
