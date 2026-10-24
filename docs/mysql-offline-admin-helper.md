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

## phpMyAdmin result-pagination compatibility

phpMyAdmin can replay a SELECT from an imported script with `LIMIT 0,25` appended
when it displays results. Appending that clause after `SELECT ... INTO ... FOR
UPDATE` produces MariaDB error 1064 even when the original import has completed.
The helper now takes the same InnoDB users-row lock with a no-op UPDATE instead.
Only the final aggregate result is a top-level SELECT, and it accepts pagination.
The regression reproduces the old 1064, applies phpMyAdmin-style pagination to
every top-level SELECT in the new script, completes the full PHP-auth round trip
and verifies a second connection still blocks on the no-op UPDATE's row lock.
Existing Admin/no-overwrite and source-identity preservation tests still pass.

If the import banner reports completed queries but a subsequent display query
fails, first check the ready-Admin count or attempt login with the chosen email
and password. Do not delete accounts or automatically re-import the private file.
