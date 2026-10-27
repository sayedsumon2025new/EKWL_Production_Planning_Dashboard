# Load Analysis forecast and loss reasons

The Load Analysis parent hydrates Fabric/Cutting, Sewing I/O and Date Wise Actual
Production plus active Size Set, Accessories and Embellishment sources. It uses
Gantt's full-snapshot daily stock allocation before display filters.
The agreed achievable forecast deducts the daily allocated Print and Embroidery
WIP SAH from the original Gantt Forecastable SAH. The raw Gantt source and the
quantity deduction are visible as separate summary rows. Load Analysis
always covers all chassis lines and all four WIP categories for the active
completed planning upload; it does not inherit temporary Gantt display filters.

Source reads, correction responses and iframe messages are fenced by signed-in
account, session generation, selected upload, current slide, exact iframe source
and same origin. A failed required report does not display fabricated forecasts.
Optional missing evidence yields Unassigned; missing corrections disable saving.
Uploads on the visible Load Analysis view trigger refresh. Refresh reports forces
fresh report reads. Changing plan/account or signing out clears old values.

## Evidence

- Size Set: explicit pending/open/not-closed in T & A Closed / Next Action.
- Accessories: nonempty Sewing Trims Pending Stts other than OK/balanced/none.
- Low GSM or panel wash: explicit problem text in Fabric status/difficulties.
- Fabric balance shortage: negative reported fabric_balance or explicit issue.
- Print / Embroidery: user operating rule, positive Send minus Receive WIP is
  delayed; zero/negative WIP is not delayed. Each receives its own daily allocated pcs × EWO SMV / 60 in its delayed row;
  those quantities are removed from achievable SAH. They are not merely flags
  that absorb an arbitrary uncovered balance. Zero WIP has zero delayed SAH.
  Full stock is not repeated on every date: reuse the Gantt date/line allocation.
- No supported evidence remains Unassigned. Source text is rendered as text,
  never HTML. Suggested reasons are attribution rules, not proof of causality.

## Corrections

A manual correction changes reason and remarks for the remaining shortage,
never the underlying report, allocated SAH or quantity-based Print/Embroidery
delay contributions. Those two categories cannot be manually fabricated; fix
source quantities to change them. Corrections are private per account and planning upload. The API
requires an authenticated session, CSRF, slide_20 permission and a completed
planning upload. Record keys, line numbers, date, reason enum and remark lengths
are validated. No client-supplied account ID is accepted.

Corrections persist under the configured private_dir/load-analysis-loss directory,
using a SHA-256 account/upload filename, a per-file lock and atomic replacement.
They require no database migration and survive code-only deployment. A save
updates an existing record instead of appending a duplicate. Reset removes only
the current account's selected-upload corrections. Errors remain visible and do
not claim an unsaved edit succeeded. Audit actions use the existing audit log.

## Delivery

Every packaged HTML document has versioned local JavaScript/CSS. The embedded
load-analysis.html URL is versioned too. The package excludes private storage,
credentials and configuration. No report data is rewritten during deployment.
The original HD screenshot action remains available. Static sample KPI/chart/loss
figures have been replaced with source-driven output; missing dates show —.

## Reconciliation

Example agreed with the operator: Plan 100 pcs at SMV 6, Sewing WIP 80 and
Print WIP 20 gives raw Gantt SAH 10, achievable forecast 8, Print Delayed 2 SAH.
Daily loss is max(0, target − achievable). Reserve Planning/Loading Gap first,
then the quantity-based Print/Embroidery delays, then classify remaining uncovered
SAH by other report evidence. Unknown remainder stays Unassigned. Every date
reconciles. Over-target surplus caps attributed loss to the target gap; source
evidence still shows the uncapped WIP pcs/SAH. Forecast before the production
cutoff remains unavailable, not historical zero.
