# Guided staging upload

`ekwl-staging-20261024.zip` contains 66 reviewed files plus its SHA inventory, directly at the archive root.

Upload and extract only into the confirmed empty `/htdocs/ekwl-staging/` folder.
Do not upload into `/htdocs/` or existing `/htdocs/ekwl-mysql/`.
No credentials, config.local.php, source rows, private archives or activation passwords are included.
This is a staging candidate, not production cutover approval. Verify protected HTTP paths before configuring real credentials.
The installer SQL is included for reference; the operator already imported it and must not rerun it.

ZIP SHA-256: `e322fd70326ee8ef80a51d1d8cc21b33fb0bdf5551695b994eeeead13d6a3468`.

Build: `python tools/mysql/package_staging.py --out NEW_OUTPUT_DIRECTORY`, then zip that directory’s contents.

## Offline initial Admin helper

Download `create-staging-admin-offline.html`, save it locally and open it with a
recent browser. It uses pinned bcryptjs 3.0.2 locally to generate a private SQL
file for phpMyAdmin. No email/password/network request is sent by the form.
Do not upload this helper to the website; remote-hosted mode disables the inputs.
Import its generated SQL only into the staging database. Do not commit or send
the generated SQL file in chat. It contains a private password hash and email.
The SQL targets only `if0_43242550_ekwl_stage`, locks the existing users mutex,
creates an initial Admin only if none is activated, preserves a matching imported
Admin UUID/profile and refuses to elevate a general/disabled user or overwrite
an established Admin password. It is not a production account migration or a
password-reset backdoor. Full source migration still requires a fresh reconciled
target and approved account activation; preserve the source identities.

Build: `python tools/mysql/build_offline_admin_form.py`.
