# Final performance release report

Status: 17 October 2026 (Asia/Dhaka). **Publication verification in progress.**

## Release and backup

- Approved implementation: `0fa1996e6475ab7d7ff4a8d48aeaa3d99a67e79c` (Steps 1–3).
- OLD baseline source: `479090de208a15c90bbac6e4a17039cf84e550d7`.
- Main before this retry: `0910602c71899723555146299bc0d2c4fbed7b7e` (original runtime plus the prior rollback report).
- New branch: `release/performance-final-20261017`.
- Release PR: [#26](https://github.com/sayedsumon2025new/EKWL_Production_Planning_Dashboard/pull/26).
- Backup tag: `backup/pre-performance-20261017` at pre-retry main; original `backup/pre-performance-20261015` remains at `479090d`.
- Merge commit: `not merged yet`.
- GitHub Pages: legacy `main` / root deployment; awaiting deployment.

## Changes

- Step 1: lazy shared Fabric/Sewing/Production reports, shared in-flight reads, slide-specific restore dependencies, shared startup ABP read, retained configuration-before-planning filtering, dev timings. See [STEP1_REPORT.md](STEP1_REPORT.md).
- Step 2: lazy screenshot/3D libraries with local fallbacks, hidden-view animation pause, preconnect and safe defer order, early theme, single filter render, debouncing/delegation, tiny-settings cache. See [STEP2_REPORT.md](STEP2_REPORT.md).
- Step 3: indexed Gantt lookups/prefix sums, shared versioned Order Bank/module/calendar source caches, dependency-based invalidation, owner/session guards and request/cache/Gantt timings. See [STEP3_REPORT.md](STEP3_REPORT.md).
- This retry reapplies exactly the approved runtime implementation; no formulas, permission rules, export scope, CSS/layout, theme or source SQL were changed during publication preparation.

## Gates and limits

| Gate | Result | Evidence |
| --- | --- | --- |
| A: local quality | PASS | All 17 Node files; eight offline browser scripts; 19 root JS and three inline syntax checks; Pages-prefix assets/fallbacks, sensitive-pattern/version checks; diff whitespace |
| A: backup | PASS | Fresh dated backup tag pushed before release |
| B: fresh current pinned admin parity | PASS | Current OLD and NEW compared on the same completed planning upload, not the obsolete historical baseline |
| B: normal-user/account switching | INCOMPLETE, accepted publication gap | Automated normal-user Auth failed; owner explicitly authorized publication after disclosure. Real normal-user isolation is not claimed. Offline owner/session-generation tests passed |
| C: isolated write tests | SKIPPED, isolation unavailable | No existing preview branches; cost/provisioning prerequisites unavailable through the connector. No isolated resources created; no production write-flow substitution |
| D: live parity/slides/logout | PENDING | 0 permitted live slides opened; pinned comparisons and logout assertions |
| E: DB optimizations | Not reached yet; no SQL changes applied | Only evidence-backed additive indexes/ANALYZE are authorized; no RLS/functions/views/data changes |
| F: three-run native measurements | Not run yet | No general live speedup percentage is claimed without the requested medians |

## Current data parity

| Home metric | Current OLD baseline | NEW (candidate/live) |
| --- | ---: | ---: |
| Total Order Qty | 1,771,697 | 1,771,697 |
| Total Plan Qty | 1,019,514 | 1,019,514 |

| Feature | Current pre-merge comparison | Live comparison |
| --- | --- | --- |
| Home | EXACT MATCH | pending |
| Planning and shared sources | EXACT MATCH | pending |
| Core tables | EXACT MATCH | pending |
| Gantt conditions and filters | EXACT MATCH | pending |
| Fabrics match and not-in-plan | EXACT MATCH | pending |
| Chassis | EXACT MATCH | pending |
| Ladder | EXACT MATCH | pending |
| Order Bank | EXACT MATCH | pending |
| Size Set | EXACT MATCH | pending |
| Accessories | EXACT MATCH | pending |
| Embellishment | EXACT MATCH | pending |
| Readiness and coverage | EXACT MATCH | pending |
| Order Execution | EXACT MATCH | pending |

The pinned upload identifier stayed in test-process memory and is omitted. Complete source arrays were compared using browser-computed hashes; only equality results and aggregate values were saved. Gantt comparison includes stacked cell payloads/text/classes, all four material conditions, toggle, EWO/line/date filters and earlier/hidden demand. Normal slide-open Readiness/Coverage reads were verified to complete with HTTP 200 before comparing complete rows/KPIs; the probe did not add stress refreshes.

Local OLD/NEW functional probes suppressed only prefetch of unselected historical planning versions, which populates their cache without changing the selected snapshot. All selected rows/columns and all Gantt cases remained checked. These are functional probes, not startup performance measurements. LIVE startup was left unchanged. Earlier live comparisons also covered another planning selection, popup sources, admin read-only views, and local CSV/PNG/Excel exports (CSV 107,100 bytes; PNG 1,232 × 911; Excel 18 × 14 cells, 18,059-byte files). Those older export/secondary-selection checks are historical, not fresh measurements on today's data.

## Probe corrections and observed backend risk

Initial broad probes overloaded reads by refreshing readiness/coverage again after opening the slide, and historical planning prefetch delayed the functional gate. Transient PostgreSQL statement timeouts were observed; they are not evidence of a formula difference. A small actual slide-open probe returned 275 readiness and 37 coverage rows with no HTTP errors. The final probe checks the real opener's completed requests and full outputs. Native Chromium uses the managed public CA with TLS verification enabled.

Automatic approval review rejected an earlier proposed reduction of test cases. That reduction was not executed. All Gantt conditions were retained; the safer verifier proves the actual board and coverage HTTP reads and their completed data before comparison.

## Measurements

A single real-data functional Gantt batch took OLD **95.463 s** and NEW **0.710 s** on already-loaded report inputs. Both run the same condition/filter/toggle batch; timing includes DOM construction, hash serialization, protocol overhead and an idle-detection tail. This is not a first-open metric or a three-run median and must not be generalized to overall site speed.

Requested OLD-vs-NEW-live cache-disabled three-run medians (unthrottled and declared Fast 4G + 4× CPU) are pending. No synthetic values are substituted.

## Live smoke and rollback

Live asset check: pending. Live console/page/HTTP/request/write-guard error counts: `{}`. Logout state cleared: `pending`.
Any logout/teardown aborts are recorded separately and are not silently reclassified as successful requests: `[]`.

If the new deployment or smoke fails, revert this actual merge without rewriting history:

```sh
git revert -m 1 ACTUAL_NEW_MERGE_SHA --no-edit
git push origin main
```

GitHub UI path: repository → Pull requests → merged PR #26 → Revert. Wait for Pages redeployment and check the restored site. Do not apply an already-completed rollback twice.

The prior attempt merged as `af16ab3fc21c1a2309837ae2d9d465ff62779243` and was reverted as `0bdee0b6a7d1be5e53ad12ec3a929d5bf9270064` because its 15 October Home baseline (1,214,062 / 609,894) no longer matched 17 October data. Restored OLD returned the same current totals as NEW (1,771,697 / 1,019,514). This retry uses a fresh pinned comparison instead of assuming historical values remain current.

## Database and next steps

No SQL, indexes, ANALYZE, user/settings changes or production uploads were applied during frontend publication verification. Existing import/read-access migrations were not rerun. Additive optimization diagnostics and any exact rollback SQL will be documented separately if that phase completes.

No secret values, emails, production row samples, private identifiers or tokens are included in these reports. Remaining known limits include unverified normal-user production isolation, skipped isolated uploads/settings/user-write flows, independent-device cache freshness requiring existing refresh controls, and any backend statement-timeout recurrence. Home summary RPC, server-side Order Bank paging/facets and RLS wrapper changes remain proposals, not implemented changes. Rank future work from measured results when available; do not invent impact percentages.
