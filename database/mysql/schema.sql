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
