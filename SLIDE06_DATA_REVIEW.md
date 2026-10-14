# Slide 06 data review — 14 October 2026

Live read-only SQL checked upload `2b90e153-4046-40b5-9272-50711cadea93` (Oct 2026, Seq 6, P06, Plan 13 Oct'2026.csv). It has 1,375 non-summary Plan/Day rows; PSD, PFD and Delivery are NULL on all of them. Raw Plan/Day order quantity sums to 1,214,062 pcs, but that is **not** a validated month/line/EWO total. There are 99,000 daily entries across all four criteria, with 5,730 positive entries, spanning 2026-10-14 through 2026-10-31. Daily dates do not establish the missing source PSD.

| Status / severity | Exact function and current line | Root cause | Minimal fix |
| --- | --- | --- | --- |
| CONFIRMED / High | `buildS6Rows()` index.html:5672; `renderS6()` index.html:5719 | Missing PSD excludes every row; renderer displayed numeric zero as though a valid analysis existed. | Keep PSD rules; disclose excluded-row count; replace all totals/charts with Unavailable when all PSD is missing. |
| CONFIRMED / Medium | `renderS8()` index.html:6187 | Guard required removed #s8 panel, preventing the bar, summary and buyer/product pies retained inside #s6 from rendering. Dead s8-month/body/foot writes would crash if only the guard were removed. | Remove guard and the three dead DOM writes; retain live #s6 chart containers and existing feeding grain. |
| CONFIRMED / High | `csvDate()` index.html:7017; `parseRawPlanFile()` index.html:7068; `uploadNewPlan()` index.html:7091 | Import date parser silently returned null for non-empty unsupported/invalid dates; upload mapped those nulls into source columns. | Support explicit DD-MMM-YY/YYYY; validate every non-empty milestone cell before creating upload records. Preserve blank dates as missing. |
| CONFIRMED / High | `csvDate()` index.html:7017; `uploadNewPlan()` index.html:7091 | User-provided original CSV has DD-MMM-YY milestone cells. Pre-fix csvDate returned NULL for them; uploadNewPlan inserted those NULLs. All 5,500 records matched source row, line, buyer, EWO, criteria, order quantity and total; all 22,000 source milestone cells are valid. | Restore only the four milestone columns from the exact matched CSV using snapshot guards and one atomic transaction. Prepared SQL: /workspace/scratch/seq6-milestone-repair.sql. Production write awaiting explicit approval after automatic review rejection. |
| SUSPECTED / Medium | `bootLiveSupabaseData()` index.html:4064, badge catch index.html:4087 | Screenshot shows cached-data failure badge, but the originating exception could be settings, planning, shared reports or network/auth. Browser console/session not available to this review. | Capture failing request/console error before proposing a sync fix. No claim this patch resolves the live-sync error. |

Storage metadata confirms the original CSV backup exists in private plan-data storage; unauthenticated read-only downloads returned HTTP 400. Only admin-create-user exists as an Edge Function; Planning CSV import is the inline uploadNewPlan function. Original CSV is still needed to repair existing milestone data accurately.

Validation: Node loading, EWO feeding and line-popup regressions pass; Chromium DOM test verifies actual moved charts, missing PSD state and restoration, named-month date parsing, invalid-date rejection before upload, slide aliases and permissions. No source database values were changed.

Minimal diff: slide06-data-fix.patch (index.html only).

## Original CSV verification

Uploaded source MD5 `4b5ae33e516f122ff410ecbacf9881af` equals Storage backup eTag. The current production parser successfully parses 5,500 rows, 22,000 milestone values, and 18 daily date columns. All source milestone cells are non-empty; dates were lost during import. With CSV dates, buildS6Rows for October 2026 on the hard-coded master-line set yields 208 EWOs, 239 line–EWO feedings, and 1,201,970 order pcs (1,375 Plan/Day input rows). These are expected post-repair figures, not current production output.

The repair targets only upload 2b90e153-4046-40b5-9272-50711cadea93 and PCD/PSD/PFD/Delivery on its 5,500 rows. It locks target rows, verifies the pre-repair snapshot fingerprint, and rolls back unless exactly 5,500 rows update. No quantity, daily plan, upload identity, other upload, permission or schema change. Automatic approval review rejected the mutation because explicit approval for this 5,500-row production write was absent; the SQL has not run.
