# Size Set Andon

Slide 17 adds a third tab alongside Source Table and TNA Performance. All three tabs are restricted to the positive planned EWOs of the selected planning upload. Existing views retain their filters and layout within that EWO scope. Planning changes reset their shared filters and republish the scoped TNA snapshot; report-only EWOs are excluded. Andon has independent TNA Event, Buyer, Line, EWO search and From/To controls. Its table fills the remaining slide viewport and scrolls internally; dates and line headers stay visible.

The selected planning upload supplies the Line/EWO/date scope, positive net planned quantities and Buyer. It uses the same configured chassis master as the Gantt. Source record/date duplicates count once and colors/POs aggregate before selecting each Line/EWO's first positive planned date. Each pair appears once, even when the EWO is planned again later. Another line gets its own first date. Selection occurs before display filters, so narrowing the date range never moves an entry to a later date. All dates/Clear restores the full planning range. The header planning selector changes the upload; there is no second plan selector in Andon.

The current complete Size Set snapshot supplies status by EWO, ignoring color. It is independent of the Source Table filters. It also supports the existing explicitly labeled local CSV preview mode.

- Every matching row's `Next Action to Do\n(What)` is Close/Closed (trimmed, case insensitive): dark green, white text.
- Otherwise, all remaining open rows have Bulk Pattern and a valid adjacent `When` date: dark yellow, dark indigo text.
- Any other action, missing/invalid When or missing report: red.

`T & A Closed` does not override the specified Next Action rule. Date validation accepts source DD-MMM, DD-MMM-YY/YYYY and ISO dates, rejecting impossible dates. A yearless date only establishes that a date was provided; it does not infer lateness. TNA Event filters the open Next Action values; all-closed EWOs use Closed. Clicking an EWO shows first planned date, first-date quantity, selected planning label and all matching Next Action/When evidence. No EWO existing only in the Size Set report is added to the grid.

Planning changes clear the previous entries, filters and popup while loading. Successful planning loads and report refreshes update Andon. Logout clears entries, popup evidence and filters. Report reads reuse the existing authenticated snapshot loading; there are no additional endpoints or database changes.

Validation: `python tests/size-set-andon-browser.py` uses production markup, styles and scripts with synthetic source rows. It checks color rules and report matching, source de-duplication/net quantities, first-date and other-line behavior, independent filters, popup evidence, source/TNA switching, plan changes, logout and viewport fit at 1910/1464/926/640 pixels. This runs in the deployment validation job.
