EWO Readiness Board is a sewing-start board, not a sewing-completion board. The user-approved starter threshold is 80% of first-day Plan pcs. Accessories must be exactly `OK` or `All Acc. Balanced`; Size Set must be exactly `Closed`, ignoring case and surrounding/repeated whitespace.

The readiness migrations are applied to production. This implementation is published through the repository main branch to GitHub Pages. Live latest-plan queries verify unique EWO rows, valid score bounds and a full payload within an 8-second query budget.

The live schema was inspected read-only. No required source column was missing. Two additional existing sources were needed after defining “first day”: `plan_daily` for actual daily plan quantities, and `line_chassis_priority` for the dashboard's configured master-line filter.

| Purpose | Existing table | Exact columns used |
|---|---|---|
| Planning snapshot | `public.plan_uploads` | `id`, `status`; JS fallback also reads `uploaded_at` |
| EWO, color, applicability and milestones | `public.plan_records` | `id`, `upload_id`, `ewo`, `col`, `buyer`, `line_no`, `criteria`, `is_summary_row`, `print`, `emb`, `pcd`, `psd`, `pfd`, `delivery`, `total` |
| First positive production day and its pcs | `public.plan_daily` | `record_id`, `upload_id`, `plan_date`, `value` |
| Configured master lines | `public.line_chassis_priority` | `line_no` |
| Fabric/cutting evidence in pcs | `public.fabric_cutting_info` | `ewo`, `color_name`, `total_cut_qty`, `cutable_qty`, `uploaded_at` |
| Print/EMB usable receipts | `public.embellishment_send_receive_rows` | `EWO No`, `Color`, `Code`, `Style No`, `Date`, `Total Print Receive Qty`, `Total Print Return Qty`, `Total EMB Receive Qty`, `Total EMB Return Qty`, `is_active`, `uploaded_at` |
| Sewing accessories approval | `public.accessories_rows` | `row_data` keys `EWO`, `Sewing Trims Pending Stts`; `is_active`, `uploaded_at` |
| Size Set approval for first-day colors | `public.size_set_rows` | `row_data` keys `EWO`, `Color`, `T & A Closed`; `is_active`, `uploaded_at` |
| Input evidence and PFD output assessment | `public.sewing_input_output` | `ewo`, `color`, `po_no`, `line_no`, `order_qty`, `total_input_qty`, `total_output_qty`, `total_reject_qty`, `total_wip_qty` |
| Existing authorization | `public.site_users`, through existing `public.current_site_can(text)` | `auth_user_id`, `role`, `status`, `permissions` |

There is one SQL view row per completed `upload_id + EWO`. The JS request always filters the selected upload, so the board shows one row per EWO and does not combine planning versions. Only valid, configured master lines and non-summary `Plan/Day` records participate. The first day is the earliest positive `plan_daily.value` date for that EWO, not a guessed date or a full-record total.

The required quantity is `ceil(0.8 × first-day Plan pcs)` for each first-day color. All applicable first-day colors must pass; surplus Blue pcs cannot cover a Red shortage. The displayed EWO starter total is the sum of these color thresholds. Print/EMB thresholds use only first-day plan rows marked `Yes` for the relevant operation; `No` is N/A, while a blank/unknown flag is Unknown.

| Light | Implemented rule |
|---|---|
| Fabric | Green if recorded cutable pcs or already-cut pcs independently cover the color starter threshold. These fields are not added; no kg-to-pcs conversion is invented. If known quantities are positive but below threshold, Partial; known zero, Blocked. Missing/conflicting quantities are Unknown unless sufficient valid cut evidence already proves coverage. |
| Cutting | Green at or above the starter threshold, Partial for positive quantity below it, Blocked at known zero; absent/conflicting data is Unknown. |
| Print / Embroidery | Same threshold rule using the latest cumulative report per EWO/color. Implementation uses a conservative usable quantity of received minus returns. Invalid numbers/dates, future report dates and contradictory same-code receipts are Unknown. Historical report dates are never summed. |
| Accessories | All active EWO rows must have an approved sewing-trims status for Green. Mixed known approved/pending rows are Partial; known pending-only rows are Blocked. Blank status is Unknown. `Balanced without…` never matches the approved literal. Finishing trims are not a sewing-start prerequisite. |
| Size Set | All matching first-day color rows must have `T & A Closed = Closed` for Green. Mixed known Closed/open rows are Partial; known open-only rows are Blocked; blank/missing approvals are Unknown. Another color's Closed row does not satisfy the target color. |
| Sewing | Derived from the six prerequisites: any Blocked makes it Blocked; otherwise any Unknown makes it Unknown; otherwise any Partial makes it Partial; all applicable prerequisites Ready makes it Ready. Positive actual input is a separate “Input recorded” badge and never bypasses readiness requirements. |

The score uses the previously proposed equal weights: Ready=100, Partial=50, Blocked=0. It averages the six prerequisites, excluding N/A. Sewing is not counted again. Any Unknown prerequisite leaves the score unreported; the board shows the known/applicable stage count. This is an explicit scoring design, not a source-provided metric.

Milestone risk is deterministic, with dates evaluated in `Asia/Dhaka`:

- High if a source planning row's PFD is after its delivery date; or PFD has passed and unambiguous reported output is below planned quantity; or PCD/PSD has been reached with evidenced unfinished prerequisites and no reported input.
- Watch for known unfinished prerequisites before a due milestone, or insufficient output on PFD itself.
- Unknown for missing/inconsistent dates, incomplete evidence/schedules or an unassessable finish quantity. A specifically evidenced High condition can still be reported while other evidence is missing.
- Low means no evidenced milestone breach. It is not an estimated delivery probability or a capacity forecast. The sewing report has no input date, so an “Input recorded” badge does not assert that sewing started on time.

The board displays source upload timestamps in the Evidence dialog. No freshness TTL has been invented. Current source snapshots can be compared with an older selected planning snapshot; the timestamps make that distinction inspectable. Missing, malformed and contradictory data is never replaced with a fabricated successful quantity. Exact duplicate receipt evidence is collapsed; ambiguous sewing copies leave total quantities unknown rather than creating a definitive finish-risk claim.

| Implementation reference | Function / exact location |
|---|---|
| SQL view and normalization helpers | `supabase/migrations/20261014020815_ewo_readiness_board.sql:1`; `public.ewo_readiness_board` begins at line 64 |
| View starter thresholds | `targets` CTE in the same migration, line 114 |
| View source read permissions | `ewo_readiness_active_read` policies, migration lines 54–62 |
| JS renderer | `renderEWOReadinessBoard()` — `ewo-readiness.js:33` |
| Selected-plan loading and race guards | `loadEWOReadinessBoard()` — `ewo-readiness.js:72` |
| Evidence dialog | `showEWOReadinessEvidence()` — `ewo-readiness.js:104` |
| Logout cleanup | `resetEWOReadinessBoard()` — `ewo-readiness.js:23` |
| User Module entry | `SLIDES` — `slides-config.js:21`; existing `getDashboardSlideRegistry()` — `index.html:6614` |

The permission entry is:

```js
{id:'s21', number:21, title:'EWO Readiness Board', icon:'🚦', permissionKey:'slide_21'}
```

Existing users receive no automatic permission grant. Admin access follows the existing role check. User Module create/update already accepts `slide_21` through `permissionsOf()` in `supabase/functions/admin-create-user/index.ts:4`; tests verify both true and false values round-trip without changing the Edge Function.

The view uses `security_invoker=true` and `security_barrier=true`. It is granted only to `authenticated` and gates rows with `current_site_can('slide_21')`. The three new SELECT policies allow a board user to read active Accessories, Size Set and Embellishment source evidence through RLS. This includes direct read access to those active source rows; it does not grant staging or write access. Existing unrelated source policies are retained.

Validation passed on isolated PostgreSQL 17.6, matching the inspected live major/minor version: 80/79 boundary, cross-color deficits, required-operation subsets, zero/missing/invalid values, returns, cumulative history, conflicting rows, first positive day, snapshot isolation, master-line filtering, PCD/PSD/PFD/delivery risk and authenticated/disabled/denied/anonymous authorization. Fixtures and assertions are in `tests/ewo-readiness.sql`; the isolated schema harness is `tests/readiness-schema.sql` and is not a production migration.

Validation also passed:

```sh
node tests/ewo-readiness.cjs
python tests/ewo-readiness-browser.py
python tests/slides-navigation.py
node tests/admin-user.cjs
node tests/loading.cjs
node tests/line-popup.cjs
node tests/ewo-feeding.cjs
```

The browser tests intercept external requests and use synthetic demo rows. They verify seven lights, the generated User Module key, escaping, filters, mobile scrolling, popup/reset behavior and central navigation. Node tests verify pagination, failed-page isolation, selected-upload/session races and permission gates.

CONFIRMED / High: the first full live payload timed out at 8 seconds. `loadEWOReadinessBoard()` (`ewo-readiness.js:72`) requests the view defined in `20261014020815_ewo_readiness_board.sql:64`. Its `daily` CTE (line 88) redundantly grouped rows already guaranteed unique by the live `UNIQUE(record_id, plan_date)` constraint; repeated daily-plan subplans made the analyzed query take 18.337 seconds. The follow-ups compute cumulative receipts once and directly project the unique daily rows. No readiness threshold or authorization rule changed.

The minimal final daily-query repair is:

```diff
 daily as not materialized (
-  select d.record_id,d.upload_id,d.plan_date,max(d.value) qty,
-    count(distinct d.value)>1 or count(d.value)<>count(*) conflict
-  from public.plan_daily d group by d.record_id,d.upload_id,d.plan_date
+  select d.record_id,d.upload_id,d.plan_date,d.value qty,d.value is null conflict
+  from public.plan_daily d
 ),
```

The optimized view is in `supabase/migrations/20261014021617_ewo_readiness_daily_unique_scan.sql:3`; its daily projection is at line 27 and its materialized cumulative-receipt aggregate at line 99. The complete fixture/RLS suite was rerun against all migrations, and the full authenticated live payload passed the 8-second budget.

Applied migration history, in order: `20261014020815_ewo_readiness_board.sql`, `20261014021253_ewo_readiness_query_performance.sql`, `20261014021617_ewo_readiness_daily_unique_scan.sql`. The frontend delta is `index.html`, `slides-config.js`, `ewo-readiness.js`, `ewo-readiness.css`. Keep the applied migration files unchanged. No Edge Function deployment is needed.
