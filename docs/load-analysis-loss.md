# Load Analysis: source-backed forecast and evidence attribution

The view has a five-category WIP filter and nine default rows: ABP daily target, selected FR SAH/Day plan, Cutable/Cutting/Print/Embroidery/Sewing allocated SAH, Final Forecast Achievable SAH, and Target-minus-Final gap. Unselected WIP rows hide; target, FR, final and gap remain. The parent recomputes from the same cached authenticated snapshot without refetching reports for a selection. New plan/owner/session resets to All 5. Origin, window, permission, upload and generation guards protect the message bridge and pending loads.

## Calculation and reconciliation

One full-snapshot allocation (Sewing, Cutting, Embroidery, Print, Cutable) supplies Gantt and Load Analysis. Per-stage SAH is converted from each Line/EWO's allocated pcs and its own consistent SMV, not a factory-average SMV. Allocation runs before date, line and WIP-display filters; pieces deplete chronologically and upstream EWO stock is shared proportionally across lines. Stage indices remain stable: Print 1, Embroidery 2, Cutting 4.

Final forecast includes selected Cutable, Cutting and Sewing contributions. Selected Print/Embroidery stock is displayed as Delayed by the user's operating rule, subtracted from the selected WIP subtotal and attributed to its own allocated quantity × SMV/60. A positive report stock is not calendar evidence of a missed due date; the operating-rule basis is disclosed. Missing source/SMV/route values retain null/partial semantics and available subtotals are marked `*`.

Gap = max(0, configured ABP target − Final). Loading gap = min(gap, max(0, target − selected FR plan)). Print/EMB reason SAH is reserved within the remaining target gap. Remaining uncovered EWO SAH can only enter a supported reason; residual or uncertain attribution stays Unassigned. Over-target plans cap reason attribution to the target gap. No reason is added to make a rounded display total look matched.

Runtime checks on unrounded values verify selected-stage subtotal, Final ready-stage sum, Target/Forecast gap, all reason buckets, nonnegative allocations and coverage ≤ net demand. Department charts use these same buckets. A mismatch blocks forecast/loss display and corrections, while source evidence remains inspectable. Arithmetic success is labeled separately from source completeness. Rounding is disclosed.

ABP uses the configured Daily Capacity on each date. FR uses the selected file's SAH/Day criterion rows with signed values. Inventory uses chassis master-line scope. Any FR-minus-inventory-scope SAH difference is reported, not silently adjusted. Per-EWO plan SAH derived from plan pcs × SMV is marked as derived. Cached fallback reports remain usable only as partial/provisional evidence and are identified in source receipts.

## Evidence rules

Raw source fields are retained with report name, field/value, EWO, available color/line, source row, file and upload metadata. Missing metadata is shown as not supplied. These are latest loaded report snapshots, not reconstructed historical stock or proof of actual causal production loss.

- Size Set requires explicit sample/size-set pending text. Generic Open/No/Pending alone is insufficient; closed/completed records do not establish a sample issue.
- Accessories requires an explicit active pending/shortage/delay statement; balanced/available/not-pending values do not establish shortage.
- Textile/washing require explicit non-negated issue text, or a numeric negative fabric balance for fabric shortage.
- Source color/line must match the planned scope. A color-specific issue cannot explain a whole mixed-color EWO gap unless all scheduled colors are supported. EWO-level fields remain identified as such.
- Exactly one supported status reason can be auto-attributed. Multiple supported causes stay Unassigned rather than choosing an arbitrary priority. This remains evidence-backed forecast attribution, not a claim that status proves a causal SAH amount.
- Source-read failures suppress automatic status attribution. Positive Print/EMB allocated quantities retain the explicit operating-rule calculation.

Saved account/plan corrections are retained with their remarks. A correction applies only to an eligible report-supported reason or Unassigned; unsupported historical corrections remain visible as not applied. The parent validates allowed reasons and current editable gap before saving. The PHP endpoint retains its existing authenticated per-account store and audit log; this change does not alter source reports or database schema.

## UI and validation

Duplicate headings/large banners are removed; long explanations move into Calculation & sources. Both charts, source/date drilldown, raw remarks, corrections/reset, refresh, department grouping, partial markers and the original subtotal/delay/gap calculation bridge are retained. The WIP picker stays outside horizontal-table clipping; the first column stays visible during horizontal scroll.

Checks cover explicit/negated/closed statuses, wrong EWO/color/line, mixed-color coverage, ambiguous causes, supported/unsupported saved corrections, null/zero sources, stock conservation, fixed-stage filter invariance, same-account refresh and session changes, source receipts, arithmetic tampering/fail-closed behavior, pie/row/KPI equality and responsive tables. A seeded 150-case arithmetic test varies stock, demand and selected categories. Private MySQL report contents are not audited by anonymous browser verification; correctness of uploaded facts requires access to those facts and the original reports.
