# Size Set TNA Performance

The Size Set Performance tab adapts the operator-provided TNA dashboard. Its
Overview, Charts, Order Detail and TNA Sequence use the already authorized Size
Set snapshot in the parent. Shared Size Set filters narrow the supplied rows;
the view issues no additional SQL requests and has no independent CSV upload
or sample data. A local preview is explicitly labeled. Logout removes the frame.
Only messages from the same-origin parent are accepted; report strings are
escaped before HTML insertion. The frame follows the dashboard theme.

## Dates and metrics

- Explicit event years take precedence. Invalid calendar dates are excluded.
- For yearless `24-Oct` dates, the default policy chooses the valid Plan date
  nearest a fully dated source EFD across its previous, same and next years.
  Actual dates use the year nearest Plan (or EFD if Plan is unavailable).
  This is an inference, not a source fact; the view displays inferred-date and
  excluded-event counts and offers `Exclude from timing` instead. Without a
  valid anchor year, yearless events are excluded from timing.
- The initial as-of date uses Asia/Dhaka. Users can change it. Actual dates after
  as-of are not yet completed. Missing actuals become overdue after Plan plus
  grace; future pending events do not lower OTD.
- OTD = on-time actual / (actual recorded by as-of + overdue pending).
  Hit rate = on-time actual / actual recorded by as-of.
  Coverage = actual recorded by as-of / planned events.
  Empty denominators display an unavailable value. Late-only average delay uses
  actual minus Plan in days. Default grace is zero; thresholds are adjustable.
- Optional closed-T&A exclusion is explicit. The sequence uses the 12 Size Set
  event pairs and EFD lead times. CSV exports use the current selection.

## Validation

`tests/size-set-performance.py` runs an offline same-origin browser integration
with synthetic source rows: shared filters, lazy snapshot bridge, future actuals,
OTD denominator, Dec/Jan year inference, invalid dates, literal HTML strings,
all tabs, CSV download, theme updates and logout clearing. Actions runs this
alongside the existing Node and deployment-isolation checks. This does not
claim authenticated reconciliation of the operator's full hosted SS report.
