# Compact Gantt layout

The approved presentation places existing tabs and export buttons in one row,
reduces toolbar/legend padding, and lets the Gantt scroll area fill the remaining
slide height. Styles are scoped to slide 07 and screen media; other slides and
calculation/source functions are unchanged.

The summary and lower detail panels start collapsed. Showing the summary keeps
its WIP filter inside it and preserves selections. Expanded detail panels are
scrollable, so long data/method content cannot push controls outside the slide.
PSD and EWO Gantt panels retain their existing hidden/visible behavior and each
can scroll inside the available region. Smaller screens wrap controls and use
the table's horizontal scrollbar rather than overflowing the page.

Color-legend labels are shortened visually. Each keeps its full original rule
in title and accessible label attributes. Report actions remain in the same card
with their original handlers and capture target.

Offline browser validation uses the actual markup/renderer, real copy-data setup
and existing tab-switch function: desktop/laptop height and overflow, same-row
exports/tabs, copy data, PSD switching and summary/WIP controls are checked.
