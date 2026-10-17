# Performance release report — deployment reverted

Status: 17 October 2026 (Asia/Dhaka). **The performance release was merged and deployed, then reverted under the required smoke-failure rule. The live application has been restored to the original implementation. Restored-site verification completed: login, all 19 permitted slide openings, current Home totals and logout passed; the network limitation below remains recorded. No database optimization was applied and no live speedup is claimed.**

## Release identity and authorization

- OLD/original main: `479090de208a15c90bbac6e4a17039cf84e550d7`.
- Approved Steps 1–3 source: `0fa1996e6475ab7d7ff4a8d48aeaa3d99a67e79c`.
- Release branch: `release/performance-steps-1-3`; merged head `56af15b06bdea0068d985aadbfd8faf9c888de2d`.
- Backup tag: `backup/pre-performance-20261015`, pushed at original main. It was not moved.
- Release PR: [#25](https://github.com/sayedsumon2025new/EKWL_Production_Planning_Dashboard/pull/25).
- Actual merge commit: `af16ab3fc21c1a2309837ae2d9d465ff62779243`.
- Actual rollback commit: `0bdee0b6a7d1be5e53ad12ec3a929d5bf9270064`.
- GitHub Pages uses legacy branch deployment from `main`, repository root. Both the release build and subsequent rollback build reported `built` with no build error.
- Automated normal-user authentication failed. After being informed of that unresolved test gap, the owner explicitly instructed publication ("ok ache tumi live koro"). That instruction waived the outstanding normal-login pre-merge gate; it did not establish normal-user parity. Smoke-failure rollback requirements remained in force.

## Change inventory (all runtime changes reverted)

- Step 1: shared Fabric/Sewing/Production reports became lazy, in-flight reads were shared, saved-slide dependencies were scoped, duplicated startup ABP reads were removed, configuration ordering was retained, and dev timings were added (`shared-report-loader.js`, main startup and tests).
- Step 2: libraries became lazy with local fallbacks; Three.js animation paused when hidden; early theme/deferred dependency order was preserved; Supabase preconnect, single filter render, debouncing, delegated handlers and small-settings read caching were added (`frontend-runtime.js`, `dashboard-effects.js`, extracted `dashboard-main.js`, main/iframe HTML and tests).
- Step 3: indexed Gantt lookups/prefix calculations, shared versioned Order Bank/module/calendar sources, dependency invalidation and cache/request/Gantt timings were added (`data-cache.js`, main, bridge/module/calendar/hover/readiness/coverage files and parity/invalidation tests). No SQL was included.
- Release preparation added `tests/release-assets.py` and checkpoint documentation. The rollback removed the complete release tree change. This final report is the only newly retained repository file after rollback; the approved implementation/reports remain available in PR #25 and release-branch history.

## Phase results

| Phase | Result | Evidence / limitation |
| --- | --- | --- |
| A: pre-merge quality | PASS | All 17 Node files and all eight offline browser scripts passed on the merged source; all 19 root JS syntax checks, three inline-script checks, asset/version/fallback/Pages-prefix checks and composite whitespace checks passed |
| A: backup | PASS | Tag at original main verified immediately before merge; main had no newer commits to integrate |
| B: admin live-data parity | PASS for listed checks | OLD vs NEW read-only comparisons on latest and another completed planning selection, listed below |
| B: normal-user / account switching | INCOMPLETE; accepted publication gap | Production Auth rejected supplied normal-user login, including an actual live-form check in a fresh native browser context. Four application/Auth accounts existed: one active admin and three active others. Admin was not represented as normal |
| C: isolated write tests | SKIPPED (isolation unavailable) | No existing development branches. Linked organization is on the free tier; connector cost/provisioning prerequisite returned tool-unavailable errors. No isolated branch/project could safely be provisioned. No temporary resources or credentials were created; production was not substituted |
| D: merge / deploy | COMPLETED, THEN REVERTED | Release merged normally through PR #25; Pages built. Post-deploy Home totals did not match the recorded Phase B baseline; immediate normal revert was committed and pushed, and Pages rebuilt the original application |
| D: restored smoke | PASS WITH NETWORK LIMITATION | All 20 restored assets match original source; admin login, current Home baseline, 19 permitted slide openings and logout passed. Zero console/page/HTTP errors; one request failure appeared during logout/teardown and its classification was not retained |
| E: DB diagnostics/indexes | SKIPPED AS REQUIRED AFTER ROLLBACK | No index, ANALYZE, migration, RLS, function, view, constraint or data change was applied |
| F: OLD vs NEW-live benchmark | NOT RUN | NEW was removed from the live site at the mandatory rollback gate; no three-run native medians or percentage improvement are asserted |

The eight offline browser scripts cover Step 1/2/3 integration, navigation, multiple-EWO Gantt/popup, readiness/coverage, the full 13-test theme suite, and release assets. Source/query and permission semantic checks were retained. No business source was changed during release preparation.

## Real-data parity before publication

Comparisons kept rows inside browser memory and exported equality flags/aggregate counts only. Latest and a second planning selection were checked. The following admin comparisons passed:

| Feature | Result / scope |
| --- | --- |
| Home; planning/daily/SAH/clock/buyer sources | Exact KPI/preview and source-hash equality |
| Order Detail, Buyer, Item, Feeding | Exact rendered tables, footers and KPIs on both selections |
| Gantt | Exact canonical payload/text/color/header equality: stacked cells, four condition filters, toggle, EWO/line search and narrower dates on both selections |
| Gantt popup | Actual source evidence matched for representative available conditions |
| Fabrics & Cutting | Exact tables/totals for Plan EWO match and Not in Plan, both selections |
| Chassis / Ladder | Exact tables and applicable KPI output |
| Order Bank | Complete loaded rows/columns and filtered table/total equality |
| Order Execution | Exact numeric summary fields in actual isolated iframe |
| Size Set / Accessories / Embellishment | Complete active source rows plus settled table/KPI equality |
| Readiness / Ready Input Coverage | Complete SQL-result and rendered-output equality, both selections |
| Admin/User read-only views | Settings/user tables and slide-access decisions matched; no save/edit control was used |
| Local exports | CSV byte hashes matched (107,100 bytes); Chassis PNG scope/dimensions matched (1,232 × 911 px); PSD Excel worksheet XML matched (18 rows × 14 columns, 18,059-byte files) |
| Normal-user permission and same-session cross-user isolation | Incomplete on production; normal-user Auth failed. OLD admin logout cleared planning/shared-report/Order Bank arrays; a real completed two-account check was not claimed |

Active module row counts at the earlier parity checkpoint were Size Set 8,099; Accessories 224; Embellishment 6,765, identical OLD/NEW. There were 11 completed planning selections then. These are historical aggregates, not assertions about today's snapshot.

Two original comparator artifacts were corrected without application changes: redundant native-button attributes in OLD Gantt HTML, and a loader race when the probe called module loading before the delayed slide opener began. Canonical Gantt and settled-source comparisons subsequently passed. Later focused functional probes suppressed unrelated historical prefetch only in their test runtime; they were not performance measurements.

## Post-deploy failure and rollback

All 27 referenced live assets returned HTTP 200, correct content types and byte content matching the release, including cache-busting URLs, iframe HTML and local library fallbacks. The native Chromium login shell passed with no console/page/request/HTTP errors. Admin sign-in and boot completed with zero recorded console/page/HTTP/request errors and zero blocked production writes.

The first numeric smoke gate then failed:

| Home metric | Recorded OLD baseline, 15 October | NEW live, 17 October |
| --- | ---: | ---: |
| Total Order Qty | 1,214,062 | 1,771,697 |
| Total Plan Qty | 609,894 | 1,019,514 |

Restored OLD on 17 October also returned **1,771,697** order quantity and **1,019,514** plan quantity, exactly matching the current NEW totals.

The check was stopped before opening other slides on NEW. This is an observed baseline mismatch; it alone does not prove a formula regression. Production data or the latest selected snapshot may have changed during the two-day interval. The relevant path is Home's selected-planning snapshot/filter aggregation (`renderHome` / `getFiltered` and unique-order grouping). The restored OLD implementation returned exactly the same current Home totals as deployed NEW: Total Order Qty 1,771,697 and Total Plan Qty 1,019,514. This supports a stale historical baseline or changed latest selection/data, rather than a demonstrated NEW-only formula regression. It is not a full fresh pinned-snapshot parity suite. The mandated rollback remains in place. No production upload, data replacement, user/permission/settings change or writing RPC was used by these probes.

The rollback was performed immediately after the failing smoke result, without force-push or history rewriting:

```sh
git revert -m 1 af16ab3fc21c1a2309837ae2d9d465ff62779243 --no-edit
git push origin main
```

It produced rollback commit `0bdee0b6a7d1be5e53ad12ec3a929d5bf9270064`. Before adding this report, the complete restored tree was byte-identical to original main (`git diff 479090d HEAD` was empty). GitHub UI path for a future code rollback is repository → Pull requests → merged release PR → Revert; this rollback has already been applied, so do not apply it twice.

## Restored-site verification

The rollback Pages build completed successfully. All 20 referenced restored assets returned HTTP 200 with matching original contents and expected content types. Native Chromium signed in as admin, opened all 19 permitted logical slides (including both iframes, Order Bank, modules and readiness/coverage), and signed out successfully. Current Home totals matched deployed NEW exactly. No console errors, page exceptions, HTTP failures or blocked production writes were observed.

One request failure was recorded during logout/teardown after the final slide check, which had passed with zero request failures. Its endpoint/reason was not retained, so this report does not assert a completely failure-free network trace or classify it as harmless. Logout state assertions passed: no authenticated user/profile and empty planning/daily arrays. The restored OLD build has no versioned-cache map to test. Browser contexts were closed; no credentials were saved.

This is an admin read-only restoration smoke pass with the stated network limitation. It is not a normal-user, upload, every-filter-combination or full export repetition on the restored build.

## Measurements, database and remaining work

No real-data before/after speed percentage, transferred-byte reduction, DCL/Home/Finish median or per-slide three-run median is available. Earlier Step reports contain synthetic benchmarks only. The actual post-deploy evidence above establishes asset delivery, login and the numeric gate failure, not a speed improvement. Native Chromium certificate verification was kept enabled; its managed proxy trust issue was resolved with the environment's existing public CA in a temporary trust store.

Phase E was explicitly skipped after the rollback, as requested. No five-target production EXPLAIN suite or evidence-backed index application was completed. No `supabase/performance-migration.sql` or `DB_DIAGNOSTICS.md` was fabricated; no database rollback is necessary. Existing migration/import/read-access scripts were not rerun. Reports contain no credentials, emails, production row samples or private identifiers.

Recommended next attempt, not implemented here:

1. Establish a fresh OLD/NEW baseline against the same pinned completed upload and identical filters immediately before publishing; compare current snapshot totals again after deployment.
2. Complete the normal-user and same-session account-switch checks with a working securely configured test login.
3. Provide an isolated Supabase environment for upload/user/settings write-flow tests.
4. Retry release only after those gates, then collect native three-run speed medians and perform the originally authorized EXPLAIN-driven index review.
5. Future Home summary RPC, Order Bank server-side paging/facets and RLS wrapper ideas remain proposals. No measured impact ranking is available, so they are not presented as measured priorities.

**Current outcome: performance release rolled back; database untouched; no live speedup claimed.**
