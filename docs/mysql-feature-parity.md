# Feature parity checklist

This checklist describes implemented code and local evidence, not live cutover
approval. See `mysql-migration-audit.md` for 81 source files, 76 service reference
sites and 535 calculation/helper functions at the production baseline.

| Module | Implementation and verification | Outstanding |
| --- | --- | --- |
| Home / planning snapshots | Existing frontend formulas/cache retained; local typed data, complete-upload visibility, scoped cache namespace; real browser/API tests | Live totals and freshness parity |
| Planning CSV / daily cells | Owned staging writes, complete record/daily count checks, composite FK, retry-safe chunks, leading-zero EWO preservation | Actual largest source file and hosted limits |
| Buyers/products/efficiency | Original aggregations and charts unchanged; ladder/master table adapters | Full browser/live KPI comparison |
| EWO detail / Feeding | Existing PSD range filter preserved; Node fixtures and real browser test | Live selected-upload parity |
| Gantt / line popups / action calendars | Original joins, indexes, date helpers and formulas preserved; original regression suites pass | Complete hosted workflow/live evidence comparison |
| Plan vs HW / chassis / strength | Allowlisted master configuration and transactional replacement RPCs | Live master schema/constraint comparison |
| Fabric / Sewing / Production | Resumable upload jobs; active-batch pointer isolation; append and production-date replacement verified | Hosted full-file/time limits |
| ABP / Load Analysis | Original Daily Capacity to CP SAH target and report totals retained; shared loader uses local ABP table; iframe browser and totals tests | Source target values reconciliation |
| Order Bank / execution | Exact JSON cells, source column order, owned staged imports, idempotent activation, no hardcoded buyer columns | Large finalization remains one transaction with paged inserts; hosted duration unverified |
| Size Set | Source-preserving staged rows, activation and active evidence | Live file/row comparison |
| Accessories | Whole-file replacement; `report_date` remains source TEXT, including yearless PSD strings; raw/date consistency checked | Live source schema confirmation |
| Embellishment | Original source headings including trailing newline mapped to safe SQL physical names; outward field names preserved | Live schema confirmation |
| EWO readiness | Scoped MySQL loader + PHP engine; every field agrees on 29 original PG fixture rows | Live Supabase result comparison |
| Ready-input coverage | Scoped 3-day source loader, pooled thresholds, conflicts/unknown gates and exact decimal arithmetic; every field agrees on 9 PG fixture rows | Additional live scenarios and production load |
| Login / logout / sessions | Cookie sessions, strict same-site and Origin/CSRF, idle/absolute timeout, revocation and per-request active-role checks | Hosted HTTPS/cookie/session validation |
| Admin / users | Server-enforced create/update/deactivate/reset link; deactivation retains ownership/audit identities | Actual account inventory, resets and migration notification |
| Recovery | Hashed short-lived one-use token and restricted reset session; Admin delivers link securely | Automatic email delivery not implemented |
| New private Notes | Owner-constrained CRUD; even Admin cannot read another owner's Notes; API and XSS browser probes pass | Actual legacy import/owner proof |
| Existing Notes | Explicit owner-mapped, checksum-checked importer exists; rejects guessed/changed owners | Source export unavailable; existing directory/database untouched |
| CSV Storage backup | Authenticated private local backup, <=4 MiB application cap and host PHP limits | Old Supabase Storage objects not transferred; large-file policy pending |
| Quarter archive | Admin estimate/history/start/resume/verify/download; checksums and isolated field/count restore | Hosted runtime/space and actual history sizes |
| Cleanup | Separate default-off CLI; signed restore evidence, elapsed quarter, explicit authorization, verified Admin, write pause, active-data protections, audit | Production retention review/approval; no automatic deletion |
| Deployment | Migration branch, guarded main-only frontend workflow; offline secret-free package | New staging connection, hosted verification and separate cutover approval |

Other than exact server ports for readiness/coverage, frontend business formulas
remain in their original modules. Deliberate behavior changes are stronger local
password/session policy, Admin-issued recovery instead of email, deactivation
instead of hard user deletion, literal-safe feeding labels, local cache namespace
and string-preserving EWO CSV identifiers. These need user acceptance before cutover.
No Realtime subscription was found in application source; no replacement was added.
Source Supabase SQL/migrations/tests are retained for audit but excluded from the
staging runtime package. No Supabase client SDK/key remains in the runtime JS/HTML.
