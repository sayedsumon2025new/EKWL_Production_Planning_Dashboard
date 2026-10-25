# Automatic live deployment

The live site is `https://littleboy.kesug.com/`, using the existing CSV-based
MySQL database and accounts. Supabase historical data is outside this setup.

## One-time credentials

In this GitHub repository, open Settings → Secrets and variables → Actions.
Create repository secrets (never commit values or paste them in chat):

- `INFINITYFREE_FTP_HOST`: the exact hostname in InfinityFree FTP Details.
- `INFINITYFREE_FTP_USERNAME`: the hosting FTP username.
- `INFINITYFREE_FTP_PASSWORD`: the hosting FTP password.

These are FTP credentials, not the website Admin password or MySQL hostname.
FTPS with certificate verification is required. This workflow does not fall back
to plaintext FTP or disable TLS verification when the host rejects TLS.

## Each update

1. Change the MySQL code on a branch and open a pull request into `main`.
2. PHP/JS syntax checks, Node regressions and package isolation checks must pass.
3. Merge the tested change. The main-only deploy job uploads public assets and
   backend/API code to `/htdocs/`, with HTML entry points transferred last.
4. The deploy job opens Chrome, checks the release SHA in the page's runtime
   script URL and verifies the anonymous session API returns a CSRF token without
   JavaScript errors. This is a public smoke check; authenticated business flows
   still need operator verification. InfinityFree browser verification can mask
   API responses to curl, so curl is not used as release proof.

The agent cannot inspect or set repository Actions secrets through the current
connector. Missing secrets cause a visible failed deployment, never a false
success or a skipped-success status. Use the deployment job's error as evidence
of what is missing; do not infer access from repository ownership.

## Preserved state and limitations

The payload contains no config directory, `.local.php`, CSVs, SQL, exports,
private storage, CLI tools, database setup or historical Notes. Remote files
are never deleted. Existing `/htdocs/backend/config/config.local.php` and its
protected `ekwl-staging` dependency remain on the host, as does `/ekwl-mysql/`.
Each commit gives runtime scripts/styles a new cache query version.

The upload is serialized and HTML is last, but FTPS updates are not atomic.
Schema/API changes must remain backward-compatible during transfer. For a
rollback, revert the code change on `main` and let Actions redeploy the previous
implementation with a fresh version; retain all accepted database writes.
The operator's private backup from root promotion remains available.

SQL changes are versioned under `database/mysql/` and separately reviewed. No
unauthenticated web migration endpoint is provided. On this no-SSH host, back up
the database privately and apply the additive migration through phpMyAdmin
before releasing code which requires it. Do not reimport the initial installer,
reset users, replace the database or replay unrelated source migrations.
A PHP-only or design change does not require another CSV upload.

The first main deployment failed FTP authentication. After the operator updated
Actions secrets, its retry uploaded runtime files successfully, but HTML was
excluded by overlapping mirror filters and curl returned an empty response.
HTML entry points now use an explicit final `mput *.html` and release verification
uses Chrome. A successful PR validation alone does not establish a live release;
inspect the deploy job and its expected-SHA browser check. The current source
includes operator tools and historical migration evidence; only the allowlisted
runtime payload is deployed.
