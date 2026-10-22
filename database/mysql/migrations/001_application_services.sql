-- Additive, prefix-isolated tables; apply only to a dedicated staging database.
CREATE TABLE IF NOT EXISTS ekwl_users (
 id VARCHAR(36) PRIMARY KEY, password_hash VARCHAR(255) NULL,
 auth_version BIGINT NOT NULL DEFAULT 1, created_at DATETIME(6) NOT NULL,
 CONSTRAINT fk_ekwl_identity FOREIGN KEY (id) REFERENCES ekwl_site_users(auth_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS ekwl_rate_limits (
 bucket CHAR(64) PRIMARY KEY, hits INT NOT NULL, expires_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS ekwl_password_tokens (
 token_hash CHAR(64) PRIMARY KEY,user_id VARCHAR(36) NOT NULL,expires_at DATETIME NOT NULL,
 used_at DATETIME NULL,FOREIGN KEY(user_id) REFERENCES ekwl_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS ekwl_reset_requests (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,email VARCHAR(255) NOT NULL,created_at DATETIME NOT NULL,
 resolved_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS ekwl_audit_log (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,actor_id VARCHAR(36) NULL,action VARCHAR(80) NOT NULL,
 target VARCHAR(255) NULL,metadata LONGTEXT NOT NULL,created_at DATETIME(6) NOT NULL,
 INDEX audit_actor_date(actor_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS ekwl_import_jobs (
 id VARCHAR(36) PRIMARY KEY,kind VARCHAR(80) NOT NULL,owner_id VARCHAR(36) NOT NULL,
 state VARCHAR(24) NOT NULL,expected_rows BIGINT NOT NULL,received_rows BIGINT NOT NULL DEFAULT 0,
 metadata LONGTEXT NOT NULL,created_at DATETIME(6) NOT NULL,updated_at DATETIME(6) NOT NULL,
 INDEX import_owner(owner_id,state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS ekwl_import_chunks (
 job_id VARCHAR(36) NOT NULL,chunk_no BIGINT NOT NULL,digest CHAR(64) NOT NULL,
 row_count BIGINT NOT NULL,payload LONGTEXT NOT NULL,PRIMARY KEY(job_id,chunk_no),
 FOREIGN KEY(job_id) REFERENCES ekwl_import_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS ekwl_notes (
 id VARCHAR(36) PRIMARY KEY,owner_id VARCHAR(36) NOT NULL,title VARCHAR(255) NOT NULL,
 content TEXT NOT NULL,updated_at DATETIME(6) NOT NULL,INDEX notes_owner(owner_id,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS ekwl_archive_jobs (
 id VARCHAR(36) PRIMARY KEY,quarter VARCHAR(7) NOT NULL UNIQUE,owner_id VARCHAR(36) NOT NULL,
 state VARCHAR(24) NOT NULL,manifest LONGTEXT NOT NULL,created_at DATETIME(6) NOT NULL,updated_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS ekwl_source_checkpoint (
 source_id VARCHAR(100) NOT NULL,table_name VARCHAR(100) NOT NULL,last_key VARCHAR(255) NULL,
 imported_rows BIGINT NOT NULL DEFAULT 0,updated_at DATETIME(6) NOT NULL,
 PRIMARY KEY(source_id,table_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS ekwl_locks (name VARCHAR(100) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
INSERT IGNORE INTO ekwl_locks VALUES ('snapshots'),('users'),('report-import'),('archives');
CREATE TABLE IF NOT EXISTS ekwl_report_heads (
 kind VARCHAR(32) NOT NULL,scope VARCHAR(32) NOT NULL,batch_id VARCHAR(36) NOT NULL,
 PRIMARY KEY(kind,scope,batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS ekwl_files (
 id VARCHAR(36) PRIMARY KEY,owner_id VARCHAR(36) NOT NULL,sha256 CHAR(64) NOT NULL,
 bytes BIGINT NOT NULL,created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
