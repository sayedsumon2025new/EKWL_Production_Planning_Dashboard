# CSV-first live root promotion

The user has chosen a new CSV-based MySQL system instead of importing historical
Supabase data, and explicitly authorized using the root of littleboy.kesug.com.
They report that Planning upload and login work in the existing MySQL site.
This package promotes that database and those accounts; it does not initialize,
copy, clear or rename any database. Historical Supabase data is not included.

## Release

`downloads/ekwl-live-root-20261025.zip` contains files directly at the archive
root for `/htdocs/`. It includes the current MySQL frontend/API and protected
backend, the empty-catalog fix, fresh asset query versions and a password-free
configuration wrapper. It contains no SQL, private export or real credentials.

The wrapper requires the already existing protected file
`/htdocs/ekwl-staging/backend/config/config.local.php`, verifies that it selects
`if0_43242550_ekwl_stage`, retains its DB credentials and private storage path,
and overrides origin, root base path, production mode and cookie name.
**Keep the existing ekwl-staging directory.** The public live URL is `/`.
The root API uses `EKWL_LIVE_SESSION`; the existing subdirectory session keeps
its original cookie name. No existing account password is changed.

## Deployment by the hosting account owner

1. Before overwrite, download a private backup of the existing root website
   files, including its `.htaccess`. Keep backups off the public website.
   If `backend/config/config.local.php` already exists at the root, preserve it
   privately and inspect it before proceeding.
2. In InfinityFree File Manager open `/htdocs/`, not `/htdocs/ekwl-staging/`.
   Upload and extract the live ZIP there. Overwrite only release-listed files.
   Do not delete other server files or directories. Do not touch `/ekwl-mysql/`
   or the existing Notes database. No database import or reinstall is needed.
3. Confirm the root backend config is not browser-readable (403), HTTPS works,
   and `/api/index.php?route=auth/session` returns JSON without an identity when
   signed out. Open `/` and sign in using the working MySQL account. Verify the
   uploaded month/sequence, Planning totals, refresh and logout, then required
   CSV modules, ABP Target and master settings before normal operational use.
4. Remove the uploaded ZIP from public hosting. Keep the private original
   website backup and source Supabase system intact. Retain the existing
   protected config/private-storage directory referenced above.

The agent has no InfinityFree file-upload credentials or browser-control tool;
this release has NOT been uploaded or verified at the root. Root deployment and
hosted authenticated smoke checks remain pending. Other CSV modules and master
settings are not presumed populated from a successful Planning upload.

## Validation

The package inventory and all SHA-256 checksums were checked. It contains no
legacy Notes/staging directory payload, database scripts, private rows or real
config. PHP syntax checks pass. Against the synthetic local MySQL fixture,
production-mode root login uses the distinct live cookie, and the existing real
browser suite passes login, Planning, PSD filter, cache/refresh, Notes isolation,
Order Bank, load analysis, themes, logout and protected paths. This is local
validation, not a claim of completed hosted deployment or full CSV coverage.

## Rollback

Restore the privately saved root website files and `.htaccess` if the root smoke
checks fail. Do not delete or restore over the MySQL database: retain every CSV
upload and accepted write. Restoring the old frontend returns the root to its
old Supabase-backed behavior; MySQL-only writes remain preserved separately and
must be reconciled before any later data consolidation.
