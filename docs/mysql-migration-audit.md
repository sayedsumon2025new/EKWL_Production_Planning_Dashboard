# EKWL MySQL migration audit

Baseline: `25f9d3a6403bc2a8852285a2858b03e1fe1563f8`. Inventory covers 81 HTML/JS/CSS/PHP/SQL/workflow files and 76 explicit service reference sites. Machine-readable details: `mysql-dependency-inventory.json`.

## Source identity and evidence limits

The production repository initializes `https://rdslpcazdzqjlenbezaf.supabase.co`; this is the expected project ref. The connected project metadata tool returned `You do not have permission to perform this action`. No source SQL query or export was executed successfully for this migration. Repository migrations and tests were inspected; they are not a substitute for live schema/constraint introspection. No source data was modified. Environment readiness returned no configured secrets or external identities. InfinityFree runtime and existing Notes source/database are unavailable.

## Runtime and API mapping

| Existing behavior | Candidate replacement | Status |
| --- | --- | --- |
| Hosted SDK query builder / browser publishable key | `mysql-api-client.js` → same-origin `api/index.php` → allowlisted PDO queries | Implemented; local API and adapter tests pass |
| Auth sessions / JWT | HttpOnly SameSite PHP cookie; CSRF; auth_version revocation | Implemented; local authentication tests pass |
| Admin Edge Function create/update/remove | `users` operation, server-checked active Admin | Implemented; remove revokes access and preserves audit/ownership references |
| Email password recovery | Admin-issued hashed one-use 30-minute token; restricted recovery session | Implemented; automatic email delivery is not available/claimed |
| Planning catalog/records/daily cells | Typed MySQL tables, owned staging uploads, FK/count-verified completion | Implemented; local tests pass |
| Report replace RPC | Resumable chunk jobs and atomic active-batch pointers | Implemented; per-date production replacement tested |
| Flexible Order Bank import | Owned staging tokens, preserved JSON cells/source-column manifest, verified snapshot | Implemented; local exact-cell tests pass; large finalization/hosting duration unverified |
| Size Set / Accessories / Embellishment | Source-preserving staged tables and atomic finalize RPC equivalents | Implemented; local tests pass |
| Chassis, strength, efficiency, ABP, floor/settings | Allowed master-table reads/writes and transactional replacements | Implemented; source schema still needs reconciliation |
| EWO readiness view | Scoped MySQL loader + exact-decimal PHP engine | Local PostgreSQL fixture parity passed; live parity pending |
| Ready-input coverage RPC | Scoped MySQL loader + exact-decimal PHP engine | Local PostgreSQL fixture parity passed; live parity pending |
| Plan-data CSV Storage backup | Authenticated size-limited private CSV storage | Implemented; multipart/hosting tests pending; existing Storage objects are not migrated |
| Realtime | No channel/subscription reference found in production application source | No replacement required from repository evidence |
| Existing `/ekwl-mysql/` Planning Notes | No files or credentials supplied; leave directory/database intact | Owner-mapped import CLI implemented; actual legacy export unavailable |
| New migrated private Notes | Owner-constrained PDO CRUD, Admin does not inherit read access | Implemented and API isolation tested; legacy Notes are not imported |
| Quarterly archive | Admin estimate/step/verify/download and isolated CLI restore | Implemented; local export/restore tests pass; separate signed-proof cleanup CLI defaults off; production authorization pending |

## Feature and calculation preservation

Business aggregations remain in the existing dashboard/module functions. The new adapter preserves row shapes, query filters, ordering, paging and error envelopes. This is an application-specific adapter, not a permissive SQL proxy. Each table/column/operator is allowlisted server-side. Server values, not browser role flags, authorize access. Factory planning data are shared across active dashboard accounts because Home already computes from that data; private Notes remain per-owner. Table permissions include the documented cross-feature evidence dependencies.

| Feature | Source / calculations | API data |
| --- | --- | --- |
| Home / planning KPIs | `renderHome`, `renderS1`, `getFiltered`, selected complete upload | plan_uploads, plan_records, plan_daily |
| Buyer / product / efficiency summaries | renderS3, renderS5, ladder helpers; original frontend formulas | planning + efficiency_run_day_ladder |
| EWO/Feeding / PSD range | buildS6Rows, renderS6 and renderS8; PSD filtering before EWO grouping | selected planning snapshot |
| EWO Gantt / popup / action calendars | build indexes, pooled EWO/color evidence, date/calendar parsers | planning + fabric/sewing/production + active module snapshots/Order Bank |
| Plan vs HW / chassis | renderS7/renderS4, configured master lines, strength and ABP | planning + master settings |
| Fabrics & Cutting | renderS12, source report joins | fabric/sewing/active embellishment |
| Admin/User | existing UI with local API adapter | master tables / self-profile / Admin users endpoint |
| Order Bank / execution | dynamic source JSON, exact strings, pinned batch; existing joins | latest successful Order Bank + planning |
| Size Set / Accessories / Embellishment | existing CSV parser/render/filter/date logic | active or own staging module rows |
| Load Analysis | exact selected SAH/Day totals and shared ABP Daily Capacity | hydrated planning + abp_target |
| Readiness / Coverage | PostgreSQL CTEs and conflict/unknown gates in repository SQL | ported PHP engine, exact local PostgreSQL fixture parity (29 readiness + 9 coverage rows) |

All calculation/helper function locations follow in the machine-readable inventory. Historical SQL, source tests, PostgreSQL functions, RLS policies and fixture files remain in Git for review; staging packaging excludes them. One deliberate CSV correction preserves new planning EWO leading zeros. One feeding-chart label fix escapes source text. No wider business formula rewrite is claimed.

## Source file inventory

| File | Kind | Bytes |
| --- | --- | ---: |
| `.github/workflows/deploy-infinityfree.yml` | yml | 3316 |
| `accessories-module.js` | js | 12536 |
| `dashboard-effects.js` | js | 4920 |
| `dashboard-main.js` | js | 301250 |
| `dashboard-theme.css` | css | 37145 |
| `dashboard-theme.js` | js | 2879 |
| `data-cache.js` | js | 9170 |
| `embellishment-module.js` | js | 13188 |
| `ewo-readiness.css` | css | 1716 |
| `ewo-readiness.js` | js | 9634 |
| `frontend-runtime.js` | js | 7234 |
| `gantt-action-calendars.js` | js | 45385 |
| `gantt-hover.js` | js | 16247 |
| `html2canvas.min.js` | js (third party) | 198690 |
| `index.html` | html | 204746 |
| `load-analysis-bridge.js` | js | 2818 |
| `load-analysis-plan-row.js` | js | 6422 |
| `load-analysis.html` | html | 47579 |
| `order-execution-bridge.js` | js | 4863 |
| `order-execution-plan.html` | html | 173437 |
| `ready-input-coverage.js` | js | 7536 |
| `shared-report-loader.js` | js | 8497 |
| `size-set-module.js` | js | 20825 |
| `slides-config.js` | js | 5342 |
| `supabase/migrations/20260923_audit_fixes.sql` | sql | 5282 |
| `supabase/migrations/20260924_report_replace_where.sql` | sql | 725 |
| `supabase/migrations/20260926_accessories_daily.sql` | sql | 5654 |
| `supabase/migrations/20260926_size_set_module.sql` | sql | 4055 |
| `supabase/migrations/20260927_accessories_psd_report_date.sql` | sql | 3018 |
| `supabase/migrations/20260927_embellishment_send_receive.sql` | sql | 5031 |
| `supabase/migrations/20260928_embellishment_upload_permission.sql` | sql | 2922 |
| `supabase/migrations/20260929_slide4_chassis_strength.sql` | sql | 4290 |
| `supabase/migrations/20260929_slide4_chassis_strength_safe_delete.sql` | sql | 786 |
| `supabase/migrations/20261012093837_chassis_slide10_read_access.sql` | sql | 596 |
| `supabase/migrations/20261014020815_ewo_readiness_board.sql` | sql | 18662 |
| `supabase/migrations/20261014021253_ewo_readiness_query_performance.sql` | sql | 15284 |
| `supabase/migrations/20261014021617_ewo_readiness_daily_unique_scan.sql` | sql | 15181 |
| `supabase/migrations/20261014032704_flexible_date_parser.sql` | sql | 3554 |
| `supabase/migrations/20261014065351_ready_input_coverage.sql` | sql | 11524 |
| `supabase/migrations/20261014065710_ready_input_scoped_query.sql` | sql | 11697 |
| `supabase/order-bank-flexible-import.sql` | sql | 7790 |
| `supabase/order-bank-import-timeout.sql` | sql | 315 |
| `supabase/order-bank-read-access.sql` | sql | 536 |
| `supabase/performance-migration.sql` | sql | 663 |
| `table-visuals.css` | css | 5408 |
| `tests/admin-user.cjs` | cjs | 3491 |
| `tests/audit.cjs` | cjs | 4173 |
| `tests/auth-storage.cjs` | cjs | 1788 |
| `tests/chassis-slide10-access.sql` | sql | 3132 |
| `tests/dashboard-source.js` | js | 489 |
| `tests/data-cache.cjs` | cjs | 8936 |
| `tests/date-parser.cjs` | cjs | 4381 |
| `tests/ewo-feeding.cjs` | cjs | 5953 |
| `tests/ewo-readiness-browser.py` | py | 9292 |
| `tests/ewo-readiness.cjs` | cjs | 3253 |
| `tests/ewo-readiness.sql` | sql | 18383 |
| `tests/fixtures/gantt-before-step3.js` | js | 17855 |
| `tests/frontend-runtime.cjs` | cjs | 6258 |
| `tests/gantt-index-parity.cjs` | cjs | 7809 |
| `tests/gantt-multiple-ewos.cjs` | cjs | 3623 |
| `tests/gantt-multiple-visual.py` | py | 4543 |
| `tests/gantt-plan-sah.cjs` | cjs | 2333 |
| `tests/line-popup.cjs` | cjs | 4847 |
| `tests/load-analysis-totals.cjs` | cjs | 3394 |
| `tests/loading.cjs` | cjs | 19005 |
| `tests/order-bank-import.sql` | sql | 3273 |
| `tests/order-bank-timeout.sql` | sql | 1598 |
| `tests/order-bank-upload.cjs` | cjs | 4745 |
| `tests/order-bank.cjs` | cjs | 4005 |
| `tests/readiness-schema.sql` | sql | 5453 |
| `tests/ready-input-coverage.cjs` | cjs | 3284 |
| `tests/ready-input-coverage.sql` | sql | 7276 |
| `tests/release-assets.py` | py | 6808 |
| `tests/report-replace.sql` | sql | 1350 |
| `tests/s6-psd-range-browser.py` | py | 4218 |
| `tests/slides-navigation.py` | py | 7573 |
| `tests/step1-browser.py` | py | 9269 |
| `tests/step2-browser.py` | py | 8731 |
| `tests/step3-browser.py` | py | 7684 |
| `tests/theme-visual.py` | py | 29472 |
| `three.min.js` | js (third party) | 603445 |

## Explicit service reference inventory

| Source location | Original reference |
| --- | --- |
| `accessories-module.js:161` | `const {error:tableError}=await SB.from('accessories_rows').select('source_row_no').limit(1);` |
| `accessories-module.js:170` | `const {error}=await SB.from('accessories_rows').insert(part);` |
| `accessories-module.js:174` | `const {data,error}=await SB.rpc('finalize_accessories_upload',{` |
| `dashboard-main.js:36` | `const SB = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,{` |
| `dashboard-main.js:163` | `const {data,error}=await readTinySetting('ladder',()=>SB.from('efficiency_run_day_ladder')` |
| `dashboard-main.js:213` | `const {error:upErr}=await SB.from('efficiency_run_day_ladder').upsert(payload,{onConflict:'item'});` |
| `dashboard-main.js:216` | `const {data:existing,error:readErr}=await SB.from('efficiency_run_day_ladder').select('item');` |
| `dashboard-main.js:221` | `const {error:delErr}=await SB.from('efficiency_run_day_ladder').delete().in('item',deleted);` |
| `dashboard-main.js:316` | `const {data,error}=await readTinySetting('chassis',()=>SB.from('line_chassis_priority')` |
| `dashboard-main.js:483` | `const {error}=await SB.from('abp_target').upsert({` |
| `dashboard-main.js:809` | `let q=SB.from(table).select(select);` |
| `dashboard-main.js:836` | `sbPaged(()=>SB.from('plan_records')` |
| `dashboard-main.js:842` | `sbPaged(()=>SB.from('plan_daily').select('record_id,plan_date,value')` |
| `dashboard-main.js:963` | `const {data,error}=await SB.from('plan_uploads').select('sequence_no,planning_id')` |
| `dashboard-main.js:1166` | `const {data:uploads,error:upErr}=await SB.from('plan_uploads')` |
| `dashboard-main.js:2286` | `const {data,error}=await readTinySetting('strength',()=>SB.from('slide4_chassis_strength')` |
| `dashboard-main.js:2363` | `const {data,error}=await SB.rpc('replace_slide4_chassis_strength',{p_rows:rows});` |
| `dashboard-main.js:3600` | `const {data:{session}}=await SB.auth.getSession();` |
| `dashboard-main.js:3602` | `const {data,error}=await SB.functions.invoke('admin-create-user',{` |
| `dashboard-main.js:3655` | `const {data,error}=await SB.from('site_users').select('id,auth_user_id,email,role,status,permissions,created_at').order('created_at',{ascending:true});` |
| `dashboard-main.js:3683` | `const {data:{session}}=await SB.auth.getSession();` |
| `dashboard-main.js:3685` | `const {data,error}=await SB.functions.invoke('admin-create-user',{` |
| `dashboard-main.js:3711` | `const {data:{session}}=await SB.auth.getSession();` |
| `dashboard-main.js:3713` | `const {data,error}=await SB.functions.invoke('admin-create-user',{` |
| `dashboard-main.js:3760` | `let q=SB.from('site_users').select('id,auth_user_id,email,role,status,permissions').eq('auth_user_id',user.id).limit(1);` |
| `dashboard-main.js:3765` | `const r=await SB.from('site_users').select('id,auth_user_id,email,role,status,permissions').ilike('email',user.email).limit(1);` |
| `dashboard-main.js:3775` | `const {data:{session},error}=await SB.auth.getSession();` |
| `dashboard-main.js:3783` | `try{await SB.auth.signOut()}catch(_){}` |
| `dashboard-main.js:3830` | `const {error}=await SB.auth.resetPasswordForEmail(email,{redirectTo});` |
| `dashboard-main.js:3846` | `const {error}=await SB.auth.updateUser({password:p1});` |
| `dashboard-main.js:3848` | `await SB.auth.signOut();` |
| `dashboard-main.js:3862` | `SB.auth.onAuthStateChange((event,session)=>{` |
| `dashboard-main.js:3873` | `const {data,error}=await SB.auth.signInWithPassword({email,password});` |
| `dashboard-main.js:3891` | `try{await SB.auth.signOut()}catch(_){}` |
| `dashboard-main.js:3924` | `try{await SB.auth.signOut()}catch(e){console.error(e)}` |
| `dashboard-main.js:4006` | `const {data:{user}}=await SB.auth.getUser();` |
| `dashboard-main.js:4016` | `const {error}=await SB.auth.signInWithPassword({email,password});` |
| `dashboard-main.js:4020` | `async function sbLogout(){await SB.auth.signOut();await refreshSbAuth()}` |
| `dashboard-main.js:4055` | `const {data:lastSeq,error:seqErr}=await SB.from('plan_uploads').select('sequence_no')` |
| `dashboard-main.js:4061` | `const {data:up,error:ue}=await SB.from('plan_uploads').insert({` |
| `dashboard-main.js:4068` | `const backup=await SB.storage.from('plan-data').upload(safeName,file,{contentType:'text/csv',upsert:false});` |
| `dashboard-main.js:4083` | `const {data,error}=await SB.from('plan_records').insert(batch).select('id,source_row');if(error)throw error;` |
| `dashboard-main.js:4091` | `const {error}=await SB.from('plan_daily').insert(batch);if(error)throw error;done+=batch.length;` |
| `dashboard-main.js:4094` | `const {error:fe}=await SB.from('plan_uploads').update({status:'complete'}).eq('id',uploadId);if(fe)throw fe;` |
| `dashboard-main.js:4222` | `const {data,error}=await SB.rpc('ekwl_save_report',{p_kind:kind,p_rows:rows,p_replace:replace});` |
| `dashboard-main.js:4439` | `const {data,error}=await SB.from('dashboard_master_settings')` |
| `dashboard-main.js:4451` | `const {error}=await SB.from('dashboard_master_settings').upsert({` |
| `dashboard-main.js:4471` | `const {data:{session}}=await SB.auth.getSession();` |
| `dashboard-main.js:4483` | `const {data:{session},error}=await SB.auth.getSession();` |
| `dashboard-main.js:4590` | `const {error}=await SB.from('order_bank_import_rows').insert(chunk);` |
| `dashboard-main.js:4598` | `const {data:a,error}=await SB.rpc('finalize_order_bank_import',{p_upload_token:token,p_file_name:f.name,p_expected_rows:rows.length,p_source_columns:headers});` |
| `dashboard-main.js:4618` | `const {error}=await SB.from('order_bank_import_rows').delete().eq('upload_token',token);` |
| `dashboard-main.js:4686` | `const {data,error}=await SB.rpc('replace_floor_allocation',{p_rows:rows});` |
| `dashboard-main.js:4703` | `const {data,error}=await readTinySetting('floor',()=>SB.from('floor_allocation').select('line_no,level,ie_name_line_block,employee_id,updated_at').order('line_no'));` |
| `dashboard-main.js:4729` | `const {data:existing,error:checkError}=await SB.from('floor_allocation').select('line_no').eq('line_no',lineNo).limit(1);` |
| `dashboard-main.js:4733` | `const {error}=await SB.from('floor_allocation').insert({line_no:lineNo,level,ie_name_line_block:block,employee_id:employeeId});` |
| `dashboard-main.js:5200` | `const {data,error}=await readTinySetting('ladder',()=>SB.from('efficiency_run_day_ladder').select('item,day_1,day_2,day_3,day_4,day_5,day_6_plus').order('item'));` |
| `data-cache.js:44` | `return loadVersionedData('snapshot:'+type,current=>cachedPagedRows(()=>SB.from(table).select(columns).eq('is_active',true).order('source_row_no',{ascending:true}),current),{force});` |
| `data-cache.js:50` | `let query=SB.from(snapshotId===null?'order_bank_latest_all':'order_bank_raw').select('*');` |
| `data-cache.js:82` | `let query=SB.from(table).select(columns);` |
| `embellishment-module.js:176` | `const {error}=await SB.from('embellishment_send_receive_rows').insert(part);` |
| `embellishment-module.js:180` | `const {data,error}=await SB.rpc('finalize_embellishment_upload',{` |
| `ewo-readiness.js:87` | `const {data,error}=await SB.from('plan_uploads').select('id').eq('status','complete')` |
| `ewo-readiness.js:95` | `const {data,error}=await SB.from('ewo_readiness_board').select(RD_COLUMNS).eq('upload_id',uploadId)` |
| `gantt-action-calendars.js:385` | `const {data,error}=await SB.from('fabric_cutting_info').select('ewo,color_name,pattern_received_date,replacement_receive_commitment_date,status').order('id',{ascending:true}).range(from,from+499);` |
| `order-execution-bridge.js:72` | `records=await sbPaged(()=>SB.from('plan_records')` |
| `ready-input-coverage.js:47` | `const {data,error}=await SB.from('plan_uploads').select('id').eq('status','complete').order('uploaded_at',{ascending:false}).limit(1);` |
| `ready-input-coverage.js:51` | `const cutoff=await SB.from('date_wise_production').select('output_date').order('output_date',{ascending:false}).limit(1);` |
| `ready-input-coverage.js:55` | `const {data,error}=await SB.rpc('get_ready_input_coverage',{p_upload_id:upload}).order('ewo',{ascending:true}).range(offset,offset+999);` |
| `shared-report-loader.js:80` | `rows=await paged(()=>SB.from('fabric_cutting_info')` |
| `shared-report-loader.js:84` | `const source=await paged(()=>SB.from('sewing_input_output')` |
| `shared-report-loader.js:94` | `const source=await paged(()=>SB.from('date_wise_production')` |
| `shared-report-loader.js:167` | `return readTinySetting('abp',()=>SB.from('abp_target').select('parameter_name,config')` |
| `size-set-module.js:290` | `const {error:tableError}=await SB.from('size_set_rows').select('source_row_no').limit(1);` |
| `size-set-module.js:298` | `const {error}=await SB.from('size_set_rows').insert(part);` |
| `size-set-module.js:302` | `const {data,error}=await SB.rpc('finalize_size_set_upload',{` |

## Cache / synchronization audit

The current frontend has owner-scoped sessionStorage/IndexedDB bootstrap, a 15-minute planning validation window, per-upload caches, session-generation fences, shared report promises and source-specific invalidation. The migration changes the cache namespace to the local API URL so hosted-source cache data are not reused as MySQL data. Imported source identities retain their IDs; no old browser auth token is trusted. API session revocation also triggers local sign-out. Source migrations must be frozen and reconciled before cutover; removals are not automatically applied by import tools.

## Workflow and deployment audit

The original main-only FTP workflow uploads frontend files without deleting server files and skips missing FTP configuration. On this migration branch, a branch-ref guard blocks manual dispatch from a development branch; an explicit guard refuses to deploy a PHP migration using the frontend-only pipeline. Backend/database/tools/docs/API/private paths are excluded. No production workflow run or production FTP write was requested for this task. A separate offline staging packager excludes real config, private data, exports and source migrations.

## Remaining audit gates

Live source schema, policies, constraints, full data counts, current RPC definitions, actual Notes source/ownership model, actual InfinityFree PHP/MySQL/HTTPS/session/.htaccess/upload limits and source-to-target result parity remain unverified. The candidate schema is not represented as a complete live-schema export. Unknown source fields are rejected instead of discarded.
