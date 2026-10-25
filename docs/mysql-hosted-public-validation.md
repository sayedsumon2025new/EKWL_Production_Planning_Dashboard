# Public staging validation — 2026-10-24

Normal JavaScript-enabled Chromium through the managed proxy completed the
hosting browser verification. These checks used only the public staging origin;
no user credential or authenticated private dataset was accessed.

- HTTPS staging login page loaded with the expected dashboard title.
- Backend config example, database schema and CLI tool paths each returned 403.
- Public session initialization returned HTTP 200 with no signed-in identity.
- One deliberately nonexistent login returned the generic HTTP 401 envelope.
  The auth DB lookup completed; this does not establish an activated Admin account.
- A POST missing its CSRF token returned 403.
- Anonymous access to the Admin runtime operation returned 401.
- The session cookie is Secure, HttpOnly, SameSite Strict and scoped to
  `/ekwl-staging/`. No session ID/CSRF token value is included in this report.

Anonymous sessions and ordinary auth/rate-limit bookkeeping were created. No
hosting file or source row was modified. Actual authenticated account activation,
role tests, full data migration/reconciliation, restore and hosted capacity remain
pending. Additional production-derived audit evidence is retained privately and
is not included in this publication.
