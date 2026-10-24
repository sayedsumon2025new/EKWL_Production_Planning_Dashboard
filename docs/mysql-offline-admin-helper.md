# Offline initial-Admin helper


`tests/mysql/offline-admin.py` passed a local browser → private generated SQL →
isolated MariaDB → actual PHP authentication round trip. Tests cover password
length/confirmation and field clearing, apostrophes in email/password, no plaintext
in generated SQL, PHP-compatible bcrypt, 72-byte UTF-8 boundary, matching imported
Admin UUID/profile/permission preservation, no general-user promotion, no overwrite
or extra Admin creation on replay and audit use. CSP blocks outbound fetch; no
external resource requests occurred; remote-hosted mode disables password inputs.
The managed cloud browser blocks file URLs by policy, so rendering was tested with
a loopback-only HTML preview, without disabling that policy. The single downloaded
HTML supports ordinary local-file opening on the operator's desktop. No hosted
Admin was created or password handled during these local tests.
