# Size Set TNA KPI dashboard

The TNA Performance tab uses the approved KPI-first workspace: four KPIs (OTD, milestones due, overdue actions, size sets completed), milestone performance, a delivery-mix chart, priority follow-up and a paginated action tracker. KPI clicks open the relevant records; EWO/color clicks show all 12 source Plan/Actual milestones with PCD, EFD, current owner, Next Action, When and Remarks.

## Data and scope

The iframe receives actual Size Set `row_data` from the existing authenticated parent loader. Only rows matching the selected planning upload's positive EWO scope are supplied. There are no sample records, direct SQL requests, independent CSV uploads or new backend endpoints. Local preview remains explicitly labeled. Buyer, Line, Milestone, EWO/Color search and As-of are the only main filters. TNA filters are independent of Source Table filters, which are hidden while TNA is open. Plan changes reset the TNA filters and close details; report refresh preserves valid filter choices and closes old details. Refresh delegates to the parent; empty snapshots clear the dashboard. Logout removes the iframe.

Each Size Set CSV row is one report record. Repeated EWO/color rows are retained, matching the source-preserving report model. Milestones count once per source row and valid Plan date; quantities do not weight OTD. Completion counts source rows with a valid Bulk Pattern Actual by the as-of date, including rows without a Bulk Pattern Plan. Its drilldown includes all those completed rows even when they lack a valid Plan. The record completion denominator is not changed by the Milestone filter. Priority follow-up selects the oldest open milestone per normalized Line/EWO/Color group.

Owner values use the source Who column as current follow-up owner. Pattern Master Name is a fallback only for SS Pattern and Bulk Pattern. No historical stage owner or department is invented. Timeline When follows the accepted rule: Close/Closed uses raw Bulk Pattern Actual; other actions use When.

## Dates and metrics

- Explicit event years take precedence; impossible calendar dates are excluded.
- Default yearless Plan dates use the valid date nearest fully dated EFD across previous/same/next years. Actual dates use the year nearest Plan or EFD. Dates without an anchor are excluded. Inferred-date and invalid/unanchored Plan counts appear inside Metric definitions, along with an Explicit years only option.
- Initial as-of uses Asia/Dhaka. Actual dates after as-of count as uncompleted until reached. A missing/future actual is overdue when Plan < as-of. Plan = as-of is Due today, not overdue. There is no grace allowance or adjustable rating threshold in this simplified view.
- OTD = on-time completed / (all completed by as-of + overdue open). On time means Actual <= Plan. Upcoming/due-today uncompleted milestones are excluded from OTD. Empty denominators show an em dash.
- Due = completed + overdue open. Planned = on-time + late completed + overdue open + pending (including due today). The delivery donut and milestone bars use the same partition. Completion is a separate record-level KPI, not an OTD estimate.
- All 12 timeline steps remain visible. A milestone without Plan is labeled No plan, or Completed if Actual is already recorded. Such events are excluded from timing KPIs.

## Integration and validation

The parent/iframe message bridge requires exact same origin and the expected frame/parent identity. Report strings are escaped; unknown messages cannot replace rows. The iframe follows the parent theme and a theme-only update preserves filters. The TNA-only shell hides duplicated source/export framing and gives the iframe the remaining viewport, without changing Source Table or Andon layouts.

`tests/size-set-performance.py` exercises the production markup, source loader bridge, actual-only completion, date inference, invalid dates and future actuals, KPI conservation, owner evidence, KPI and event drilldowns, 12-step timeline, independent filters, origin guards, plan/refresh/empty/logout clearing and responsive widths 1910/1464/926/784/640/420. Fixtures are synthetic and are never deployed. The test does not claim authenticated reconciliation of the full hosted SS report.
