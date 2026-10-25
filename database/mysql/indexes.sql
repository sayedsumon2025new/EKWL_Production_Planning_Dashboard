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
