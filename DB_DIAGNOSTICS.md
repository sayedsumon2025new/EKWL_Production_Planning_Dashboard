# Database diagnostics — 17 October 2026

## Status: blocked; no production database changes

The SQL connector rejected both a catalog diagnostic transaction and a minimal read-only server-version/timeout query with `MCP error -32600: You do not have permission to perform this action`. The connector project list does not include this dashboard's production project. Production browser Auth/Data API access works; it does not grant database-management access. No service-role key or account workaround was used.

No index, ANALYZE, policy, function, view, constraint, migration-history or data changes were executed. Existing import/read-access migrations were not rerun. The new `supabase/performance-migration.sql` contains comments only, with a no-op rollback.

| Requested evidence | Result |
| --- | --- |
| Server version, statement timeout, PostgREST max rows | Not readable through current SQL connector |
| Table sizes/row estimates/exact counts | Not collected |
| Index definitions/equivalence and validity | Not collected |
| RLS policies and role/capability function definitions | Not collected |
| seq_scan / seq_tup_read / idx_scan | Not collected |
| Applied migration list | Not collected |
| Five target EXPLAINs, before/after | Not executed; no plan improvement claim |

Repository SQL describes possible objects; it does not prove the current live index catalog. No blind index was added. Browser timeouts observed in earlier overloaded probes are not sufficient evidence to select a particular index. Final normal-opener readiness and coverage reads completed HTTP 200 and matched OLD exactly.

## Reviewable read-only diagnostics

The following SQL is supplied for a later authorized management connection. It was not executed successfully on production. Its catalog output may contain identifiers in existing definitions: redact identifiers/emails and save aggregates only before sharing. Do not copy production records into this report.

```sql
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'server_version',version(),
 'statement_timeout',current_setting('statement_timeout'),
 'postgrest_max_rows',current_setting('pgrst.db_max_rows',true),
 'table_statistics',(SELECT jsonb_agg(jsonb_build_object('table',relname,'estimated_rows',n_live_tup,'seq_scan',seq_scan,'seq_tup_read',seq_tup_read,'idx_scan',idx_scan,'total_bytes',pg_total_relation_size(relid),'last_analyze',last_analyze,'last_autoanalyze',last_autoanalyze) ORDER BY relname) FROM pg_stat_user_tables WHERE schemaname='public'),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef) ORDER BY tablename,indexname) FROM pg_indexes WHERE schemaname='public'),
 'policies',(SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check) ORDER BY tablename,policyname) FROM pg_policies WHERE schemaname='public'),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid)) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('current_site_can','current_site_role','get_ready_input_coverage')),
 'migration_table_readable',to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
) AS diagnostics;
ROLLBACK;
```

Migration history, if readable:

```sql
BEGIN READ ONLY;
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
ROLLBACK;
```

Exact counts for verified query source tables (aggregate output only):

```sql
BEGIN READ ONLY;
SELECT 'plan_records' AS table_name,count(*) AS rows FROM public.plan_records
UNION ALL SELECT 'plan_daily',count(*) FROM public.plan_daily
UNION ALL SELECT 'date_wise_production',count(*) FROM public.date_wise_production
UNION ALL SELECT 'order_bank_raw',count(*) FROM public.order_bank_raw;
ROLLBACK;
```

## EXPLAIN templates for the five audit targets

The Order Bank target includes first-page latest-view and subsequent pinned-table forms. These queries match current frontend columns/filter/order and the existing 1,000-row page size; pagination is intentionally unchanged. The selected completed upload is resolved inside SQL, with no production identifier literal. For an accurate chosen month/sequence comparison, scope the subquery to the same reviewed selection rather than assuming a different latest upload.

Run first under a read-only transaction and the intended authenticated claims/role. SQL-editor `postgres` plans without user claims are **not** browser RLS plans; permission-gated functions/views can otherwise return no rows. Establish the test claims using your approved management workflow without printing identifiers. Do not weaken policies, alter persistent role settings or invoke write RPCs. The supplied coverage function is defined as stable SQL in the repository; verify the live definition remains pure SELECT before enabling ANALYZE. `EXPLAIN (FORMAT JSON)` alone is the safe first inspection if its live purity is unverified.

These EXPLAIN ANALYZE templates are for SELECTs only. `BEGIN READ ONLY` additionally blocks accidental writes. No writing RPC belongs in these diagnostics.

### Selected-upload planning daily page

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
SELECT record_id,plan_date,value FROM public.plan_daily WHERE upload_id=(SELECT id FROM public.plan_uploads WHERE status='complete' ORDER BY uploaded_at DESC,id DESC LIMIT 1) ORDER BY plan_date,record_id LIMIT 1000;
ROLLBACK;
```

### Unfiltered production ordered page

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
SELECT id,code,buyer,ewo,po_no,color,line,line_no,output_date,total_qty FROM public.date_wise_production ORDER BY output_date,id LIMIT 1000;
ROLLBACK;
```

### Order Bank latest page

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
SELECT * FROM public.order_bank_latest_all ORDER BY source_row_no LIMIT 1000;
ROLLBACK;
```

### Order Bank subsequent pinned page

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
SELECT * FROM public.order_bank_raw WHERE upload_batch_id=(SELECT id FROM public.order_bank_upload_batches WHERE status='SUCCESS' ORDER BY uploaded_at DESC,id DESC LIMIT 1) ORDER BY source_row_no LIMIT 1000 OFFSET 1000;
ROLLBACK;
```

### Selected-upload readiness board

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
SELECT upload_id,ewo,buyer,lines,pcd,psd,pfd,delivery,first_plan_date,first_day_plan_qty,starter_qty,fabric_status,cutting_status,print_status,embroidery_status,accessories_status,size_set_status,sewing_status,readiness_score,known_stages,applicable_stages,delivery_risk,risk_reason,sewing_started,input_qty,output_qty,plan_qty,color_details,accessories_uploaded_at,as_of_date FROM public.ewo_readiness_board WHERE upload_id=(SELECT id FROM public.plan_uploads WHERE status='complete' ORDER BY uploaded_at DESC,id DESC LIMIT 1) ORDER BY ewo LIMIT 1000;
ROLLBACK;
```

### Selected-upload ready input coverage

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
SELECT * FROM public.get_ready_input_coverage((SELECT id FROM public.plan_uploads WHERE status='complete' ORDER BY uploaded_at DESC,id DESC LIMIT 1)) ORDER BY ewo LIMIT 1000;
ROLLBACK;
```

## Proposed, not applied

- Check existing equivalent valid indexes before considering `(upload_id, plan_date, record_id)` on `plan_daily`, `(upload_id, source_row, id)` on `plan_records`, `(output_date, id)` on `date_wise_production`, or `(upload_batch_id, source_row_no)` on `order_bank_raw`. These names/columns are verified in frontend queries; their need and benefit remain unproven.
- Only add an index when the actual plan shows a sort/scan it improves; create concurrently outside a transaction, save exact reversible SQL first, then ANALYZE the affected table and repeat identical plans plus parity checks. Remove an unhelpful/regressing new index using its recorded rollback.
- Home summary RPC, server-side Order Bank paging/facets, and RLS auth wrappers remain future proposals. No functions/views/RLS changes were authorized for this database phase.

No pre/post index figures are available because none were applied. Reconnect database management access to the production project before attempting this phase. The already verified frontend release remains live.
