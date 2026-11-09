# RFD Master IDs

Data Converter compares Order Bank, Booking and RFD only. Daily Production colour
is excluded from its sources, issue fingerprint, controls and matching criteria.
Its raw tab and existing operational calculations are preserved. Existing legacy
Daily Production mapping rows are preserved in SQL, but are not imported into the
three-source registry or shown as converter colour approvals.

A Master ID identifies normalized six-digit EWO + Order Bank master colour.
Construction, composition, GSM, width and Body/Supporting roles remain separate
fabric specifications. The same garment colour ID is shared across those rows.
No quantities are stored in the registry, aliases or identity audit evidence.

The SQL tables are `ekwl_fabric_master_identities`, `ekwl_fabric_master_aliases`
and `ekwl_fabric_master_events`. Migration 003 is idempotent. Production code also
initializes these tables on the first authenticated Admin registry sync or
converter refresh, matching the existing RFD module installation pattern.

Exact current matches across all three verified sources and valid prior manual
RFD/Booking approvals create confirmed identities. Existing approval IDs, original
actor/time and source evidence are retained in alias references and registry
history; users do not have to repeat valid approvals. IDs are immutable UUIDs with
stable MID display codes. Numbers need not be contiguous.

Subsequent uploads reuse the same EWO/colour identity. New/conflicting names or a
missing reference require review; historical identities remain in SQL and are not
recycled. Revocation disables the current link. Reapproval/restored evidence uses
the existing ID. A source alias previously approved to another target is not
silently reassigned while that approval remains active.

Registry sync and colour approval/revocation are Admin-only, CSRF-protected and
use the source snapshot lock and transactions. A read-only RFD account can inspect
current registry evidence. First population and changes use bounded SQL batches;
unchanged refreshes create no new IDs or audit rows.

`rfd/master-id` accepts `read` or Admin `sync`. The Master ID tab supports Plan EWO
modes, search, master colour/status filters, paging and saved/current evidence.
The evidence dialog includes the most recent 100 registry events; complete history
remains in SQL. Source rows are never rewritten.

Fabrics Details model v7 attaches a confirmed Master ID/code to its EWO evidence
and shows the code below EWO. Confirmation is checked against current sources,
even if the saved registry needs a refresh. Existing source quantities and formulas
are unchanged. The new Fabric Details facet follows Buyer → Colour → Fabric Details
(after Plan/search), and matches individual descriptions in multiline cells. It
changes visible rows, footer totals and export scope without changing source cells.
