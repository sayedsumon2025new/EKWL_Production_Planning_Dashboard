# Gantt daily summary

The EWO Gantt view adds eight date-aligned rows and a separate Consumable WIP
summary. WIP categories default to all four. Selecting categories changes only
Forecastable Pcs/SAH; Gantt entries, colors, planning metrics and the lower full
WIP totals remain independent. Hide summary hides its filter and notes together;
showing it retains the selection. Line, EWO search and date range scope the
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
| Forecastable Pcs | Sum selected nonnegative consumable WIP for the date's distinct scheduled EWOs. Shared Cutable/Print/Embroidery stock is counted once per EWO; Sewing WIP includes only scheduled selected lines. |
| Forecastable SAH | For each EWO, selected consumable WIP × that EWO's valid unique SMV / 60, then sum unrounded results. Missing/conflicting SMV excludes only that contribution; available SAH is marked as a partial subtotal. If no contribution can be converted, SAH is unavailable. |
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

These are the latest uploaded report stocks for EWOs scheduled on each date,
as in the existing popup; historical stock is not reconstructed or depleted by
future plan rows. The UI states this boundary. Source reports must be refreshed
to reflect actual stock changes. The lower table retains all categories even
while the forecast is filtered. No sample figures, capacity efficiency target,
global SMV, database migrations or report writes are introduced.

## Validation

The Node regression checks per-EWO SMV, shared stock deduplication, exact scope,
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
