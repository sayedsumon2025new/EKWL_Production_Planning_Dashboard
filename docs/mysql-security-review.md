# Security review — local migration candidate

Scope: new PHP/PDO API, same-origin adapter, new Notes/admin/archive surfaces,
import/export tools and deployment packaging. This is an implementation review
with focused automated probes, not a penetration-test certification of the entire
legacy dashboard or an audit of the unavailable production/Notes systems.

| Area | Control / evidence | Remaining verification |
| --- | --- | --- |
| SQL injection | Native prepared statements for values; server table/column/operator allowlist; server-selected SQL expressions only; injection probes rejected | Live schema and least-privilege hosted DB grants |
| Authorization / BOLA | Active server profile on every authenticated request; Admin checked independently of frontend flags; per-table source dependency permissions; owned staging rows | Review actual live permissions and expected shared planning access |
| Notes privacy | Queries always constrain owner_id; cross-owner read/update/delete rejected, including Admin | Legacy export owner mapping and post-import audit |
| Sessions | Strict cookie-only PHP sessions, ID rotation, HttpOnly, SameSite Strict, configured Secure, idle/absolute expiration, auth_version reset/revoke checks | Hosted filesystem protection/permissions and HTTPS cookie behavior |
| CSRF | Exact configured Origin plus session CSRF token on POST; no permissive CORS | Actual host/proxy Origin and subdirectory configuration |
| Passwords | password_hash/password_verify; NULL hashes for imported identities; 12–72 byte bound and null rejection prevent bcrypt truncation; current password for ordinary change | Hosted hash capabilities and actual activation workflow |
| Recovery | Hashed 30-minute single-use token; restricted recovery session; token stripped from URL; generic request response | Trusted manual Admin delivery; no automated mail integration |
| Rate limiting | Persistent IP/email login buckets, recovery/file limits and authenticated API 600 calls/user/minute | Hosted real-user tuning; rate-limit table retention/ops |
| XSS | New management UI uses DOM textContent; private Notes HTML remains literal in browser test; feeding labels escaped | Full legacy rendering/third-party dependency audit remains broader than focused probes |
| Uploads | Authenticated CSV permission, size/extension checks, random server filename, private storage and no execution; negative multipart tests | InfinityFree PHP limits may be below 4 MiB; old Storage migration missing |
| Config / archives | Backend/database/tools denied by .htaccess; private data outside publicly served paths where supported; API-authenticated listed archive download only; package excludes config/private/exports | Apache/host denial must be tested before uploading secrets; built-in router tests do not prove Apache rules |
| Errors | Request ID and generic internal failures, no SQL/credentials/stack returned; sensitive exceptions not logged verbatim | Actual host logging visibility/retention |
| Destructive operations | Source exporter READ ONLY; staging database guard, additive schema, default-off cleanup, signed restore proof + active Admin + explicit authorization; retained current data | Production retention review, full backup, paused external writers and approval |
| Deployment/secrets | No hosted SDK/runtime key; ignored local configs; main-ref guard; frontend workflow refuses PHP migration; no destructive FTP sync | Protect actual hosting/repository credentials and separate operator/runtime DB privileges |

Known operational limits: archive files and sessions need writable protected
storage; PHP DDL is not transactional; chunked import recovery retains partial
staging data; Order Bank finalization may exceed shared-host time limits; source
removals are reconciled via a frozen final export into a fresh target, not live CDC.
Database prefixes are isolation aids, not a permission boundary. Test runtime uses
a local root DB identity to create fixtures; **production must not use root**.

No real secrets, source passwords, Auth sessions or refresh tokens are exported or
committed. Auth identity metadata exports contain personal data and must remain
private. Signed restore evidence proves row integrity for that archive, not full
application recovery or permission to delete. New quarter cleanup is not exposed
through the API. External writes must remain paused throughout archive/cleanup.

No production security certification or cutover approval is granted by this file.

## Offline first-Admin SQL helper

The downloadable self-contained HTML uses pinned bcryptjs 3.0.2, cost 12, a secure
browser RNG and no remote resources. Tarball SHA-512 and upstream/vendored JS
SHA-256 provenance are included; only comment-line trailing whitespace was
normalized and the upstream license is retained. Hash-based CSP blocks unexpected
scripts, all network connections and form navigation. The helper only accepts
input from a local file or secure loopback preview, and clears password fields
when its private SQL is downloaded. It never stores plaintext in SQL, logs,
localStorage or a public backend endpoint. Operators must keep generated SQL private.

SQL explicitly selects the staging database, serializes bootstrap with the users
mutex and runs user/profile/audit changes in a transaction. A matching imported
active Admin retains its Auth UUID, profile ID and permissions. General/disabled
users are not promoted. Activated Admin credentials are never replaced and repeat
execution is harmless. The helper grants no direct remote access: a trusted
phpMyAdmin operator still executes the private file. It is not a recovery endpoint.
