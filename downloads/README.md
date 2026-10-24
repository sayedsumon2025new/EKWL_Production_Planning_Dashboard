# Guided staging upload

`ekwl-staging-20261024.zip` contains 66 reviewed files plus its SHA inventory, directly at the archive root.

Upload and extract only into the confirmed empty `/htdocs/ekwl-staging/` folder.
Do not upload into `/htdocs/` or existing `/htdocs/ekwl-mysql/`.
No credentials, config.local.php, source rows, private archives or activation passwords are included.
This is a staging candidate, not production cutover approval. Verify protected HTTP paths before configuring real credentials.
The installer SQL is included for reference; the operator already imported it and must not rerun it.

ZIP SHA-256: `e322fd70326ee8ef80a51d1d8cc21b33fb0bdf5551695b994eeeead13d6a3468`.

Build: `python tools/mysql/package_staging.py --out NEW_OUTPUT_DIRECTORY`, then zip that directory’s contents.
