# Gantt stock during fabric reconciliation

The selected completed planning upload remains the plan authority. Gantt reads the
single verified active RFD Daily Production Status upload through the read-only
`reports/snapshot` kind `gantt-cutting`; draft previews and superseded batches are
never inputs. Existing raw reports and database rows are not modified.

## Sources and grain

- Cutting = sum of **Cutting Today** (source column 9) over all dates, by EWO/Color.
  Cutting Total is never added. Legitimate source rows are retained, including
  identical-valued production entries. Upload retries do not append a batch twice.
- Sewing WIP is source WIP, by Line/EWO/Color. Sewing Input for ready cutting is
  summed across every line for the same EWO/Color.
- Print WIP = Send - Receive; Embroidery WIP = Send - Receive, by EWO/Color.
- Ready Cutting WIP: no process => Cutting - Input; Print only => Print Receive -
  Input; Embroidery only => Embroidery Receive - Input. Both processes => unknown
  until the final route is confirmed; receipts are never added together.
- Cuttable WIP uses only literal Body textile receipts and matching Body booking
  consumption, minus latest cumulative Cutting Total; see below. Legacy fabric
  stock and material-shortage claims remain outside Gantt forecasts.

EWO normalization accepts a unique six-digit token (including a suffix such as
271080-FBR). Multiple different tokens are unresolved. Color matching trims,
collapses whitespace and ignores case; different names are not guessed as aliases.
Missing/invalid quantities remain unavailable. Negative raw balances remain visible
with a warning; allocation cannot consume negative pieces. These safeguards do
not prove that the uploaded report itself is free from business/source errors.

## Reservations and display

Coverage starts strictly after the latest Actual Production output date. Sewing
stock is consumed on its own line in plan-date order. Remaining demand is sorted
by **Delivery Date, Plan Date, Line, original source order** across the complete
selected plan. Missing/invalid delivery sorts after valid deliveries. Each demand
consumes Cutting, Embroidery, Print, then Body Cuttable. All upstream stock is reserved once per
EWO/Color, including reservations for earlier deliveries scheduled on later plan
dates. Earlier display dates cannot steal those reservations.

Line/date/search filters only select the resulting allocations. WIP category
filters sum existing stage contributions; they do not allocate again. Per-part
SAH uses that plan record's positive SMV / 60; missing/conflicting SMV stays unknown.
Popup, color and daily summary use the same stock model. Green requires complete
Sewing cover; light blue requires complete Sewing + known ready Cutting cover.
Complete known coverage requiring Body stock uses the existing Cuttable color.
Uncovered plan does not establish a fabric-shortage claim.

Popup raw stock is the shared EWO/Color balance, while its delivery allocation is
specific to the clicked line/date. It includes the saved RFD filename and source
row references. The Cutable category is enabled and selected by default.

Verification: `tests/gantt-delivery-stock.cjs`, `tests/gantt-cutting-wip.cjs`,
`tests/gantt-daily-summary-browser.py`, and `tests/mysql/rfd-daily-cutting.py` cover
conservation, delivery priority, color isolation, selected-plan/filter behavior,
receipt routing, per-color SMV, active-batch readback and read-only permissions.


## Body-only Cuttable WIP

The same `gantt-cutting` request now reads active RFD textile receipts, Booking,
Daily Production and current Order Bank quantities in one read-only repeatable-read
transaction. It returns the original verified Daily Production report plus
`body_cuttable` (`body-cuttable-v1`); no tables or source cells are written.

For each EWO + Color, only RFD `Fabric Details = Body` (case/whitespace normalized)
is eligible. Existing approved source-specific and Body-only color aliases apply.
Body booking matches Construction + Composition and one GSM/Width/Unit specification.
Rib/supporting receipts and bookings never enter Body consumption. No fabric is
classified as Body merely because it has the largest booking quantity.

`Body consumption = matching Body Booking Qty / current Order Bank OrderQty`.
`Cuttable WIP PCS = floor(Body textile received / Body consumption) − Cutting Total`.
Receipt quantity uses the Body booking unit (KG, PCS or YDS). Cutting Total comes
once from the latest dated Daily Production rows; duplicate agreeing cumulative
values are counted once, conflicting values remain unknown. Cutting Today retains
its existing role in ready Cutting WIP and is not used for this deduction.
Exact integer arithmetic floors capacity without floating-point loss of a piece.

Multiple Body specifications, shared Body/supporting specifications, unresolved
booking revisions, missing/invalid quantities, unsupported units, and missing or
conflicting latest cutting totals return unavailable with a reason. Signed negative
balances remain inspectable but allocate zero. Popup tooltips retain received
quantity, consumption, cumulative cutting date and source-row references.

Body stock is shared once across all lines by delivery priority, after Sewing,
ready Cutting, Embroidery and Print. Filters do not replenish or reallocate it.
The Gantt summary and linked Load Analysis use the same stage 0 allocation and
per-EWO SMV conversion. Source uploads, Order Bank changes and mapping writes
invalidate this snapshot; session/version guards and freshness limits still apply.

Tests: `tests/mysql/gantt-body-model.php`, `tests/mysql/gantt-body-cuttable.py`,
`tests/gantt-body-cuttable.cjs`, and `tests/gantt-daily-summary-browser.py`.
