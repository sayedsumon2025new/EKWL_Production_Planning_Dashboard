-- ONE-TIME INSTALL: NEW EMPTY if0_43242550_ekwl_stage ONLY.

-- If an error appears, stop and inspect it. Do not rerun or delete tables.

-- Contains schema only: no passwords, source data, account activation or live cutover.

USE `if0_43242550_ekwl_stage`;

SET NAMES utf8mb4;

SET time_zone = '+00:00';

CREATE TABLE ekwl_schema_migrations (name VARCHAR(150) PRIMARY KEY,sha256 CHAR(64) NOT NULL,applied_at DATETIME NOT NULL) ENGINE=InnoDB;


-- BEGIN schema.sql

-- Staging only. No DROP statements. Prefix isolates existing Notes tables.

SET NAMES utf8mb4;

SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `ekwl_site_users` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `auth_user_id` VARCHAR(36) NULL,
  `email` VARCHAR(255) NULL,
  `role` VARCHAR(16) NULL,
  `status` VARCHAR(16) NULL,
  `permissions` LONGTEXT NULL,
  `created_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_0` (`auth_user_id`),
  UNIQUE KEY `uq_1` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_plan_uploads` (
  `id` VARCHAR(36) NOT NULL,
  `file_name` TEXT NULL,
  `row_count` BIGINT NULL,
  `status` VARCHAR(20) NULL,
  `planning_month` DATE NULL,
  `sequence_no` BIGINT NULL,
  `planning_id` VARCHAR(255) NULL,
  `uploaded_at` DATETIME(6) NULL,
  `uploaded_by` VARCHAR(36) NULL,
  `revision` BIGINT NULL,
  `expected_daily_rows` BIGINT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_plan_records` (
  `line_no` VARCHAR(255) NULL,
  `buyer` VARCHAR(255) NULL,
  `product_type` VARCHAR(255) NULL,
  `product` VARCHAR(255) NULL,
  `ewo` VARCHAR(255) NULL,
  `stroke` VARCHAR(255) NULL,
  `po` VARCHAR(255) NULL,
  `col` VARCHAR(255) NULL,
  `print` VARCHAR(255) NULL,
  `emb` VARCHAR(255) NULL,
  `outsource` VARCHAR(255) NULL,
  `criteria` VARCHAR(255) NULL,
  `order_qty` DECIMAL(24,8) NULL,
  `planned_qty` DECIMAL(24,8) NULL,
  `strip_plan_qty` DECIMAL(24,8) NULL,
  `manpower` DECIMAL(24,8) NULL,
  `smv` DECIMAL(24,8) NULL,
  `average` DECIMAL(24,8) NULL,
  `total` DECIMAL(24,8) NULL,
  `pcd` DATE NULL,
  `psd` DATE NULL,
  `pfd` DATE NULL,
  `delivery` DATE NULL,
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `upload_id` VARCHAR(36) NULL,
  `source_row` BIGINT NULL,
  `is_summary_row` TINYINT(1) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_0` (`upload_id`,`source_row`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_plan_daily` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `upload_id` VARCHAR(36) NULL,
  `record_id` BIGINT NULL,
  `plan_date` DATE NULL,
  `value` DECIMAL(24,8) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_0` (`record_id`,`plan_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_fabric_cutting_info` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `uploaded_by` VARCHAR(36) NULL,
  `uploaded_at` DATETIME(6) NULL,
  `buyer` VARCHAR(255) NULL,
  `ewo` VARCHAR(255) NULL,
  `color_name` VARCHAR(255) NULL,
  `item_product_type` VARCHAR(255) NULL,
  `style_embellishment_type` VARCHAR(255) NULL,
  `pattern_update` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  `cutting_difficulties` VARCHAR(255) NULL,
  `color_order_qty` DECIMAL(24,8) NULL,
  `fabric_booking_qty` DECIMAL(24,8) NULL,
  `total_fabric_received` DECIMAL(24,8) NULL,
  `fabric_balance` DECIMAL(24,8) NULL,
  `fabric_stock_after_cut` DECIMAL(24,8) NULL,
  `cutable_qty` DECIMAL(24,8) NULL,
  `total_cut_qty` DECIMAL(24,8) NULL,
  `cutting_balance` DECIMAL(24,8) NULL,
  `cutting_percent` DECIMAL(24,8) NULL,
  `pattern_received_date` DATE NULL,
  `replacement_receive_commitment_date` DATE NULL,
  `pattern_received_time` TIME NULL,
  `replace_ask_qty` DECIMAL(24,8) NULL,
  `replacement_settlement_qty` DECIMAL(24,8) NULL,
  `fabrication` VARCHAR(255) NULL,
  `gsm` DECIMAL(24,8) NULL,
  `width` VARCHAR(255) NULL,
  `day_received` DECIMAL(24,8) NULL,
  `bc_consumption` DECIMAL(24,8) NULL,
  `day_cut` DECIMAL(24,8) NULL,
  `source_row` BIGINT NULL,
  `report_batch_id` VARCHAR(36) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_sewing_input_output` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `uploaded_by` VARCHAR(36) NULL,
  `uploaded_at` DATETIME(6) NULL,
  `ewo` VARCHAR(255) NULL,
  `color` VARCHAR(255) NULL,
  `line` VARCHAR(255) NULL,
  `line_no` VARCHAR(255) NULL,
  `po_no` VARCHAR(255) NULL,
  `order_qty` DECIMAL(24,8) NULL,
  `total_input_qty` DECIMAL(24,8) NULL,
  `total_output_qty` DECIMAL(24,8) NULL,
  `total_wip_qty` DECIMAL(24,8) NULL,
  `total_reject_qty` DECIMAL(24,8) NULL,
  `buyer` VARCHAR(255) NULL,
  `source_row` BIGINT NULL,
  `report_batch_id` VARCHAR(36) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_date_wise_production` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `uploaded_by` VARCHAR(36) NULL,
  `uploaded_at` DATETIME(6) NULL,
  `code` VARCHAR(255) NULL,
  `buyer` VARCHAR(255) NULL,
  `ewo` VARCHAR(255) NULL,
  `po_no` VARCHAR(255) NULL,
  `color` VARCHAR(255) NULL,
  `line` VARCHAR(255) NULL,
  `line_no` VARCHAR(255) NULL,
  `output_date` DATE NULL,
  `total_qty` DECIMAL(24,8) NULL,
  `report_batch_id` VARCHAR(36) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_efficiency_run_day_ladder` (
  `item` VARCHAR(255) NOT NULL,
  `day_1` DECIMAL(24,8) NULL,
  `day_2` DECIMAL(24,8) NULL,
  `day_3` DECIMAL(24,8) NULL,
  `day_4` DECIMAL(24,8) NULL,
  `day_5` DECIMAL(24,8) NULL,
  `day_6_plus` DECIMAL(24,8) NULL,
  PRIMARY KEY (`item`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_line_chassis_priority` (
  `line_no` BIGINT NOT NULL,
  `priority_order` BIGINT NOT NULL,
  `product_name` VARCHAR(255) NULL,
  PRIMARY KEY (`line_no`,`priority_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_abp_target` (
  `parameter_name` VARCHAR(255) NOT NULL,
  `target_value` DECIMAL(24,8) NULL,
  `config` LONGTEXT NULL,
  `updated_at` DATETIME(6) NULL,
  PRIMARY KEY (`parameter_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_dashboard_master_settings` (
  `setting_key` VARCHAR(255) NOT NULL,
  `setting_value` TEXT NULL,
  `updated_at` DATETIME(6) NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_slide4_chassis_strength` (
  `item_name` VARCHAR(255) NOT NULL,
  `line_strength` DECIMAL(24,8) NULL,
  `updated_at` DATETIME(6) NULL,
  PRIMARY KEY (`item_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_floor_allocation` (
  `line_no` BIGINT NOT NULL,
  `level` VARCHAR(255) NULL,
  `ie_name_line_block` VARCHAR(255) NULL,
  `employee_id` VARCHAR(255) NULL,
  `updated_at` DATETIME(6) NULL,
  PRIMARY KEY (`line_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_size_set_rows` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `uploaded_by` VARCHAR(36) NULL,
  `uploaded_at` DATETIME(6) NULL,
  `batch_id` VARCHAR(36) NULL,
  `source_row_no` BIGINT NULL,
  `file_name` TEXT NULL,
  `is_active` TINYINT(1) NULL,
  `row_data` LONGTEXT NULL,
  `Code` TEXT NULL,
  `Date` TEXT NULL,
  `EWO No` TEXT NULL,
  `Style No` TEXT NULL,
  `Buyer` TEXT NULL,
  `Buyer Team` TEXT NULL,
  `Color` TEXT NULL,
  `Order Qty` TEXT NULL,
  `source_field_16` TEXT NULL,
  `source_field_17` TEXT NULL,
  `source_field_18` TEXT NULL,
  `Total Print Receive Qty` TEXT NULL,
  `Today Print Return Qty` TEXT NULL,
  `Total Print Return Qty` TEXT NULL,
  `Today EMB Send Qty` TEXT NULL,
  `Total EMB Send Qty` TEXT NULL,
  `Today EMB Receive Qty` TEXT NULL,
  `Total EMB Receive Qty` TEXT NULL,
  `Today EMB Return Qty` TEXT NULL,
  `Total EMB Return Qty` TEXT NULL,
  `csv_column_21` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_0` (`batch_id`,`source_row_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_accessories_rows` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `uploaded_by` VARCHAR(36) NULL,
  `uploaded_at` DATETIME(6) NULL,
  `batch_id` VARCHAR(36) NULL,
  `source_row_no` BIGINT NULL,
  `file_name` TEXT NULL,
  `is_active` TINYINT(1) NULL,
  `row_data` LONGTEXT NULL,
  `report_date` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_0` (`batch_id`,`source_row_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_embellishment_send_receive_rows` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `uploaded_by` VARCHAR(36) NULL,
  `uploaded_at` DATETIME(6) NULL,
  `batch_id` VARCHAR(36) NULL,
  `source_row_no` BIGINT NULL,
  `file_name` TEXT NULL,
  `is_active` TINYINT(1) NULL,
  `Code` TEXT NULL,
  `Date` TEXT NULL,
  `EWO No` TEXT NULL,
  `Style No` TEXT NULL,
  `Buyer` TEXT NULL,
  `Buyer Team` TEXT NULL,
  `Color` TEXT NULL,
  `Order Qty` TEXT NULL,
  `source_field_15` TEXT NULL,
  `source_field_16` TEXT NULL,
  `source_field_17` TEXT NULL,
  `Total Print Receive Qty` TEXT NULL,
  `Today Print Return Qty` TEXT NULL,
  `Total Print Return Qty` TEXT NULL,
  `Today EMB Send Qty` TEXT NULL,
  `Total EMB Send Qty` TEXT NULL,
  `Today EMB Receive Qty` TEXT NULL,
  `Total EMB Receive Qty` TEXT NULL,
  `Today EMB Return Qty` TEXT NULL,
  `Total EMB Return Qty` TEXT NULL,
  `csv_column_21` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_0` (`batch_id`,`source_row_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_order_bank_upload_batches` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `file_name` TEXT NULL,
  `uploaded_at` DATETIME(6) NULL,
  `uploaded_by` VARCHAR(36) NULL,
  `raw_rows` BIGINT NULL,
  `nonblank_rows` BIGINT NULL,
  `status` VARCHAR(255) NULL,
  `source_columns` LONGTEXT NULL,
  `note` TEXT NULL,
  `upload_token` VARCHAR(36) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_0` (`upload_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_order_bank_raw` (
  `Code` TEXT NULL,
  `Buyer` TEXT NULL,
  `Dept` TEXT NULL,
  `EWO` TEXT NULL,
  `PO` TEXT NULL,
  `GmtColor` TEXT NULL,
  `EWO&Color` TEXT NULL,
  `Stroke` TEXT NULL,
  `Description` TEXT NULL,
  `Destination` TEXT NULL,
  `TechPackDate` TEXT NULL,
  `FOB` TEXT NULL,
  `RevisedFOB` TEXT NULL,
  `EFD` TEXT NULL,
  `FRDate` TEXT NULL,
  `CostingSMV` TEXT NULL,
  `UpdatedSMV` TEXT NULL,
  `TotalHour` TEXT NULL,
  `FRHour` TEXT NULL,
  `OrderQty` TEXT NULL,
  `OrderRate` TEXT NULL,
  `Ordervalue` TEXT NULL,
  `Season` TEXT NULL,
  `ContractNo` TEXT NULL,
  `ContractUnit` TEXT NULL,
  `ExecutionUnit` TEXT NULL,
  `Gender` TEXT NULL,
  `ConsumptionQtyInHouse` TEXT NULL,
  `ConsumptionQtyOutSource` TEXT NULL,
  `FabrickgInHouse` TEXT NULL,
  `FabrickgOutSource` TEXT NULL,
  `TotalFabricinKG` TEXT NULL,
  `Ordertype` TEXT NULL,
  `OrderStatus` TEXT NULL,
  `TNADays` TEXT NULL,
  `MMTeam` TEXT NULL,
  `CancelReason` TEXT NULL,
  `Remarks` TEXT NULL,
  `Month` TEXT NULL,
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `upload_batch_id` BIGINT NULL,
  `source_row_no` BIGINT NULL,
  `source_data` LONGTEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_0` (`upload_batch_id`,`source_row_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `ekwl_order_bank_import_rows` (
  `upload_token` VARCHAR(36) NOT NULL,
  `source_row_no` BIGINT NOT NULL,
  `source_data` LONGTEXT NULL,
  `uploaded_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NULL,
  PRIMARY KEY (`upload_token`,`source_row_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT INTO ekwl_schema_migrations(name,sha256,applied_at) VALUES ('schema.sql','7df4ecd6049dd51c6efb636091c00ea5bacb88027044161a8a11e1ca703c7e54',UTC_TIMESTAMP());

-- END schema.sql


-- BEGIN 001_application_services.sql

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

INSERT INTO ekwl_schema_migrations(name,sha256,applied_at) VALUES ('001_application_services.sql','16e571163ec1f40659b3d946d6e8173f06980d75d671d1f76210cedf1b188efb',UTC_TIMESTAMP());

-- END 001_application_services.sql


-- BEGIN 002_live_source_alignment.sql

-- Observed read-only in production on 2026-10-24. Apply only to dedicated staging.
-- Base migration hashes remain unchanged. Never apply to the existing Notes database.
ALTER TABLE ekwl_plan_records ADD COLUMN unit TEXT NULL;
ALTER TABLE ekwl_date_wise_production ADD COLUMN source_row BIGINT NULL;
ALTER TABLE ekwl_site_users ADD COLUMN updated_at DATETIME(6) NULL;
ALTER TABLE ekwl_order_bank_upload_batches ADD COLUMN staging_rows BIGINT NULL;
ALTER TABLE ekwl_order_bank_raw ADD COLUMN `Code-EWO` TEXT NULL, ADD COLUMN uploaded_at DATETIME(6) NULL;
ALTER TABLE ekwl_efficiency_run_day_ladder ADD COLUMN updated_at DATETIME(6) NULL;
ALTER TABLE ekwl_fabric_cutting_info MODIFY COLUMN pattern_received_time TEXT NULL;
ALTER TABLE ekwl_line_chassis_priority DROP PRIMARY KEY, ADD COLUMN id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST, ADD COLUMN updated_at DATETIME(6) NULL, ADD UNIQUE KEY ekwl_chassis_line_order(line_no,priority_order);
ALTER TABLE ekwl_abp_target DROP PRIMARY KEY, ADD COLUMN id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST, ADD UNIQUE KEY ekwl_abp_parameter(parameter_name);
ALTER TABLE ekwl_slide4_chassis_strength DROP PRIMARY KEY, ADD COLUMN id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST, ADD COLUMN sort_order BIGINT NULL;
CREATE TABLE ekwl_order_bank_staging (
 staging_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `Code-EWO` TEXT NULL, `Code` TEXT NULL, `Buyer` TEXT NULL, `Dept` TEXT NULL,
 `EWO` TEXT NULL, `PO` TEXT NULL, `GmtColor` TEXT NULL, `EWO&Color` TEXT NULL,
 `Stroke` TEXT NULL, `Description` TEXT NULL, `Destination` TEXT NULL,
 `TechPackDate` TEXT NULL, `FOB` TEXT NULL, `RevisedFOB` TEXT NULL, `EFD` TEXT NULL,
 `FRDate` TEXT NULL, `CostingSMV` TEXT NULL, `UpdatedSMV` TEXT NULL,
 `TotalHour` TEXT NULL, `FRHour` TEXT NULL, `OrderQty` TEXT NULL, `OrderRate` TEXT NULL,
 `Ordervalue` TEXT NULL, `Season` TEXT NULL, `ContractNo` TEXT NULL,
 `ContractUnit` TEXT NULL, `ExecutionUnit` TEXT NULL, `Gender` TEXT NULL,
 `ConsumptionQtyInHouse` TEXT NULL, `ConsumptionQtyOutSource` TEXT NULL,
 `FabrickgInHouse` TEXT NULL, `FabrickgOutSource` TEXT NULL, `TotalFabricinKG` TEXT NULL,
 `Ordertype` TEXT NULL, `OrderStatus` TEXT NULL, `TNADays` TEXT NULL,
 `MMTeam` TEXT NULL, `CancelReason` TEXT NULL, `Remarks` TEXT NULL, `Month` TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT INTO ekwl_schema_migrations(name,sha256,applied_at) VALUES ('002_live_source_alignment.sql','6f4da4a7bae30e08e67c274b135a76aeb49eb9182079705446f02736629b2445',UTC_TIMESTAMP());

-- END 002_live_source_alignment.sql


-- BEGIN indexes.sql

-- Applied once by tools/mysql/migrate.php, tracked in ekwl_schema_migrations.
CREATE INDEX ekwl_plan_upload_date ON ekwl_plan_uploads(status,uploaded_at);
CREATE INDEX ekwl_plan_records_upload ON ekwl_plan_records(upload_id,criteria,is_summary_row,source_row,id);
CREATE UNIQUE INDEX ekwl_plan_record_identity ON ekwl_plan_records(id,upload_id);
CREATE INDEX ekwl_plan_daily_upload_date ON ekwl_plan_daily(upload_id,plan_date,record_id);
CREATE INDEX ekwl_plan_daily_record_date ON ekwl_plan_daily(record_id,plan_date);
ALTER TABLE ekwl_plan_records ADD CONSTRAINT ekwl_record_upload_fk FOREIGN KEY(upload_id) REFERENCES ekwl_plan_uploads(id);
ALTER TABLE ekwl_plan_daily ADD CONSTRAINT ekwl_daily_record_upload_fk FOREIGN KEY(record_id,upload_id) REFERENCES ekwl_plan_records(id,upload_id);
ALTER TABLE ekwl_order_bank_raw ADD CONSTRAINT ekwl_order_bank_batch_fk FOREIGN KEY(upload_batch_id) REFERENCES ekwl_order_bank_upload_batches(id);
CREATE INDEX ekwl_fabric_ewo ON ekwl_fabric_cutting_info(ewo,color_name);
CREATE INDEX ekwl_fabric_batch ON ekwl_fabric_cutting_info(report_batch_id);
CREATE INDEX ekwl_sewing_ewo ON ekwl_sewing_input_output(ewo,color);
CREATE INDEX ekwl_sewing_batch ON ekwl_sewing_input_output(report_batch_id);
CREATE INDEX ekwl_production_date_ewo ON ekwl_date_wise_production(output_date,ewo);
CREATE INDEX ekwl_production_batch ON ekwl_date_wise_production(report_batch_id,output_date);
CREATE INDEX ekwl_size_active ON ekwl_size_set_rows(is_active,source_row_no);
CREATE INDEX ekwl_ac_active ON ekwl_accessories_rows(is_active,report_date,source_row_no);
CREATE INDEX ekwl_em_active ON ekwl_embellishment_send_receive_rows(is_active,source_row_no);
CREATE INDEX ekwl_bank_batch ON ekwl_order_bank_raw(upload_batch_id,source_row_no);

INSERT INTO ekwl_schema_migrations(name,sha256,applied_at) VALUES ('indexes.sql','341ca7ca627ec27e79c8120e9de7aebe9e93484e529a56aa2d666496fcc6f25b',UTC_TIMESTAMP());

-- END indexes.sql

SELECT 'STAGING SCHEMA INSTALLED' AS result,COUNT(*) AS verified_migration_files FROM ekwl_schema_migrations;
