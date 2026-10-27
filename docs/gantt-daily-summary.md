# Gantt daily summary

The EWO Gantt view adds eight date-aligned rows and a separate Consumable WIP
summary. WIP categories default to all four. Selecting categories changes only
Forecastable Pcs/SAH; Gantt entries, colors, planning metrics and the lower full
WIP totals remain independent. Hide summary hides its filter and notes together;
showing it retains the selection. The compact view starts with summary and
lower detail panels collapsed, matching the approved layout demo. Line, EWO search and date range scope the
summary. No EWO breakdown is displayed. Logout resets controls and discards late
source responses. Existing Gantt calculations and payloads remain unchanged.

## Metric sources

All Planning metrics use the selected completed Planning snapshot. Only lines
with a positive Plan/Day entry for a date are included. Source record/date is
counted once; distinct PO/color records are retained.

| Row | Method |
| --- | --- |
| Clock Hour | Sum the date's Clock Hour/Day records on scheduled selected lines; empty-EWO clock rows are a per-line fallback, not added again. |
| Plan SAH | Sum SAH/Day; when absent, derive from each Plan/Day quantity × its SMV / 60 and label the fallback. |
| Plan Pcs | Sum Plan/Day pieces. |
| Forecastable Pcs | Sum that date’s allocated plan coverage from selected stages. Allocate all colors by Line + EWO, deduct prior allocations, and cap by daily demand. Full-plan allocation precedes date, line, EWO and category display filters; shared upstream stock cannot be replenished by filtering. |
| Forecastable SAH | For each EWO, daily allocated covered pieces from selected stages × that EWO’s valid unique SMV on the line / 60, then sum unrounded results. Missing/conflicting SMV excludes only that contribution; available SAH is marked as a partial subtotal. If no contribution can be converted, SAH is unavailable. |
| Plan Efficiency | Total Plan SAH / total Clock Hour × 100. |
| Plan Working Hours | Total Clock Hour / total manpower (weighted across selected lines). |
| Plan Manpower | One consistent positive source manpower per scheduled line, summed across lines; repeated EWO/PO rows do not multiply it. |

WIP source semantics match the existing Gantt popup: Fabric/Cutting `cutable_qty`,
Sewing I/O `wip`, and the active Embellishment snapshot's summed Today Print or
EMB Send minus Receive values. Negative WIP is clamped at zero with a note.
An explicitly No print/embellishment flag permits a zero when that EWO has no
embellishment report row. Missing source values no longer blank the entire date. Sum matched numeric
contributions and mark incomplete WIP/SAH and stage totals with an asterisk and
visible subtotal explanation. A category with no matched numeric values remains
unavailable; a genuine numeric source zero remains zero. Blank fields inside
one EWO retain its other known rows and trigger the same partial marker. An empty category
selection gives zero forecast without changing any source data.

## Daily allocation

The latest Date Wise Actual Production Report output date (including zero-output
rows) establishes the baseline. Dates through that cutoff show unavailable
forecast, not historical inventory. Without a cutoff, coverage remains unavailable.
The latest uploaded report stocks are assumed to describe that baseline; this
projection does not reconstruct historical stock or infer replenishment.

Walk the complete positive Plan/Day snapshot after the cutoff in date order.
Deduplicate record/date once. Group demand by exact normalized Line + EWO,
ignoring all garment colors and PO subdivisions. Consume Sewing first, then
Embroidery, Print and Cutable. Each stage covers only the unmet plan after the
previous stage; daily pieces never exceed daily plan, and no stock is counted
twice. Carry each closing balance to the next date.

Sewing pools are separate per Line + EWO. Cutable, Print and Embroidery pools are
shared per EWO. For the same date, shared stock follows each line’s remaining
unmet demand proportionally. Whole pieces use largest-remainder rounding with
line-number tie-breaking. Earlier hidden dates and hidden lines still consume
stock before display filters. Excluded chassis lines (including 46) do not consume
stock. Same-date allocations do not depend on source row order.

The WIP filter sums the selected stage contributions; it never reassigns stock.
The lower table retains all four daily stage contributions. Hiding the summary
hides the category control as before. Existing Gantt material colors, popup raw
report balances and PSD behavior remain unchanged; raw report stock and allocated
daily plan coverage are distinct metrics.

For example, Line 1 / EWO 272718 Sewing WIP 612 (reported as White) covers a
Black plan of 389 on 25-Oct and 223 of the following date’s plan, then zero.
With the approved illustrative four-stage inputs (Sewing 612, Embroidery 150,
Print 200, Cutable 500) and daily plans 389, 400, 300, 200, 300, 200, the daily
all-stage cover is 389, 400, 300, 200, 173, 0. These numbers exist in tests only,
never as live fallback data.

Missing stock is not fabricated. Known allocations retain partial markers when
that stage or an earlier priority stage is unavailable; missing downstream stock
does not make a known Sewing contribution partial. Missing source may affect
stage attribution and future upstream balances, so provisional allocations carry
that uncertainty. Numeric zero remains zero. Missing/conflicting SMV excludes
only its covered contribution from available SAH and marks a partial subtotal.
No database migrations or report writes are introduced.

## Validation

The Node regression checks per-EWO SMV, shared stock deduplication, exact scope, chronological depletion, no double allocation across stages/lines,
color-independent coverage, filter invariance, cutoff handling,
missing versus zero, conflicting manpower/SMV, duplicate source rows and category
selection. Offline Chrome runs the real Gantt markup/renderer and verifies
filtering, unchanged Gantt payloads and lower totals, hide/show persistence,
optional source failure, stale-session responses and filter visibility with
wide date ranges. Existing Gantt parity regressions continue unchanged.
Hosted anonymous release verification does not reconcile the user's private
report values; authenticated source reconciliation requires the operator's data.

The active Embellishment snapshot is loaded before local EWO normalization. An
exact SQL text-IN filter can omit source identifiers such as `00123.00` when the
plan uses `00123`; loading the active snapshot preserves those matches. Existing
permission-scoped paging/cache remains in effect.
