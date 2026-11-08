# Fabrics Details: Body / Primary and Rib / Supporting

The existing theme, 31-column report, source evidence, Plan EWO modes, cascading
Buyer/Color filters, paging and original CSV export remain. Body contains the
primary fabric and unresolved review rows; Rib contains supporting fabrics,
including other constructions. Original construction/composition are never renamed.

The source grain is EWO + approved/exact master Color + Construction + Composition
+ Booking GSM + Width + normalized Unit. Main/additional booking references do
not split identical fabric specifications. Each fabric's Booking Qty is the exact
sum of its current active upload's matching source rows. The current 13-column
Booking contract supplies neither a structured booking type/status nor stable
line/revision identity. Per the user's instruction, show original lines without
inventing Main/Additional/Revised/Cancelled treatment. Repeated-looking lines or
revision/cancellation reason text require review; do not silently remove quantities.
Superseded upload batches are already excluded by the atomic active-source contract.

For every complete EWO + Color group, the unique largest positive fabric Booking
Qty is Body / Primary, even if its actual construction is Rib. All remaining
fabric specifications are Rib / Supporting. Classification runs in SQL-derived
source calculation before any view filter. Missing/negative quantities, incomplete
specifications, mixed units, tied maxima, suspicious booking lines or an unconfirmed
Order Bank identity keep the entire group's primary assignment under Review.

Order Bank labels are used when exact normalized identity or a currently valid,
approved source/EWO color mapping confirms the match. Original source cells remain
unchanged. Evidence retains the Order Bank/source versions and matching row refs.
No similarity/fuzzy mapping or fabrication of unavailable quantities is performed.

RFD has no dedicated Booking GSM/Width identity. When several booking specifications
share its four matching keys, do not duplicate or proportionally distribute its
fabric-level receipts. Those receipt cells are unavailable; candidate source rows
and the ambiguity remain in evidence. EWO/Color totals retain their existing rules
and repeat across fabric rows; never add their repeated values across Body/Rib.
MCD Live Stock stays blank and Received for Cutting remains excluded.

Model v5 adds per-row reconciliation/specification/master evidence plus verified
raw booking lines to the existing API. Derived materializations use the existing
JSON tables and a new model dependency digest; no source-table/schema migration is
needed. The browser verifies source headings/counts/row identities and role evidence.
The Booking Qty/Total Booking dialog shows the original references, quantities,
units, reasons, source rows and file/batch. CSV exports only the current tab/filter.
