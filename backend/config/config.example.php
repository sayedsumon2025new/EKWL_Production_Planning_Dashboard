<?php
declare(strict_types=1);
// Copy to backend/config/config.local.php ON STAGING ONLY; never commit real values.
return [
    'environment' => 'staging',
    'dsn' => 'mysql:host=STAGING_MYSQL_HOST;dbname=DEDICATED_STAGING_DB;charset=utf8mb4',
    'db_user' => 'STAGING_USER', 'db_password' => 'SET_ON_SERVER',
    'origin' => 'https://STAGING_HOST', 'base_path' => '/ekwl-staging/',
    'secure_cookies' => true, 'session_idle_seconds' => 1800,
    'session_absolute_seconds' => 28800,
    'private_dir' => dirname(__DIR__) . '/private',
    'max_body_bytes' => 4194304, 'max_chunk_rows' => 800,
    'maintenance' => false,
    'derived_max_rows' => 150000,
    'allow_archive_cleanup' => false,
    // Configure a random 32+ character secret only for signed restore-test evidence.
    // 'archive_attestation_key' => 'GENERATE_SECURELY_AND_KEEP_PRIVATE',
];
