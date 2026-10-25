# Empty planning catalog validation — 2026-10-25

A new staging database with a successful empty planning catalog now displays
`MySQL connected · no planning` and explains that planning data has not been
imported. It clears stale planning snapshots and cached upload selections.
Malformed responses and network failures continue to display sync errors.

Validation used a new synthetic local MariaDB/PHP fixture, never a hosted account
or production dataset. The empty-state browser regression passed initial login,
refresh, stale cache invalidation and actual aborted-request handling. The API
integration and existing browser suites also passed, including authentication,
CSRF, roles, private Notes, snapshot activation/retries, password recovery,
readiness routes, PSD filtering, themes and logout. The Node suites passed.

This is a review-branch fix. It has not been uploaded to InfinityFree. The
previous staging package does not contain it. It does not reset or change any
root-site or staging account, import production data or authorize cutover.
