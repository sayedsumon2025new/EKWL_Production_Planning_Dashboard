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
- Legacy Fabrics & Cutting/Cutable quantities and shortage evidence are paused
  in Gantt and its linked Load Analysis forecasts. The original slide remains.

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
consumes Cutting, Embroidery, then Print. All upstream stock is reserved once per
EWO/Color, including reservations for earlier deliveries scheduled on later plan
dates. Earlier display dates cannot steal those reservations.

Line/date/search filters only select the resulting allocations. WIP category
filters sum existing stage contributions; they do not allocate again. Per-part
SAH uses that plan record's positive SMV / 60; missing/conflicting SMV stays unknown.
Popup, color and daily summary use the same stock model. Green requires complete
Sewing cover; light blue requires complete Sewing + known ready Cutting cover.
Other entries remain neutral: no fabric-shortage or Cutable color is inferred.

Popup raw stock is the shared EWO/Color balance, while its delivery allocation is
specific to the clicked line/date. It includes the saved RFD filename and source
row references. The disabled Cutable category remains visible as Paused.

Verification: `tests/gantt-delivery-stock.cjs`, `tests/gantt-cutting-wip.cjs`,
`tests/gantt-daily-summary-browser.py`, and `tests/mysql/rfd-daily-cutting.py` cover
conservation, delivery priority, color isolation, selected-plan/filter behavior,
receipt routing, per-color SMV, active-batch readback and read-only permissions.
