# Phase 1 — Step 2 report (frontend only)

Branch: `perf/step2-frontend`. Date: 14 October 2026 (UTC).

At branch creation, public main still pointed to `479090de208a15c90bbac6e4a17039cf84e550d7`. Following your explicit decision, the new branch starts there and imports approved Step 1 (`4b4162c` / `15726a2`, locally `affe0ec` / `10a146e`) before the Step 2 changes. Main was not changed. This report compares Step 2 with the approved Step 1 content.

## Changes

- `frontend-runtime.js`: shared lazy library promises, CDN-to-local fallback with an 8-second attempt timeout, 275 ms trailing text debounce with Enter/search-button flush and session/navigation cancellation, actual filter-render counters, and owner/session-scoped tiny-settings promises/results. Failed/superseded reads are not cached.
- `index.html`, `dashboard-main.js`, `dashboard-effects.js`: main runtime/effects moved to classic-script files. SDK → registry → shared-report helper → frontend helper → main → effects → bridges/modules execute in ordered `defer` scripts. Functions remain available to existing inline controls. The same early theme script remains synchronous and now runs just after metadata, before content can paint. Login stays disabled until runtime initialization, preventing clicks before the deferred SDK exists. Added preconnect to the existing Supabase origin. Updated changed-asset query strings.
- `dashboard-main.js`: `applyFilter()` renders Home or the current permitted slide once. Gantt popup and Order Bank select handling use stable container delegation. Search inputs are delegated once rather than recreating handlers with rows. Ladder, chassis priorities, chassis strengths, ABP and floor allocation reads share tiny-table results; saves invalidate their entries. Strength saves retain SQL count/value verification. Manual ladder/floor refreshes invalidate first. Boot invalidates settings before loading them and still waits for required configuration before planning filtering. Logout clears pending settings/debounce state.
- Screenshot entry points in `dashboard-main.js`, `gantt-hover.js`, `gantt-action-calendars.js`, `load-analysis.html`: await the shared html2canvas promise. Main and same-origin Load Analysis share the same loaded function. Standalone Load Analysis has its own lazy fallback. Existing target, width/height, scaling, clone adjustments, filenames, complete-table/report scope and clipboard-to-PNG behavior remain.
- `order-execution-plan.html`, `order-execution-bridge.js`: Three.js loads only in Factory/Risk 3D subviews. One promise handles overlapping opens. Animation loops cancel when the subview, parent Slide 16 or document is hidden and resume when visible. Original 3D templates are retained across snapshot refresh; obsolete renderers/resources are disposed before rebuilding. Parent visibility messages are checked against the actual frame/parent. Dev timing events from the opaque execution iframe are similarly source-checked.
- `three.min.js`: local fallback containing the same pinned r128 CDN release (603,445 uncompressed bytes). Existing local html2canvas is unchanged. No package/build server is introduced.
- Accessories/Size Set/Embellishment search functions now use 275 ms; readiness/coverage and other data searches use the same delegated delay. Execution text searches/calculators also debounce. Authentication, upload controls, numeric sliders and dirty/autosave state tracking keep their immediate handlers.
- Chassis canvas redraws with the already-refreshed Chassis tables on theme changes, preserving its palette/values. CSS files and theme preference logic are unchanged.
- Tests: `dashboard-source.js` lets existing semantic extraction tests read the split classic scripts; original assertions are retained. Added `frontend-runtime.cjs` and `step2-browser.py`. Browser search assertions wait for the debounce; the legacy Slide 02 range assertion targets its existing Slide 06 redirect rather than a removed DOM table.

## What loads when?

| Asset / read | Before (Step 1) | After |
| --- | --- | --- |
| html2canvas — main | On initial page parse | First PNG/image-copy/screenshot call |
| html2canvas — Load Analysis | When iframe document loads | First screenshot; same-origin frame shares main's promise/function |
| Three.js | When Execution iframe loads, even for 2D | First actual Factory/Risk 3D open |
| 3D animation | Continues once initialized | Runs only for the visible 3D subview in a visible parent/document |
| Ladder / chassis / strength / ABP / floor reads | Repeated boot/Admin/fixed-view calls | One in-flight/result per table key and user/session, until invalidation |
| Selected planning/report queries | Step 1 behavior | Unchanged; required configuration still precedes line filtering |

A failed CDN attempt tries the local file once. Concurrent callers share that entire promise; successful loads are retained. If both attempts fail, the promise is evicted so a later action can retry. CSV/text exports do not acquire image libraries.

## Measured and synthetic evidence

| Observation | Before | After | Evidence type |
| --- | ---: | ---: | --- |
| Initial `index.html` size | 502,192 bytes | 203,963 bytes | Actual uncompressed repository files; 59.4% smaller HTML |
| Main runtime / effects | Inline in HTML | About 295 KB / 5 KB separate files | Actual files; existing code is relocated, not eliminated |
| Heavy-library requests before any relevant action | Main html2canvas; iframe libraries on document open | 0 | Offline browser request interception |
| Concurrent main + Load Analysis image callers with forced CDN failure | Separate upfront main/iframe assets | 1 CDN attempt + 1 local fallback total | Offline browser + unit tests |
| Overlapping 3D opens with forced CDN failure | Upfront CDN dependency | 1 CDN attempt + 1 local fallback total | Offline browser + unit tests |
| Affected planning-slide renders in `applyFilter()` | 2 (plus hidden Home) | 1 | Source baseline and runtime render-count checks |
| Rapid search typing | Immediate / module-specific 150–160 ms | One render after 275 ms idle | Offline timer/browser assertions |
| Boot → repeated Admin/fixed Ladder/Chassis opens | Repeated tiny-table requests | 1 read each for ladder, chassis, strength and ABP | Offline browser counters; strength save adds the required fresh verification read |

One final offline Chromium run measured:

- Search render: **1.2 ms**, one render.
- `applyFilter()` render: **0.9 ms**, one render.
- html2canvas CDN-failure/local-fallback load: **20.8 ms**, two script attempts.
- Three.js CDN-failure/local-fallback load: **52.1 ms**, two script attempts.

These timings use mocked CDN failures/local HTTP and synthetic authenticated data. They do not establish live Supabase/network/first-paint gains. HTML size reduction also does not mean total cold JavaScript shrank: it is separately cacheable and a roughly 7 KB lifecycle helper was added. The new local Three.js fallback transfers only if needed. Compressed bytes and real production timings were not measured.

## Dev helper

Use `?ekwlPerf=1` or set `window.EKWL_PERF_ENABLED=true` before a load. Inspect:

```js
console.table(window.EKWL_TIMINGS);
console.table(window.EKWL_FILTER_RENDERS);
window.EKWL_FILTER_RENDER_COUNT;
```

Step 1 boot/Home/report measures remain. New measures are `filter.render`, `library.html2canvas`, `library.three`; Performance entries start `ekwl:`. Filters report actual renderer entry calls. Execution frame timings are tagged `frame: 'execution'`; the dev flag is passed when its iframe opens. No user IDs, credentials, input values or source cells are logged. Async dependency-waiting filters can report zero immediate renders; this is not a claim of zero later work or a paint measurement.

## Verification and limits

All **15 `tests/*.cjs` pass** (the original 14 plus the new frontend suite). All **six offline browser scripts pass**: Step 1 integration, Step 2 integration, navigation, stacked Gantt/popup, readiness/coverage, and the full **13-test theme suite**. They cover uploads/parsing/count semantics, permissions/logout, debounce/single-render behavior, library sharing/fallback/retry, early light/dark preference, SDK ordering, full Load Analysis PNG download, CSV output scope, settings save verification, 3D pause/resume and responsive/print presentation. External/API calls are mocked; no live login, upload, SQL or RLS test was performed.

Twelve core planning/quantity/feeding/Gantt/coverage helper bodies were also compared with Step 1 and are byte-for-byte unchanged. JavaScript syntax and `git diff --check` pass. Supabase files, SQL tests, CSS files, theme logic and the Supabase client URL/key/options are unchanged. The existing Node experimental TypeScript-stripping warning remains.

Remaining limits: tiny settings cache does not poll other devices; explicit refresh/reload or saves invalidate it. Deploy/revert the HTML and its new script files together. Both fallback files must remain beside the HTML. The existing Supabase SDK remains a CDN dependency; no new SDK version or fallback client was introduced. Real WebGL capability still depends on the user's browser/device. This step does not change full-report fetching, aggregation formulas, report pagination or database objects.

No SQL to run. No deployment or main-branch edit. **Stopped after Step 2 for approval.**
