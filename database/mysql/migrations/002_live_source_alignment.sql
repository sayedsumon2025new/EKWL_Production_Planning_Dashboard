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
