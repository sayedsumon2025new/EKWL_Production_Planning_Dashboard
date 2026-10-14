# Slide 06 data review — 14 October 2026

Live read-only SQL checked upload `2b90e153-4046-40b5-9272-50711cadea93` (Oct 2026, Seq 6, P06, Plan 13 Oct'2026.csv). It has 1,375 non-summary Plan/Day rows; PSD, PFD and Delivery are NULL on all of them. Raw Plan/Day order quantity sums to 1,214,062 pcs, but that is **not** a validated month/line/EWO total. There are 99,000 daily entries across all four criteria, with 5,730 positive entries, spanning 2026-10-14 through 2026-10-31. Daily dates do not establish the missing source PSD.

| Status / severity | Exact function and current line | Root cause | Minimal fix |
| --- | --- | --- | --- |
| CONFIRMED / High | `buildS6Rows()` index.html:5672; `renderS6()` index.html:5719 | Missing PSD excludes every row; renderer displayed numeric zero as though a valid analysis existed. | Keep PSD rules; disclose excluded-row count; replace all totals/charts with Unavailable when all PSD is missing. |
| CONFIRMED / Medium | `renderS8()` index.html:6187 | Guard required removed #s8 panel, preventing the bar, summary and buyer/product pies retained inside #s6 from rendering. Dead s8-month/body/foot writes would crash if only the guard were removed. | Remove guard and the three dead DOM writes; retain live #s6 chart containers and existing feeding grain. |
| CONFIRMED / High | `csvDate()` index.html:7017; `parseRawPlanFile()` index.html:7049; `uploadNewPlan()` index.html:7068 | Import date parser silently returned null for non-empty unsupported/invalid dates; upload mapped those nulls into source columns. | Support explicit DD-MMM-YY/YYYY; validate every non-empty milestone cell before creating upload records. Preserve blank dates as missing. |
| SUSPECTED / High | Same import functions | Unsupported CSV dates or unmatched source headers may explain Seq 6 NULL dates, but original CSV cells have not been inspected. | Obtain original CSV, compare headers/cells, then re-import verified dates. Do not backfill dates from daily plan or another upload. |
| SUSPECTED / Medium | `bootLiveSupabaseData()` index.html:4064, badge catch index.html:4087 | Screenshot shows cached-data failure badge, but the originating exception could be settings, planning, shared reports or network/auth. Browser console/session not available to this review. | Capture failing request/console error before proposing a sync fix. No claim this patch resolves the live-sync error. |

Storage metadata confirms the original CSV backup exists in private plan-data storage; unauthenticated read-only downloads returned HTTP 400. Only admin-create-user exists as an Edge Function; Planning CSV import is the inline uploadNewPlan function. Original CSV is still needed to repair existing milestone data accurately.

Validation: Node loading, EWO feeding and line-popup regressions pass; Chromium DOM test verifies actual moved charts, missing PSD state and restoration, named-month date parsing, invalid-date rejection before upload, slide aliases and permissions. No source database values were changed.

Minimal diff: slide06-data-fix.patch (index.html only).
