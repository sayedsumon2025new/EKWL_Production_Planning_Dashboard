# Performance release checkpoint — normal-user login rejected

Status date: 15 October 2026 (Asia/Dhaka). **This is not a completed release. Phase A and the admin comparisons below passed. The Phase B normal-user/account-switching requirement is incomplete, so the Phase D merge/deployment gate remains closed.**

## Source, backup and current live state

- OLD and original main: `479090de208a15c90bbac6e4a17039cf84e550d7`.
- Approved Step 1–3 implementation: `0fa1996e6475ab7d7ff4a8d48aeaa3d99a67e79c`.
- Release preparation branch: `release/performance-steps-1-3`, created from the approved implementation because that release branch did not previously exist.
- Backup tag created and pushed: `backup/pre-performance-20261015`, at the original main hash. No pre-existing tag was moved.
- GitHub Pages configuration, read without modification: legacy branch deployment, `main`, repository root; reported status `built`.
- No release merge, deployment trigger, repository settings/secrets change, production upload/replacement, user/permission/settings change, schema/index change or `ANALYZE` was performed. Production testing used sign-in/sign-out lifecycle operations and read-only application queries only.

## Gate results

| Phase | Result | Evidence / remaining requirement |
| --- | --- | --- |
| A: tests | PASS | All 17 Node test files; all seven existing offline browser scripts; external JS syntax checks; three inline-script syntax checks; diff whitespace checks |
| A: assets | PASS | New `tests/release-assets.py`: 24 local paths, HTTP 200 and expected MIME types under `/EKWL_Production_Planning_Dashboard/`, offline boot and Execution iframe, local screenshot/Three.js fallbacks, changed asset URLs, sensitive credential-pattern checks and unchanged existing public client configuration |
| A: backup | PASS | Backup tag pushed at original main before release changes |
| B: production access | PASS | Correct project accessed directly; explicit read-only SQL connection precheck; authenticated admin login to local OLD and NEW against production |
| B: admin parity | PASS for listed checks | Real-data comparisons below, including a second planning selection and locally generated exports |
| B: normal-user/account switching | **BLOCKED** | Read-only aggregate account checks confirm four application/Auth accounts: one active admin and three active other accounts. A supplied normal-user login was rejected by production Auth with HTTP 400 / `invalid_credentials`; no normal-user secure credential bindings are configured |
| C: isolated write tests | NOT STARTED | Phase B is incomplete. No temporary project/branch was created; production was not used as a substitute |
| D: merge, publish and smoke | WITHHELD | The requested gate permits merging only after A and B pass |
| E: database diagnostics/indexes | NOT STARTED | Later phase not reached; no optimization or migration file was applied/generated |
| F: deployed speed measurements | NOT RUN | Requires completed parity and deployment; no live speedup is claimed |

Seven existing offline browser scripts passed: Step 1, Step 2 and Step 3 integration, navigation, stacked Gantt/popup, readiness/coverage, and the full 13-test theme suite. The new asset gate additionally passed as an eighth offline browser script. Offline API fixtures are separate evidence from the real-data checks below.

## OLD vs NEW production-data comparisons

Comparisons kept source values in browser memory. Only browser-computed equality results and aggregate counts/sizes left the test browser; no row dumps, account identifiers, emails, credentials or authentication tokens are included in this report or committed test artifacts.

| Comparison | Result | Scope |
| --- | --- | --- |
| Latest Home | EXACT MATCH | KPIs and buyer/product preview totals |
| Latest planning sources | EXACT MATCH | Planning/daily/SAH/clock/buyer source arrays, compared through browser-computed hashes |
| Order Detail, Buyer, Item, Feeding | EXACT MATCH | Rendered tables/footers/KPIs on latest and second selections |
| Gantt | EXACT MATCH | Canonical payloads, displayed entries, stacked cells, header dates, four condition filters, color toggle, EWO search, line filter and narrowed date range; latest and second selections |
| Gantt popup | EXACT MATCH | Representative available coverage conditions, actual SQL evidence and popup-source values |
| Fabrics & Cutting | EXACT MATCH | Tables/footers/KPIs for Plan EWO match and Not in Plan, latest and second selections |
| Chassis / Ladder | EXACT MATCH | Real-data tables, footers and applicable KPI output |
| Order Bank | EXACT MATCH | Complete loaded source rows/columns and filtered table/total output with EWO search |
| Order Execution | EXACT MATCH | Numeric plan/dashboard/risk summary fields in the actual isolated iframe with selected planning data |
| Size Set / Accessories / Embellishment | EXACT MATCH | Complete active source rows plus rendered tables/KPIs after the active loader settles |
| Readiness / Ready Input Coverage | EXACT MATCH | Complete SQL results and displayed readiness/coverage output, latest and second selections |
| Admin/User read-only views | EXACT MATCH | Settings/user table output and admin slide-access decisions; no control was saved or edited |
| CSV / PNG / Excel export scope | MATCH | Actual browser downloads generated locally; details below |
| Normal-user permissions and cross-account isolation | NOT RUN | Supplied normal-user authentication failed (`invalid_credentials`); admin cannot stand in for a normal authenticated user |

There are 11 available completed planning selections. The tests used latest and another available selection. A comparison pass covers the listed controls/states, not every possible combination of filter values. Admin-source/DOM checks, settled module checks and remaining/export checks all passed after the comparator corrections below. No confirmed numeric difference remains in these checked cases.

Latest-selection aggregates:

| Metric | OLD | NEW |
| --- | ---: | ---: |
| Total Order Qty | 1,214,062 | 1,214,062 |
| Total Plan Qty | 609,894 | 609,894 |
| Planning rows | 1,375 | 1,375 |
| Plan daily rows | 24,750 | 24,750 |
| Active Size Set source rows | 8,099 | 8,099 |
| Active Accessories source rows | 224 | 224 |
| Active Embellishment source rows | 6,765 | 6,765 |

Local export checks:

| Export | OLD | NEW | Comparison |
| --- | ---: | ---: | --- |
| Planning CSV | 107,100 bytes | 107,100 bytes | Byte-content hashes equal |
| Chassis PNG | 1,232 × 911 px | 1,232 × 911 px | Full capture dimensions/scope equal; PNG byte equality was not asserted |
| PSD Excel worksheet | 18 rows × 14 columns | 18 rows × 14 columns | Worksheet XML content hashes equal |
| PSD Excel file | 18,059 bytes | 18,059 bytes | Actual local downloads; all table columns included |

The exports were temporary browser downloads, not repository/report attachments. Screenshot capture targeted the Chassis report section, excluding account navigation/user lists. Admin sessions were logged out and the temporary browser contexts closed after the probes.

## Comparator corrections and test limits

Two initial mismatches were test-comparator artifacts, not confirmed numeric regressions:

1. Raw Gantt HTML differed because OLD adds redundant role/tabindex attributes to native buttons. Canonical comparisons of payloads, displayed text, color classes and headers then passed on both selections.
2. Calling a module loader immediately after `goSlide()` raced the slide's delayed loader on OLD. The corrected probe lets that delayed opener start and waits for the current loader; complete source rows and displayed results then matched. The independent-module probe also confirmed that these three module calculations do not reference planning arrays.

Later focused checks used the original snapshot loaders with real settings loaded before planning-line filtering. Unrelated historical prefetch was suppressed only in the final parity probe to keep the check scoped to its chosen selections; no application calculation or production code was patched. Full-startup and source comparisons were also performed earlier. These focused probes are functional evidence, not startup performance measurements.

Earlier native Chromium probes in this execution environment did not trust the managed HTTPS proxy chain. The real-data probes therefore used an HTTPS transport with normal certificate verification, restricted to the exact application Supabase origin and declared library endpoints; credentials/headers were not forwarded to static-library hosts, and redirects were not forwarded across origins. Production table mutations, writing RPCs and Edge Function calls were disallowed. One probe recorded two out-of-scope requests without retaining their detailed classification; therefore these parity runs do not establish an entirely clean native-browser asset/network smoke test. The final admin/Excel/second-selection probe completed with zero blocked requests. Post-deployment smoke testing remains pending. A later TLS-only probe succeeded natively with HTTP 200 after adding the environment's existing public proxy CA to a temporary Chromium trust store. Certificate verification remains enabled; the previous native-browser benchmarking blocker is resolved, but no benchmark has yet been run.

Read-only SQL outside the browser was limited to a constant-only connection check and aggregate account/role counts. No auth secrets, password hashes, private row identifiers or production row samples were retrieved through SQL.

## Measurements

The requested real-network unthrottled and Fast 4G / 4× CPU, three-run median OLD-vs-NEW-live benchmark was **not performed**. The functional probes used a verified transport that changes network timing; reporting those timings as native Chromium throttled performance would be misleading. Native verified TLS is now working for future measurements. No production before/after percentages, transferred-byte reductions, DCL/Home/Finish medians or ranked measured bottlenecks are claimed.

The current live site remains on original main. Existing Step 1–3 reports contain synthetic benchmarks only. Their gains are not a measurement of a deployed release.

## Database changes and rollback

No `supabase/performance-migration.sql` or `DB_DIAGNOSTICS.md` was fabricated. Phase E has not been reached: no five-target EXPLAIN suite, index equivalence review, `CREATE INDEX CONCURRENTLY`, `ANALYZE`, RLS/function/view/constraint change or database rollback was executed. There are no applied database changes to undo.

No code release has been merged, so no merge commit hash or release rollback command exists yet. Main remains at the backed-up original hash. After a future merge, record its real merge hash and use the authorized `git revert -m 1 <actual-merge-hash>` procedure on smoke failure; do not reset/force-push main. GitHub UI path for that future code rollback is repository → Pull requests → merged release PR → Revert. No release PR/merge has been created in this attempt.

## Required next action and remaining phases

Verify an existing normal-user login in the dashboard, then configure its credentials securely (`EKWL_TEST_USER_EMAIL` and `EKWL_TEST_USER_PASSWORD`). The newly supplied credentials were tested without saving their values; production Auth rejected them with HTTP 400 / `invalid_credentials`, confirmed by an independent minimal native-browser authentication probe. After the user confirmed using the same credentials successfully, a further probe used the actual live GitHub Pages login form with a fresh browser context and native verified TLS. Its Auth token request again returned HTTP 400; neither an authenticated user nor an authorized profile was established. No credentials were saved. No password reset, user creation or permission modification was attempted. The account-switch probe confirmed cleared planning/shared-report/Order Bank arrays after admin logout on OLD; NEW cross-account verification remains incomplete because normal login failed. Actual normal accounts exist, so this cannot be described as a single-account project or replaced by an admin-side profile simulation. Production users/roles/passwords will not be created or changed to obtain that access.

Then complete the Phase B normal-user and same-session account-switching checks and any further requested filter coverage. Only once the gate passes should the workflow proceed to isolated write tests (or the expressly allowed isolation-unavailable skip), conditional merge/Pages deployment and smoke/revert, evidence-backed additive indexes, and native-browser live measurements. Re-run checks if main gains new commits before merge.

Home aggregation RPCs, Order Bank server-side paging/facets and RLS wrapper changes remain future audit candidates, not implemented optimizations or evidence-backed Phase E recommendations. Their measured priority and EXPLAIN justification are still unestablished.

**Release withheld at the user's Phase B / Phase D gate. No live speedup is claimed. The unresolved release risk is unverified normal-user permissions and cross-user cache isolation; offline semantic coverage does not replace that production check.**
