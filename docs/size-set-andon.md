# Size Set Andon

Slide 17 adds a third tab alongside Source Table and TNA Performance. All three tabs are restricted to the positive planned EWOs of the selected planning upload. Existing views retain their filters and layout within that EWO scope. Planning changes reset their shared filters and republish the scoped TNA snapshot; report-only EWOs are excluded. Andon has independent TNA Event, Buyer, Line, EWO search and From/To controls. Its table fills the remaining slide viewport and scrolls internally; dates and line headers stay visible.

The selected planning upload's Plan/Day records (`DATA`) supply Line, EWO, Color, Buyer, total planned quantity and the original PSD (`startdate`). Each Line/EWO/Color appears only on its earliest valid PSD, even across multiple POs or repeated later PSD records. Duplicate source record IDs count once. Only positive planned records on configured master lines participate. Invalid/missing PSD rows are counted in a visible note and are not assigned an invented date. Selecting a date range happens after grouping and never moves an entry to another PSD. Colors are shown below the EWO in each cell. The popup quantity sums participating records for that Line/EWO/Color across the selected upload, not just a daily quantity. All dates/Clear restores all first PSD dates.

The full current Size Set snapshot supplies status by exact normalized EWO + Color (trim, case and repeated whitespace normalized). A missing color or no matching color report is red; another color's status is never inherited. Source Table/TNA retain their selected-plan EWO scope and existing shared filters. Andon filters remain independent of those shared filters. Multiple same-color report rows follow the conservative rules below.

- Every matching row's `Next Action to Do\n(What)` is Close/Closed (trimmed, case insensitive): dark green, white text.
- Otherwise, all remaining open rows have Bulk Pattern and a valid adjacent `When` date: dark yellow, dark indigo text.
- Any other action, missing/invalid When or missing report: red.

`T & A Closed` does not override the specified Next Action rule. Date validation accepts source DD-MMM, DD-MMM-YY/YYYY and ISO dates, rejecting impossible dates. A yearless date only establishes that a date was provided; it does not infer lateness. TNA Event filters the open Next Action values; all-closed EWOs use Closed. Clicking an EWO shows first PSD date, color, selected-plan color quantity, selected planning label and all matching Next Action/When evidence. No EWO existing only in the Size Set report is added to the grid.

Planning changes clear the previous entries, filters and popup while loading. Successful planning loads and report refreshes update Andon. Logout clears entries, popup evidence and filters. Report reads reuse the existing authenticated snapshot loading; there are no additional endpoints or database changes.

Validation: `python tests/size-set-andon-browser.py` uses production markup, styles and scripts with synthetic source rows. It checks color rules and report matching, source record de-duplication, first PSD per Line/EWO/Color, same-EWO color isolation, missing PSD, different daily-plan dates and other-line behavior, independent filters, popup evidence, source/TNA switching, plan changes, logout and viewport fit at 1910/1464/926/640 pixels. This runs in the deployment validation job.
