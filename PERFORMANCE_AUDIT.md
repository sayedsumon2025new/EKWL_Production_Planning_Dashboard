# Performance audit — Phase 0 only

Audit date: 14 October 2026 (Asia/Dhaka). Repository: `sayedsumon2025new/EKWL_Production_Planning_Dashboard`, public `main`, commit `479090de208a15c90bbac6e4a17039cf84e550d7`. Audited in `/workspace/EKWL-main-audit`. The pre-existing `/workspace/EKWL_Production_Planning_Dashboard` checkout was clean but on `work` at `59095f2`; it was not used as the baseline or modified.

**The largest confirmed issue is unconditional downloading of all accessible Fabric/Cutting, Sewing I/O and Date Wise Production rows after the selected planning snapshot, even on Home.** Planning renders before those reports finish, but startup completion and restoring the saved slide wait for them. Many detail modules are already lazy and display only 50–100 rows, yet fetch every matching snapshot row before rendering. The current app does not download every historical table indiscriminately: planning is upload-scoped and historical prefetch is disabled.

Only this Markdown document was added. No application code, existing SQL, tests, permissions, data, or deployed site was changed. No Supabase request, SQL test, migration, upload, account mutation, or database EXPLAIN was executed. No `performance-migration.sql` was created. The two already-applied Order Bank scripts were read only and must not be rerun.

## Evidence and limits

This is a source audit. Live database information in the request is empty. Row counts, compressed response bytes, production first paint, device CPU cost, database execution plans, and which migrations are installed are not independently known. “All rows” below means all rows accessible through the caller's existing RLS, not a bypass of RLS. Expected gains are structural estimates, not measured before/after claims.

For a sequential fetch loop with page size P and N rows, the current request count is `floor(N/P) + 1`: exact page multiples make an extra empty request. Typical P is 1,000; Gantt secondary reads use 500. An unpaginated select is limited by the configured API cap (commonly 1,000). No cardinality should be inferred from that cap.

Repository documents describe an earlier 29,625-row / 37-column Order Bank fixture, a former 5,500-record / 99,000-daily-row plan, and a coverage verification with 36 rows / 56,479 JSON bytes. These are historical evidence, **not current live counts**. DATE_FORMATS.md says that former planning upload was subsequently deleted; it must not be used as a current baseline. READY_INPUT_COVERAGE.md reports a pre-fix 15.648-second query, and EWO_READINESS_BOARD.md reports an earlier 18.337-second readiness query. The source already includes repairs; these timings do not measure current main.

## Current startup and navigation

1. HTML and synchronous scripts parse. Login gate / page shell exists before report loading, but parser-blocking libraries and large inline code delay interactivity.
2. `DOMContentLoaded` restores Auth session; `getAuthorizedSiteUser()` fetches the user's profile by `auth_user_id`, with an email fallback. Active status / role / slide permissions are applied before data access.
3. `bootLiveSupabaseData()` waits for six settings reads: line priority, efficiency ladder, ABP matrix, chassis strength, master settings, and a second read of the same ABP matrix. Line priority is required before valid planning-line filtering; blindly delaying this configuration would change numbers.
4. Only after settings finish does it restore per-user sessionStorage / IndexedDB data and render Home / the current planning slide. Cache is an instant bootstrap followed by full live reload; there is no cheap data-version check.
5. `loadFromSupabase()` reads the completed upload catalog, chooses a month/sequence/upload, then fetches upload-scoped records and daily values concurrently. Each individual dataset is paged sequentially.
6. Planning-backed active slide renders immediately after those two datasets. Three **unfiltered** shared report downloads follow concurrently; pages within each download are sequential. Final render and cache serialization follow.
7. Normal persistent startup restores the saved slide only after `bootLiveSupabaseData()` completes. Some active-slide refresh paths (especially Slide 21) can start earlier and trigger another load when the saved slide is restored.
8. Size Set, Accessories, Embellishment, Order Execution, Readiness and Order Bank generally start on opening. Some cache by nonempty arrays; Order Bank and Readiness reload on revisiting. Order Execution iframe uses deferred `data-src`; Load Analysis has an actual `src` with browser `loading="lazy"`, not an explicit first-open guarantee.

Cold authenticated startup data reads, excluding active-slide extras, are approximately `1 profile (+1 fallback if needed) + 6 settings + 1 catalog + Q(records) + Q(daily) + Q(fabric) + Q(sewing) + Q(production)`, plus Auth SDK session/network behavior. Cached startup still performs these reads.

## Ranked findings and proposed fixes

| Rank / feature or slide | Tables and columns | Rows / when loaded | Confirmed problem | Proposed fix after approval | Expected gain (unmeasured) |
| --- | --- | --- | --- | --- | --- |
| 1 — Home / shared report startup | `fabric_cutting_info`, `sewing_input_output`, `date_wise_production`; explicit projections in inventory | Entire accessible reports on login/restore/refresh, even Home | Unfiltered multi-page downloads; saved slide restoration waits for them | Independent slide/dependency loaders. Home uses planning summaries and needed settings. Gantt/Fabric fetch scoped reconciliation aggregates; production cutoff is a separate scalar | Remove three full report downloads from Home startup; eliminate their parsing/mapping/storage cost there |
| 2 — Home / Planning | `plan_records`, `plan_daily` scoped to `upload_id` | All four criteria + all dates for selected upload, before first live data | Home receives detailed daily cells and criteria used by unopened slides | Exact Home summary query plus small catalog/settings; detail/date/criteria fetch on demand. Preserve complete-snapshot Home scope and first-PSD / priority semantics | Home payload grows with summary groups instead of records × dates |
| 3 — Order Bank (14) | `order_bank_latest_all` / `order_bank_raw`, `*` including flexible source JSON | Entire latest successful snapshot every open/refresh; UI shows 100 | Full snapshot retained/indexed to provide filters/totals; no first-page data until all pages arrive | Pin successful batch and schema metadata; server filtered page (100), exact filtered totals and cascading facets; separate full export path | Example only: 29,625-row fixture becomes 100 detail rows (99.66% fewer detail rows initially), plus small facets/summary |
| 4 — EWO Gantt (7) | Planning + entire shared reports + secondary active snapshot reads | Main chart open/filter/colour toggle/date change | For each cell/EWO, repeated scans of plan, clock, sewing, production, fabric, colours; complete grid and encoded popup payloads rebuilt | Pre-index exact existing grains once per data version; prefix sums; reuse summaries; then chunk/worker if needed. Scope SQL reads to selected-plan EWOs but retain all-line stock and complete cumulative demand | Replace repeated cell × report-row scans with indexed lookups; preserve stacked EWO entries and colours |
| 5 — Fabrics & Cutting (11) | Fabric/sewing + active embellishment `*` + planning | Shared reports at boot; embellishment on first render | Whole active embellishment download; summary/facets/detail recomputed each keystroke; unbounded detail DOM | Separate exact summaries/facets from 50–100 detail rows; query matched pairs or non-plan branch; aggregate daily movements across ALL active dates for selected pairs | Less transfer and large-table DOM; typing does bounded work |
| 6 — Readiness / Coverage (21) | `ewo_readiness_board` explicit columns; `get_ready_input_coverage(uuid)` full return row | All selected-upload EWOs and nested evidence on each load | SQL aggregation already exists; no same-version cache/in-flight dedup; cancelled tokens do not cancel SQL; evidence JSON sent for every EWO | Cache/dedup both loads keyed by user + upload + source versions + Dhaka as-of date / production cutoff; filter/page summaries; lazy evidence endpoint with unchanged rules; EXPLAIN before any SQL rewrite | Avoid repeated expensive view/RPC work; reduce evidence bytes and table DOM |
| 7 — Order Execution (16) | Latest Order Bank `*`, extended `plan_records` projection | Full Order Bank if no shared cached array; records re-read on first selected-plan model | Serial Order Bank then planning read; expensive synchronous joins/model and postMessage structured clone. Latest view queried again per page without batch pinning | Shared versioned/pinned Order Bank loader; share compatible records, or fetch missing fields; lazy subview summaries/detail and separate whole-model need for board/export | Avoid duplicate Order Bank download and reduce main-thread cloning/model work |
| 8 — Size Set (17), Accessories (18), Embellishment (19) | Active `size_set_rows` / `accessories_rows` JSON and embellishment `*` | Entire active snapshot on first open/force; 50 UI rows | Filters/KPIs require whole snapshot; empty cache re-fetches; parallel opens can duplicate loads; filters repeat scans | Pin active batch; server page + exact global/filtered KPIs + facets; shared promises; keep local CSV preview independent | First useful 50 rows no longer wait for entire snapshot |
| 9 — Gantt action calendars / popup | SS/AC active JSON; EM daily movement columns; Order Bank quantities; fabric dates | Action tab first use / 60-second TTL; popup 4 reads per new EWO/colour-set | Calendars download whole active SS/AC/EM before month/EWO/line filters. PSD fetches all SS; Print and EMB have separate caches for same columns. Popup cache includes colours although SQL is EWO-only | Shared versioned EWO-source cache; query visible scope + compact available-month metadata; date parsing identical; share EM movement query. Batch likely popup EWOs only if warranted | Fewer duplicate reads; remove irrelevant snapshot rows from calendar payload |
| 10 — Caching / upload refresh | Planning and shared reports, IndexedDB and sessionStorage | Full reload on boot; generic refresh after several uploads | Owner isolation exists, but no data version or unchanged-data short circuit; giant synchronous JSON stringify/parse; broad invalidation downloads unrelated reports | Query cache with owner/session generation/version and in-flight promises; small version metadata updated atomically after successful writes; dependency-based invalidation | Unchanged refresh transfers metadata only; smaller cache saves |
| 11 — libraries / static shell | No DB | html2canvas in main before body; inline JS; iframe libraries | Main html2canvas and Supabase SDK scripts have no defer; ~300 KB inline JS reparses with HTML; Three.js loads when execution iframe loads | Load html2canvas through one promise on first PNG/copy/export; load Three.js on actual 3D subview; split main inline code in dependency order; preconnect to existing Supabase origin | Remove screenshot library from initial critical path; independently cache JS |
| 12 — Admin/User/Ladder/Chassis settings | Small settings/profile tables | Settings boot; repeat reads Admin open/subtab, ladder fixed view, chassis open, User open | Duplicate ABP startup read; repeated tiny-table queries; not the main volume bottleneck | Share settings promises/cache; retain configuration required by Home/line filtering; User list only permitted module; refresh after save | Cut redundant requests; little raw-byte gain |
| 13 — filter rendering / charts | Local arrays / canvas | Every local filter application / searches | `applyFilter()` can render active planning slide via `renderAll()` and then `renderSlide()` again; comments imply all slides, actual code only Home + active. Many direct oninput handlers, 160-ms debounce in SS/AC/EM | Single affected-slide update, 250–300-ms search debounce, batched DOM and stable event delegation; memoized summaries by version/scope | Avoid duplicate renders and repeated full-array scans |

## Query inventory: reads

The source appendix below preserves exact query text and line locations, including all chained selects, predicates, ordering and pagination. Column groups here keep the overview readable; they are exact current projections, not proposed schema names. Each identifier is found in runtime source or SQL. Cardinalities remain unknown unless explicitly bounded.

**Planning columns (P):** `id,source_row,line_no,buyer,product_type,product,ewo,po,col,print,emb,outsource,order_qty,pcd,delivery,psd,pfd,manpower,smv,criteria,total,is_summary_row`.

**Execution planning columns (EP):** `id,source_row,unit,line_no,buyer,product_type,product,ewo,stroke,po,col,print,emb,outsource,order_qty,planned_qty,pcd,psd,pfd,strip_plan_qty,delivery,manpower,smv,average,criteria,total,is_summary_row`.

**Fabric columns (F):** `id,buyer,ewo,color_name,item_product_type,style_embellishment_type,pattern_update,color_order_qty,fabric_booking_qty,total_fabric_received,fabric_balance,fabric_stock_after_cut,cutable_qty,total_cut_qty,cutting_balance,cutting_percent,status,cutting_difficulties,pattern_received_date,replacement_receive_commitment_date`.

**Sewing columns (S):** `id,ewo,color,line,line_no,total_input_qty,total_output_qty,total_wip_qty,total_reject_qty`.

**Production columns (D):** `id,code,buyer,ewo,po_no,color,line,line_no,output_date,total_qty`.

**Ladder columns (L):** `item,day_1,day_2,day_3,day_4,day_5,day_6_plus`.

**Readiness columns (R):** `upload_id,ewo,buyer,lines,pcd,psd,pfd,delivery,first_plan_date,first_day_plan_qty,starter_qty,fabric_status,cutting_status,print_status,embroidery_status,accessories_status,size_set_status,sewing_status,readiness_score,known_stages,applicable_stages,delivery_risk,risk_reason,sewing_started,input_qty,output_qty,plan_qty,color_details,accessories_uploaded_at,as_of_date`.

**Movement columns (M):** `"Date","EWO No","Color","Today Print Send Qty\n"," Today Print Receive Qty","Today EMB Send Qty","Today EMB Receive Qty"`. The newline and leading-space identifiers are real; do not trim SQL column names.

| Site / table or RPC | Columns / filters / ordering | Approximate rows per logical load | Fires when |
| --- | --- | --- | --- |
| index:3292 — `efficiency_run_day_ladder` | L; order item | All items, unpaginated; defaults contain 23 items, live count unknown | Boot; Admin open; efficiency setting selected |
| index:3344 — same | item | All accessible items, unpaginated | After ladder upsert to find removed items |
| index:3443 — `line_chassis_priority` | line_no,priority_order,product_name; order line_no,priority_order | All configured priorities; valid line set has 47 lines, two priority slots in UI | Boot; Admin open; chassis setting selected |
| index:3575 / 7491 — `abp_target` | parameter_name,config / config; eq parameter_name ABP_MATRIX_2026_27; maybeSingle | 0–1 each; duplicate startup read | Boot (both); Admin open / ABP setting |
| index:3934 — `plan_records` | P; eq upload_id, eq is_summary_row false, in four criteria; order source_row,id; pages 1,000 | All matching selected-upload criteria; invalid master lines filtered locally afterward | Boot/refresh; uncached month or sequence; efficiency-source fallback; dormant historical helper |
| index:3940 — `plan_daily` | record_id,plan_date,value; eq upload_id; order plan_date,record_id; pages 1,000 | ALL daily cells in selected upload, including rows later ignored by record metadata | Same planning snapshot load; one download shared across planning/SAH/clock/efficiency |
| index:4061 — `plan_uploads` | sequence_no,planning_id; eq status complete, planning_month month+'-01'; order sequence_no desc; limit 1 | 0–1 | Upload dialog/month sequence preview |
| index:4244 — `plan_uploads` | id,file_name,uploaded_at,row_count,planning_month,sequence_no,planning_id; status complete; order uploaded_at desc | Completed catalog, unpaginated / API cap | Every loadFromSupabase, including uncached plan switch |
| index:4290 — `fabric_cutting_info` | F; order id; pages 1,000; NO row filter | Entire accessible table | Boot / full refresh / generic post-upload refresh; explicit plan switch may reuse |
| index:4293 — `sewing_input_output` | S; order id; pages 1,000; NO row filter | Entire accessible table | Same as fabric |
| index:4296 — `date_wise_production` | D; order output_date,id; pages 1,000; NO row filter | Entire accessible history | Same as fabric |
| index:4612 — `embellishment_send_receive_rows` | *; eq is_active true; order source_row_no; pages 1,000 | All active report dates in current complete file | First Fabrics render; cached S12_EM_ROWS afterward |
| index:5402 — `slide4_chassis_strength` | item_name,line_strength,sort_order; order sort_order | All entries, UI supports 1–100; seed has 6 | Boot; logical Chassis 10 open; strength setting open; after save verification |
| index:6737 — `site_users` | id,auth_user_id,email,role,status,permissions,created_at; order created_at | User list, unpaginated / API cap | Permitted User Module open/refresh; after user create/update/delete |
| index:6842 / 6847 — `site_users` | id,auth_user_id,email,role,status,permissions; eq auth_user_id / fallback ilike email; limit 1 | 0–1 each | Login/session restore/authorization check |
| index:7132 — `plan_uploads` | sequence_no; eq planning_month; order sequence_no desc; limit 1 (no status filter here) | 0–1 | Before planning upload; differs intentionally from complete-only preview |
| index:7505 — `dashboard_master_settings` | setting_key,setting_value; no row predicate | All settings, unpaginated; UI consumes factory_name and buyer_efficiency_target | Boot |
| index:7766 — `floor_allocation` | line_no,level,ie_name_line_block,employee_id,updated_at; order line_no | All accessible line allocations, unpaginated | Admin open/refresh; after floor upload/add |
| index:7792 — same | line_no; eq line_no; limit 1 | 0–1 | Add-line existence check |
| index:7999 — Order Bank | *; first page order_bank_latest_all, later order_bank_raw eq upload_batch_id; order source_row_no; pages 1,000 | Entire latest SUCCESS snapshot; renders 100 | Every Order Bank open/refresh; successful import while visible |
| index:8265 — ladder | L; order item | All items, unpaginated | Every fixed Ladder subview open/refresh; duplicates central setting loader |
| order-execution-bridge:60 — Order Bank | * from latest view; order source_row_no,id; pages 1,000; no pinned batch across pages | Entire latest snapshot unless ORDER_BANK_RAW_ROWS nonempty | First execution view ready for user/upload; force refresh |
| order-execution-bridge:73 — plan records | EP; same upload, summary and criteria predicates as P; order source_row,id; sbPaged | All matching records for selected upload, even though narrower P was already read | First execution model for selected plan; daily values reuse memory |
| size-set-module:254 — `size_set_rows` | source_row_no,row_data,file_name,uploaded_at; active true; order source_row_no; pages 1,000 | Whole active batch; UI 50 | First Slide 17 open; force refresh/upload; empty rows are not a cache hit |
| accessories-module:141 — `accessories_rows` | same projection / predicates / ordering as Size Set | Whole active complete file, ALL PSD text dates; UI 50 | First Slide 18 open; force refresh/upload; empty rows re-fetch |
| embellishment-module:150 — EM | *; active true; source_row_no order; pages 1,000 | Whole active complete file, ALL Date values; UI 50 | First Slide 19 open; force refresh/upload; also seeds fabric cache |
| size-set:297 / accessories:167 | respective table, source_row_no; limit 1, no active predicate | At most 1 | Availability/permission probe before staging upload |
| ewo-readiness:86 — `plan_uploads` | id; complete; uploaded_at desc,id desc; limit 1 | 0–1 | Readiness open when no active selection |
| ewo-readiness:94 — `ewo_readiness_board` | R; eq upload_id; order ewo; pages 1,000 | One row per eligible EWO, nested all-color evidence | Slide 21 open/refresh; active refresh after planning stage; no persistent result cache |
| ready-input-coverage:46 — `plan_uploads` | id; complete; uploaded_at desc; limit 1 | 0–1 | Coverage when no active selection (separate fallback from readiness) |
| ready-input-coverage:50 — production | output_date; order output_date desc; limit 1 | 0–1 | Every coverage load; SQL RPC independently computes max date |
| ready-input-coverage:54 — `get_ready_input_coverage` | p_upload_id; returns complete view row; order ewo; pages 1,000 | One row per running EWO with next-three-day positive plan, evidence JSON | Every readiness load also launches coverage; optional startup check when already on 21 |
| gantt-hover:25–32 | SS/AC row_data active + JSON EWO eq; EM * active + EWO No eq; Order Bank GmtColor,OrderQty + EWO eq. SS/AC/EM order source_row_no; all page 500 | All source rows for one EWO, colours filtered in JS afterward | First popup per EWO + selected colour-set; four sources concurrent; cached promise |
| gantt-action:46 (size / accessories / print / embroidery) | SS/AC row_data, EM M; active true; source_row_no order; pages 500 | Entire active source; no month/line/EWO DB filter | First corresponding action tab; after 60 sec / explicit refresh / invalidation |
| gantt-action:94–96 (PSD) | Order Bank EWO,GmtColor,OrderQty in EWO ids; SS row_data ALL active; EM M active + in EWO No ids; EM source_row_no order; page 500 | All requested EWO rows; SS entire active file | PSD overview/selected-day summaries; 60-sec promise cache by EWO set |
| gantt-action:397 (cutting compatibility fallback) | ewo,color_name,pattern_received_date,replacement_receive_commitment_date,status; order id; page 500; no filters | Entire fabric table | Cutting tab when nonempty in-memory fabric lacks newer date columns; normally not needed with current projection |
| index:3920 — `sbAll(table,select,filters)` | dynamic select + eq pairs; range 1,000; no stable order | All matching rows | Defined but no runtime call sites found; distinguish from live sbPaged |

## Mutations, RPCs, Storage and Auth (inventory only)

These are existing application operations, not operations performed by this audit. Upload flows must retain their transaction/count/activation checks.

| Call / location | Target / fields / scope | Trigger / size |
| --- | --- | --- |
| saveEfficiencyLadder, index:3341–3349 | ladder upsert item + six days + updated_at, onConflict item; select item; delete in item list | Save/reset; whole small edited ladder, existing delete flow only |
| saveChassisPriority → saveReportAtomically, index:3470 / 7285 | ekwl_save_report(p_kind chassis,p_rows line_no/priority_order/product_name/updated_at,p_replace true) | Chassis save/reset; two nonblank priority slots per configured line |
| saveABPTarget, index:3608 | abp_target upsert parameter_name,target_value,config,updated_at; conflict parameter_name | Save matrix; one record |
| strength save, index:5478 | replace_slide4_chassis_strength(p_rows item_name,line_strength); verification read | Save/reset; 1–100 rows |
| index:7517 | dashboard_master_settings upsert setting_key,setting_value,updated_at; conflict setting_key | Factory name / buyer efficiency save; one setting |
| planning upload, index:7138–7171 | insert plan_uploads(file_name,row_count,status processing,planning_month,sequence_no,planning_id), select id single; private Storage plan-data upload contentType text/csv, upsert false; insert plan_records select id,source_row; insert plan_daily; update upload status complete eq id | CSV upload; plan records batches 300, daily batches 800; source appendix has exact fields/options |
| report uploads, index:7285 | ekwl_save_report(p_kind fabric/sewing/production,p_rows,p_replace) | CSV write. Production replace affects dates in payload; fabric/sewing replace whole report through existing RPC. Never use these mutations as a performance migration |
| Order Bank, index:7654–7682 | order_bank_import_rows insert upload_token,source_row_no,source_data; finalize_order_bank_import(token,file_name,expected_rows,source_columns); failure cleanup delete eq upload_token | CSV staging batches 500, one final activation/count audit; no historical snapshot deletion |
| Floor allocation, index:7749 / 7795 | replace_floor_allocation(p_rows); insert line_no,level,ie_name_line_block,employee_id after existence read | CSV replace / add line; definition of RPC not in repo |
| Size Set, module:305 / 309 | insert batch_id,source_row_no,file_name,row_data; finalize_size_set_upload(batch,expected,file) | CSV staging batches 150; activates one complete file |
| Accessories, module:176 / 180 | insert batch_id,report_date (literal PSD),source_row_no,file_name,row_data; finalize_accessories_upload(batch,expected,file) | CSV staging batches 150; latest function activates one complete file across all PSD values |
| Embellishment, module:181 / 185 | insert batch_id,source_row_no,file_name + 21 source cells; finalize_embellishment_upload(batch,expected,file) | CSV staging batches 150; requires embellishment_upload or active admin; viewing is a separate permission |
| User actions, index:6684 / 6767 / 6795 | functions.invoke admin-create-user with bearer session token, create/update/delete action and selected profile fields | Explicit User Module create/save/remove only; refresh user list afterward |
| Edge Function:23 / 34 / 67 | site_users caller id,email,role,status,auth_user_id eq auth_user_id maybeSingle; target same fields eq id maybeSingle; existing id,email,auth_user_id eq email maybeSingle | Each permitted admin action: caller read + appropriate target/existing read, 0–1 each |
| Edge Function:43 / 56 / 84–85 | site_users update role,status,permissions eq target id; delete eq target id; repair/create payload email,role,status,auth_user_id,optional permissions via update eq existing id or insert | Existing admin operations; server admin client stays server-side |
| Edge Auth admin | deleteUser(target,false); updateUserById password/email_confirm/user_metadata role; createUser email/password/email_confirm/user_metadata role; rollback deleteUser only newly-created account after failed profile save | Explicit user management; authorization actually checks site_users role/status, not user_metadata |
| Front-end Auth | getSession; getUser; signInWithPassword; signOut; resetPasswordForEmail redirectTo; updateUser password; onAuthStateChange | Session boot, sign-in/out, upload modal auth refresh/legacy auth controls, password recovery. No table rows; SDK can refresh tokens. Session/profile checks cannot simply be removed as duplicate report reads |

## Formula and filter constraints for later implementation

- Home needs snapshot-wide metrics even when no detail is visible. Returning only the first 100 plan rows would break totals. `authoritativeOrderQty()` directly SUMs Plan/Day `orderqty`; an older dedup helper/comment remains nearby but is not the authoritative current calculation. Do not replace it with distinct EWO/PO/colour quantity.
- `getFiltered()` and `getMonthFilteredAux()` currently set their month variable to `''`: the global month selects a planning-upload catalog entry, not an additional row-date filter. A selected upload can span calendar months. Blind `gte/lte` on its month would change output.
- Valid master lines are 1–45,47,48 (47 lines), narrowed by configured chassis priorities when present. Preserve default fallback and source-order-dependent selection of the first positive manpower row.
- Feeding uses Plan Data PSD month, one EWO with distinct lines; repeated PSD/PO/colour does not add feeding count. Missing PSD stays unavailable, not zero. Range summaries use the documented line/EWO and PSD rules.
- Gantt retains ALL positive selected-snapshot daily demand for cumulative coverage even if date/EWO/line display is narrowed. It sums legitimate PO/colour allocations, suppresses record_id/date duplicates, displays multiple EWO entries in one line/date cell, and preserves exact condition priority WIP → cutting → cutable → shortage. Stock and cutoff grains differ: sewing line/EWO; cutting EWO across all colours/all lines; production line/date/EWO; global latest actual report date. Fetch a separate global cutoff rather than max of filtered production. Earlier dates and hidden EWO demand must still count.
- Gantt popup exact Plan SAH uses selected source SAH records/colours/dates; don't unify it with superficially similar chart calculations. Current tests guard the source joins and colour changes.
- Fabrics “Not in Plan” branch deliberately ignores selected plan date range. Scoping fabric solely to plan EWOs would eliminate that feature. Its Print/EMB WIP SUMs daily movements across all active report dates for matching pairs. Readiness instead uses latest cumulative receipts less returns. Those are different business rules.
- Size Set/Accessories/Embellishment currently mark one complete file active; multiple report dates within that file must remain accessible. “Latest report date only” would change totals. Accessory PSD is TEXT, can lack a year, and is not safely comparable using ISO date ranges. Size Set TNA excludes invalid/non-year EFD from assigned-year filters and does not infer lateness.
- Order Bank must preserve dynamic source headers, arbitrary added/removed columns, original strings/leading zeroes/blank CSV rows and legacy 40-column snapshots. Explicit projection should fetch schema metadata plus exact source_data for flexible snapshots and a verified legacy projection, not assume 40 fixed display columns. Cascading filters and filtered totals must apply to the full matching snapshot, not the current page.
- Readiness already computes per-colour ceil(80% first-day target), N/A exclusions, Unknown evidence, 100/50/0 scoring and milestone risk in SQL. Coverage uses latest actual production date + 1/2/3 calendar days, pooled stock across lines, cumulative demand by colour, known-zero off-days, and Unknown for dual Print+EMB without shared-piece identity. Preserve all predicates and evidence; current SQL is the baseline.
- Pagination/virtualization must keep current Excel/CSV/PNG/copy output scope. DOM-based exports need a separate complete export data/render path; exporting only virtualized DOM would silently lose rows. Preserve CSS/sticky layout, mobile scroll, dark mode and keyboard/popup behavior.

## SQL, RLS and indexes: audit findings only

All `supabase/*.sql`, migrations and the Edge Function were inspected as source. The foundational CREATE TABLE/policy definitions for several core tables are absent; references in tests are synthetic harnesses, not authoritative live DDL. `current_site_can`, `current_site_role`, `replace_floor_allocation` and the legacy Order Bank foundational definitions are referenced but not fully defined here. Do not invent their schemas or rewrite those access rules without definitions.

Existing source-backed indexes include SS `(is_active,source_row_no)`, `(is_active,row_data->>'EWO')`, `(is_active,row_data->>'Buyer')`; Accessories `(report_date DESC,source_row_no) WHERE is_active` and `(report_date,row_data->>'EWO') WHERE is_active`; EM `source_row_no WHERE is_active` and `"Date" WHERE is_active`; unique `(batch_id,source_row_no)` snapshot constraints; Order Bank staging primary key `(upload_token,source_row_no)`; chassis strength unique normalized name and sort_order. Do not duplicate them.

Candidates requiring live index/EXPLAIN confirmation: selected-upload record and daily ordering, production output_date/id and normalized reconciliation keys, pinned Order Bank batch/source order and latest-success metadata, EM active EWO/source order, Accessories active JSON EWO without report_date leading key. Plain EWO indexes may not help predicates expressed through readiness normalization functions. No blind buyer/PO/colour index list is proposed.

Readiness view is SECURITY INVOKER + security_barrier. Coverage RPC is SECURITY INVOKER with an explicit upload argument; it still aggregates whole evidence source tables in several CTEs. Small returned rows do not prove small DB scan cost. Its global off-day and cutoff logic cannot be narrowed to only the currently searched EWO. The final readiness view directly projects daily rows based on the documented unique record/date key; confirm that constraint before relying on it in new SQL.

Several snapshot policies use `EXISTS(site_users … auth.uid())` and owner predicates; Order Bank and added readiness policies already use scalar `(select current_site_can(...))`. Old report write policies call current_site_can directly. Wrapping stable user checks could reduce per-row work, but correlation/planner behavior needs EXPLAIN. Preserve active status, admin override, legacy slide_4/slide_10 compatibility, separate upload permissions, own staging rows, and policy OR behavior. Do not replace all checks with a generic authenticated-only rule.

Any approved database work belongs ONLY in new `supabase/performance-migration.sql`, idempotent guarded DDL / CREATE OR REPLACE, with a commented explicit rollback section. No destructive data SQL. Restore prior function/view/policy definitions on rollback, not assumed definitions. Prefer invoker aggregates and preserve source RLS. No existing migration edits or rerunning already-applied files.

Five highest-priority **candidate** EXPLAIN targets (actual ranking awaits measurements): selected-upload `plan_daily` ordered scan; unfiltered `date_wise_production` ordered scan; latest-success / pinned-batch Order Bank page; selected-upload readiness view; `get_ready_input_coverage(selected_upload)`. Fabric/sewing scans should also be sampled. In Phase 4 provide SELECT-only `EXPLAIN (ANALYZE, BUFFERS)` using real selected UUIDs and authenticated role/JWT context, including first/deep pages. Running as SQL-editor postgres without equivalent RLS can give misleading costs/results. No EXPLAIN executed here.

## Cache, duplication and main-thread observations

Existing cache isolation is valuable: `dashboardCacheKey()` includes project URL + user id; session-generation guards reject stale loads; explicit logout clears active account planning/shared snapshots and module state. Preserve these tests. Missing pieces: query-level data versions, same-query in-flight dedup, successful empty-result caching, cancellation, and consistent dependency invalidation.

`refreshDashboardAfterSuccessfulUpload()` clears planning cache and reloads all planning + shared reports even for Order Bank/Floor operations. SS/AC/EM uploads reload their own modules and reset Gantt caches; central invalidation needs to cover readiness/coverage and any newly introduced summaries. Settings saves update some in-memory values but are not a universal versioned cache invalidation mechanism. Readiness also changes on Dhaka date boundaries without uploads: source version alone is insufficient.

No broad startup network N+1 loop per plan row was found. The popup performs four scoped sources per first EWO/colour-set, and cache colour keys can repeat identical EWO SQL. The stronger main-thread N+1 pattern is repeated array filtering inside Gantt/chassis cells. `renderS1` and fabric detail emit all matching rows; readiness and coverage render all summary rows. SS/AC/EM already paginate DOM to 50 and Order Bank to 100. Batching `innerHTML` already exists; batch construction alone does not bound large DOM.

Main static source sizes (uncompressed): index.html 504,077 bytes, of which main inline script 295,213 + effects 4,920 + theme listener 117; order-execution-plan.html 169,869 bytes with 121,364 inline JS; load-analysis.html 47,395 bytes with 3,171 inline JS; local html2canvas.min.js 198,709 bytes. Main uses CDN html2canvas 1.4.1; Load Analysis loads local copy upfront in its iframe. Main charts use custom canvas/CSS/SVG code; no Chart.js loader was found. Do not invent a chart-instance migration. Three.js r128 loads synchronously in the execution iframe head; its 3D requestAnimationFrame loops continue once initialized without visible-view gating. `load-analysis-plan-row.js` mixes per-table geometry reads and style writes in fitTables/ResizeObserver. Theme's early attribute application intentionally prevents a theme flash; script deferral must preserve that.

## Validation and next-step gate

Ran every existing `tests/*.cjs` individually (14 files) on audited main; all passed: admin-user, audit, auth-storage, date-parser, ewo-feeding, ewo-readiness, gantt-multiple-ewos, gantt-plan-sah, line-popup, load-analysis-totals, loading, order-bank-upload, order-bank, ready-input-coverage. Node emitted its existing experimental TypeScript stripping warning. No SQL tests ran; browser tests were read but not executed against live credentials. These Node tests use mocks/fixtures and do not prove real-world performance or complete live feature parity.

Before implementation, preserve a baseline for every slide/subview/filter and exports using the same immutable snapshots. Each small step must rerun all Node files, with meaningful parity tests for changed data scope/formulas, and targeted browser fixtures for shell/DOM/layout/export regressions. Existing tests sometimes assert implementation details such as full-snapshot `select('*')` and full shared-report refresh; changing those assertions must retain semantic totals, atomic uploads, permissions and failure/race checks, not merely make new code pass.

Proposed first approved step: separate shared-report startup dependencies and remove the duplicate ABP read while keeping line-master configuration before any planning filtering. Then implement exact Home summaries and page/facet/total APIs, comparison mode, versioning and rendering improvements incrementally. Aggregate replacement must compare all values/keys/Unknowns against the current code/SQL on identical snapshots before switch-over. No temporary double-fetch comparison in normal production mode.

**Questions / facts needed before affected SQL or business-scope changes:**

1. What are the current complete DDL, indexes, constraints, RLS policies, and definitions/grants of current_site_can/current_site_role for core planning, reports, settings, profiles, Order Bank and floor allocation? Which committed readiness/coverage migrations are applied? The two specified Order Bank scripts are already applied by your instruction.
2. What are current row counts and snapshot sizes, API max-row and statement-timeout settings, PostgreSQL version, and representative authenticated EXPLAIN results? Only you need to run read-only diagnostics in your SQL editor.
3. Which slides/subviews are slowest on your usual device and saved startup tab? A sanitized Network/performance trace can establish actual request counts, bytes and render times.
4. Can uploads/settings be modified outside this dashboard? A version record updated only by front-end uploads would otherwise miss changes; transactional triggers or equivalent coverage would be needed.
5. Confirm existing export scope where ambiguous before virtualization. Confirm any desired change to month/Not-in-Plan/cumulative scope separately; this audit proposes preserving current behavior, not changing those business rules.

**STOP: awaiting audit approval. Phases 1–5 have not started.**

## Source appendix — every runtime Supabase call site

Exact source excerpts are included for review; they are not proposed new queries. Repeated callers and lifecycle are described in the inventory above. Generic pagination helper and Gantt helper invocations are included because they determine actual rows fetched. Bundled html2canvas contains JavaScript Array.from calls, not Supabase queries, and is excluded from this call inventory. SQL definitions and test/mock calls are separately covered in the file manifest.

### index.html

Lines 3292–3299:

```js
    const {data,error}=await SB.from('efficiency_run_day_ladder')
      .select('item,day_1,day_2,day_3,day_4,day_5,day_6_plus')
      .order('item');
    if(error)throw error;
    if(Array.isArray(data)&&data.length){
      EFF_LADDER_CACHE=data.map(r=>[
        r.item,N(r.day_1),N(r.day_2),N(r.day_3),N(r.day_4),N(r.day_5),N(r.day_6_plus)
      ]);
```

Lines 3341–3356:

```js
    const {error:upErr}=await SB.from('efficiency_run_day_ladder').upsert(payload,{onConflict:'item'});
    if(upErr)throw upErr;

    const {data:existing,error:readErr}=await SB.from('efficiency_run_day_ladder').select('item');
    if(readErr)throw readErr;
    const keep=new Set(rows.map(r=>r[0].toLowerCase()));
    const deleted=(existing||[]).map(x=>x.item).filter(x=>!keep.has(String(x).toLowerCase()));
    if(deleted.length){
      const {error:delErr}=await SB.from('efficiency_run_day_ladder').delete().in('item',deleted);
      if(delErr)throw delErr;
    }
    EFF_LADDER_CACHE=rows.map(r=>[...r]);
    if(msg)msg.textContent='✓ Saved to SQL';
    setTimeout(()=>{if(msg)msg.textContent=''},2200);
  }catch(e){
    if(msg)msg.textContent='Save failed: '+(e?.message||e);
```

Lines 3443–3450:

```js
    const {data,error}=await SB.from('line_chassis_priority')
      .select('line_no,priority_order,product_name')
      .order('line_no').order('priority_order');
    if(error)throw error;
    const byLine=new Map();
    (data||[]).forEach(r=>{
      const line=Number(r.line_no);
      if(!EKWL_VALID_LINE_SET.has(line))return;
```

Lines 3575–3582:

```js
    const {data,error}=await SB.from('abp_target')
      .select('parameter_name,config')
      .eq('parameter_name','ABP_MATRIX_2026_27')
      .maybeSingle();
    if(error)throw error;
    if(data?.config && typeof data.config==='object'){
      ABP_TARGET_CACHE=JSON.parse(JSON.stringify(data.config));
    }else{
```

Lines 3608–3615:

```js
    const {error}=await SB.from('abp_target').upsert({
      parameter_name:'ABP_MATRIX_2026_27',
      target_value:0,
      config:d,
      updated_at:new Date().toISOString()
    },{onConflict:'parameter_name'});
    if(error)throw error;
    ABP_TARGET_CACHE=JSON.parse(JSON.stringify(d));
```

Lines 3910–3917:

```js
async function sbPaged(queryFactory){
  const out=[],size=1000;
  for(let from=0;;from+=size){
    const {data,error}=await queryFactory().range(from,from+size-1);
    if(error)throw error;
    out.push(...(data||[]));
    if(!data||data.length<size)break;
  }
```

Lines 3920–3930:

```js
async function sbAll(table,select,filters=[]){
  const out=[],size=1000;
  for(let from=0;;from+=size){
    let q=SB.from(table).select(select);
    for(const [k,v] of filters)q=q.eq(k,v);
    const {data,error}=await q.range(from,from+size-1);
    if(error)throw error;
    out.push(...(data||[]));
    if(!data||data.length<size)break;
  }
  return out;
```

Lines 3934–3947:

```js
    sbPaged(()=>SB.from('plan_records')
      .select('id,source_row,line_no,buyer,product_type,product,ewo,po,col,print,emb,outsource,order_qty,pcd,delivery,psd,pfd,manpower,smv,criteria,total,is_summary_row')
      .eq('upload_id',upload.id).eq('is_summary_row',false)
      .in('criteria',['Plan/Day','SAH/Day','Clock Hour/Day','Effi/Day'])
      .order('source_row',{ascending:true}).order('id',{ascending:true})),
    // Download daily values once; both planning and clock-hour maps use this result.
    sbPaged(()=>SB.from('plan_daily').select('record_id,plan_date,value')
      .eq('upload_id',upload.id)
      .order('plan_date',{ascending:true}).order('record_id',{ascending:true}))
  ]);
  const valid=records.filter(r=>!r.is_summary_row&&isChassisMasterLine(r.line_no));
  const planRows=valid.filter(r=>r.criteria==='Plan/Day');
  const sahRows=valid.filter(r=>r.criteria==='SAH/Day');
  const clockRows=valid.filter(r=>r.criteria==='Clock Hour/Day');
```

Lines 4061–4068:

```js
  const {data,error}=await SB.from('plan_uploads').select('sequence_no,planning_id')
    .eq('status','complete').eq('planning_month',month+'-01').order('sequence_no',{ascending:false}).limit(1);
  if(error){box.textContent='Sequence check failed: '+error.message;return;}
  const next=(data?.[0]?.sequence_no||0)+1;
  const autoId='P'+String(next).padStart(2,'0');
  const idBox=document.getElementById('sb-planning-id');
  if(idBox && (!idBox.value.trim() || idBox.dataset.auto==='1')){
    idBox.value=autoId;
```

Lines 4244–4251:

```js
    const {data:uploads,error:upErr}=await SB.from('plan_uploads')
      .select('id,file_name,uploaded_at,row_count,planning_month,sequence_no,planning_id')
      .eq('status','complete')
      .order('uploaded_at',{ascending:false});
    if(loadToken!==SUPABASE_LOAD_TOKEN)return false;
    if(upErr) throw upErr;
    if(!uploads || !uploads.length) throw Error('Supabase-এ কোনো completed upload পাওয়া যায়নি.');
    PLAN_UPLOAD_CATALOG=uploads;
```

Lines 4290–4303:

```js
        sbPaged(()=>SB.from('fabric_cutting_info')
          .select('id,buyer,ewo,color_name,item_product_type,style_embellishment_type,pattern_update,color_order_qty,fabric_booking_qty,total_fabric_received,fabric_balance,fabric_stock_after_cut,cutable_qty,total_cut_qty,cutting_balance,cutting_percent,status,cutting_difficulties,pattern_received_date,replacement_receive_commitment_date')
          .order('id',{ascending:true})),
        sbPaged(()=>SB.from('sewing_input_output')
          .select('id,ewo,color,line,line_no,total_input_qty,total_output_qty,total_wip_qty,total_reject_qty')
          .order('id',{ascending:true})),
        sbPaged(()=>SB.from('date_wise_production')
          .select('id,code,buyer,ewo,po_no,color,line,line_no,output_date,total_qty')
          .order('output_date',{ascending:true}).order('id',{ascending:true}))
      ]);
      if(loadToken!==SUPABASE_LOAD_TOKEN)return false;
      FABRIC_CUTTING_DATA=fabric;
      SEWING_IO_DATA=sewing.map(r=>({
        ewo:r.ewo==null?'':String(r.ewo).replace(/\.0$/,'').trim(),
```

Lines 4612–4619:

```js
    const rows=await sbPaged(()=>SB.from('embellishment_send_receive_rows').select('*').eq('is_active',true).order('source_row_no',{ascending:true}));
    if(session!==SITE_SESSION_GENERATION)return;
    S12_EM_ROWS=rows;S12_EM_ERROR='';
  }catch(e){if(session===SITE_SESSION_GENERATION)S12_EM_ERROR='Embellishment data unavailable';}
  finally{S12_EM_LOADING=false;if(session===SITE_SESSION_GENERATION&&CURRENT_SLIDE===11)renderS12();}
}
function s12CuttingWip(keys,cutByKey,sewingByKey,processKeys,embellishmentByKey){
  // A summary with Print/EMB uses its complete receive total minus input.
```

Lines 5402–5409:

```js
    const {data,error}=await SB.from('slide4_chassis_strength')
      .select('item_name,line_strength,sort_order').order('sort_order');
    if(token!==S4_STRENGTHS_LOAD_TOKEN)return false;
    if(error)throw error;
    if(!data?.length)throw Error(slideLabel(10)+' strength table has no rows');
    S4_STRENGTHS_CACHE=data.map(r=>({item_name:String(r.item_name),line_strength:Number(r.line_strength)}));
    S4_STRENGTHS_ERROR='';
    if(render&&!S4_STRENGTHS_DIRTY)renderS4StrengthSettings();
```

Lines 5478–5485:

```js
    const {data,error}=await SB.rpc('replace_slide4_chassis_strength',{p_rows:rows});
    if(error)throw error;
    if(data?.status!=='SUCCESS'||Number(data.row_count)!==rows.length)throw Error('SQL row-count check failed');
    if(!await loadS4StrengthsFromSQL(false) && !await loadS4StrengthsFromSQL(false))
      throw Error('Saved, but SQL reload failed: '+S4_STRENGTHS_ERROR);
    if(rows.length!==S4_STRENGTHS_CACHE.length||rows.some((r,i)=>r.item_name!==S4_STRENGTHS_CACHE[i].item_name||r.line_strength!==S4_STRENGTHS_CACHE[i].line_strength))
      throw Error('SQL values do not match the edited rows; please retry');
    if(editVersion===S4_STRENGTHS_EDIT_VERSION){
```

Lines 6682–6691:

```js
    const {data:{session}}=await SB.auth.getSession();
    if(!session?.access_token)throw Error('Admin session expired. Please sign in again.');
    const {data,error}=await SB.functions.invoke('admin-create-user',{
      headers:{Authorization:`Bearer ${session.access_token}`},
      body:{action:'create',email,password,role,status,permissions}
    });
    if(error)throw error;
    if(!data?.success)throw Error(data?.error||'User creation failed.');

    if(!data.auth_user_id)throw Error('Auth User ID link missing.');
```

Lines 6737–6744:

```js
    const {data,error}=await SB.from('site_users').select('id,auth_user_id,email,role,status,permissions,created_at').order('created_at',{ascending:true});
    if(error)throw error;
    const rows=data||[];
    body.innerHTML=rows.length?rows.map(u=>{
      const p=u.permissions||{}, ck=k=>`<input type="checkbox" data-perm="${k}" ${umOn(p,k)?'checked':''}>`;
      const authLinked=!!u.auth_user_id;
      return `<tr data-user-id="${u.id}">
        <td>${umEsc(u.email)}</td>
```

Lines 6765–6774:

```js
    const {data:{session}}=await SB.auth.getSession();
    if(!session?.access_token)throw Error('Admin session expired. Please sign in again.');
    const {data,error}=await SB.functions.invoke('admin-create-user',{
      headers:{Authorization:`Bearer ${session.access_token}`},
      body:{action:'update',site_user_id:id,role:selectedRole,status:tr.querySelector('.usr-status').value,permissions}
    });
    if(error)throw error;
    if(!data?.success)throw Error(data?.error||'User update failed.');
    if(msg)msg.textContent='✓ Saved to Supabase';await loadSiteUsers();
  }catch(e){console.error(e);if(msg)msg.textContent='Save failed: '+e.message}
```

Lines 6793–6802:

```js
    const {data:{session}}=await SB.auth.getSession();
    if(!session?.access_token)throw Error('Admin session expired. Please sign in again.');
    const {data,error}=await SB.functions.invoke('admin-create-user',{
      headers:{Authorization:`Bearer ${session.access_token}`},
      body:{action:'delete',site_user_id:id,email:targetEmail}
    });
    if(error)throw error;
    if(!data?.success)throw Error(data?.error||'User remove failed.');
    if(msg)msg.textContent='✓ User permanently removed — Auth + dashboard access deleted';
    await loadSiteUsers();
```

Lines 6842–6854:

```js
  let q=SB.from('site_users').select('id,auth_user_id,email,role,status,permissions').eq('auth_user_id',user.id).limit(1);
  let {data,error}=await q;
  if(error)throw error;
  let profile=data?.[0]||null;
  if(!profile && user.email){
    const r=await SB.from('site_users').select('id,auth_user_id,email,role,status,permissions').ilike('email',user.email).limit(1);
    if(r.error)throw r.error;
    profile=r.data?.[0]||null;
  }
  if(!profile)throw Error('This account is not registered in site_users.');
  if(String(profile.status||'').toLowerCase()!=='active')throw Error('This user is disabled. Contact Admin.');
  return profile;
}
```

Lines 6857–6872:

```js
    const {data:{session},error}=await SB.auth.getSession();
    if(error)throw error;
    if(!session?.user){showSiteLogin();return false}
    const profile=await getAuthorizedSiteUser(session.user);
    unlockSite(session.user,profile);
    return true;
  }catch(e){
    console.error('Authorization failed',e);
    try{await SB.auth.signOut()}catch(_){}
    showSiteLogin(e?.message||'Authorization failed.');
    return false;
  }
}

function siteRecoveryInUrl(){
  const q=new URLSearchParams(location.search);
```

Lines 6912–6919:

```js
    const {error}=await SB.auth.resetPasswordForEmail(email,{redirectTo});
    if(error)throw error;
    siteLoginMessage('Password reset link পাঠানো হয়েছে। Email inbox/spam check করুন।','ok');
  }catch(e){
    console.error(e);
    siteLoginMessage(e?.message||'Reset email পাঠানো যায়নি।','err');
  }finally{btn.disabled=false}
}
```

Lines 6928–6937:

```js
    const {error}=await SB.auth.updateUser({password:p1});
    if(error)throw error;
    await SB.auth.signOut();
    // Remove recovery tokens/code from the address bar without reloading.
    history.replaceState({},document.title,location.pathname);
    document.getElementById('site-new-password').value='';
    document.getElementById('site-confirm-password').value='';
    siteBackToLogin();
    siteLoginMessage('Password updated successfully. নতুন password দিয়ে sign in করুন।','ok');
  }catch(e){
```

Lines 6944–6951:

```js
SB.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY') siteShowNewPassword();
});

async function siteLogin(){
  const email=document.getElementById('site-login-email').value.trim();
  const password=document.getElementById('site-login-password').value;
  const btn=document.getElementById('site-login-btn');
```

Lines 6955–6962:

```js
    const {data,error}=await SB.auth.signInWithPassword({email,password});
    if(error)throw error;
    const profile=await getAuthorizedSiteUser(data.user);
    unlockSite(data.user,profile);
    document.getElementById('site-login-password').value='';
    siteLoginMessage('Login successful.','ok');
    if(!SITE_BOOTED){
      SITE_BOOTED=true;
```

Lines 6973–6980:

```js
    try{await SB.auth.signOut()}catch(_){}
    showSiteLogin(e?.message||'Login failed.');
  }finally{btn.disabled=false}
}
async function siteLogout(){
  closeS2LineDetails();S2_LINE_DETAILS=[];
  const cacheKey=dashboardCacheKey(),fastKey=fastBootCacheKey();
  ++SITE_SESSION_GENERATION;++SUPABASE_LOAD_TOKEN;++PLAN_FILTER_TOKEN;++EFF15_FR_TOKEN;
```

Lines 7001–7008:

```js
  try{await SB.auth.signOut()}catch(e){console.error(e)}
}
document.addEventListener('DOMContentLoaded',initializeSlideUI);
window.addEventListener('hashchange',()=>{
  const linked=requestedSlideFromHash(location.hash);
  if(SITE_USER_PROFILE && linked!==null)goSlide(linked);
});

```

Lines 7083–7090:

```js
 const {data:{user}}=await SB.auth.getUser();
 sbMsg('sb-auth-msg',user?'Signed in: '+user.email:'Not signed in',!!user);
 document.getElementById('login-fields').style.display=user?'none':'block';
 document.getElementById('sb-login-btn').style.display=user?'none':'inline-block';
 document.getElementById('sb-logout-btn').style.display=user?'inline-block':'none';
 return user;
}
async function sbLogin(){
```

Lines 7093–7104:

```js
 const {error}=await SB.auth.signInWithPassword({email,password});
 if(error){sbMsg('sb-auth-msg',error.message,false);return}
 document.getElementById('sb-password').value='';await refreshSbAuth();
}
async function sbLogout(){await SB.auth.signOut();await refreshSbAuth()}
async function parseRawPlanFile(file){
 const text=await file.text(), records=parseRecords(text);
 if(records.length<2)throw Error('CSV is empty.');
 const fields=records.shift();
 const seen=new Set();
 fields.forEach(h=>{if(seen.has(h))throw Error('Duplicate CSV header: '+h);seen.add(h)});
 fields.forEach(h=>{
```

Lines 7132–7152:

```js
  const {data:lastSeq,error:seqErr}=await SB.from('plan_uploads').select('sequence_no')
    .eq('planning_month',planningMonth+'-01').order('sequence_no',{ascending:false}).limit(1);
  if(seqErr)throw seqErr;
  const sequenceNo=(lastSeq?.[0]?.sequence_no||0)+1;
  if(!planningId)planningId='P'+String(sequenceNo).padStart(2,'0');

  const {data:up,error:ue}=await SB.from('plan_uploads').insert({
    file_name:file.name,row_count:rows.length,status:'processing',
    planning_month:planningMonth+'-01',sequence_no:sequenceNo,planning_id:planningId
  }).select('id').single();
  if(ue)throw ue; uploadId=up.id; prog.value=8;

  const safeName=`${uploadId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const backup=await SB.storage.from('plan-data').upload(safeName,file,{contentType:'text/csv',upsert:false});
  if(backup.error)console.warn('CSV backup:',backup.error.message);

  const records=rows.map((r,i)=>({
   upload_id:uploadId,source_row:i+2,is_summary_row:!r['Buyer']||!r['Line #'],
   unit:r['Unit']||null,line_no:r['Line #']||null,buyer:r['Buyer']||null,
   product_type:r['Product Type']||null,product:r['Product']||null,ewo:csvNum(r['EWO']),
   stroke:r['Stroke']||null,po:r['P.O.']||null,col:r['Col']||null,print:r['Print']||null,
```

Lines 7160–7178:

```js
    const {data,error}=await SB.from('plan_records').insert(batch).select('id,source_row');if(error)throw error;
    data.forEach(x=>rowIdMap.set(x.source_row,x.id));done+=batch.length;
    prog.value=8+Math.round(37*done/records.length);sbMsg('sb-upload-msg',`Main rows: ${done}/${records.length}`);
  }
  const daily=[];
  rows.forEach((r,i)=>{const recordId=rowIdMap.get(i+2);dateFields.forEach(h=>daily.push({record_id:recordId,upload_id:uploadId,plan_date:rawHeaderDate(h),value:csvNum(r[h])||0}))});
  done=0;
  for(const batch of csvChunks(daily,800)){
    const {error}=await SB.from('plan_daily').insert(batch);if(error)throw error;done+=batch.length;
    prog.value=45+Math.round(50*done/daily.length);sbMsg('sb-upload-msg',`Daily values: ${done}/${daily.length}`);
  }
  const {error:fe}=await SB.from('plan_uploads').update({status:'complete'}).eq('id',uploadId);if(fe)throw fe;
  prog.value=100;sbMsg('sb-upload-msg','Upload complete. Dashboard refreshing...',true);
  await refreshDashboardAfterSuccessfulUpload('plan',{planUploadId:uploadId});
  setTimeout(closeUploadModal,900);
 }catch(error){
  console.error(error);sbMsg('sb-upload-msg',error?.message||String(error),false);
  if(uploadId)console.warn('Incomplete upload remains with processing status:',uploadId);
 }
```

Lines 7285–7292:

```js
  const {data,error}=await SB.rpc('ekwl_save_report',{p_kind:kind,p_rows:rows,p_replace:replace});
  if(error)throw error;
  if(!data?.success||Number(data.inserted_rows)!==rows.length)throw Error('Upload row-count verification failed');
  return data;
}

async function uploadFabricCutting(){
 if(!requireSitePerm('fabric','Fabrics & Cutting'))return;
```

Lines 7491–7498:

```js
  const {data,error}=await SB.from('abp_target')
    .select('config')
    .eq('parameter_name','ABP_MATRIX_2026_27')
    .maybeSingle();
  if(error)throw error;

  const metrics=Array.isArray(data?.config?.metrics)?data.config.metrics:[];
  const effRow=metrics.find(r=>Array.isArray(r) && String(r[0]||'').trim().toLowerCase()==='efficiency');
```

Lines 7505–7512:

```js
  const {data,error}=await SB.from('dashboard_master_settings')
    .select('setting_key,setting_value');
  if(error)throw error;
  const m=new Map((data||[]).map(r=>[String(r.setting_key),String(r.setting_value??'')]));
  const factory=document.getElementById('cfg-name');
  const eff=document.getElementById('cfg-eff');
  if(factory && m.has('factory_name')) factory.value=m.get('factory_name');
  if(eff && m.has('buyer_efficiency_target')) eff.value=m.get('buyer_efficiency_target');
```

Lines 7517–7524:

```js
  const {error}=await SB.from('dashboard_master_settings').upsert({
    setting_key:key,setting_value:String(value),updated_at:new Date().toISOString()
  },{onConflict:'setting_key'});
  if(error)throw error;
}

window.addEventListener('DOMContentLoaded',async()=>{
  document.body.classList.add('site-locked');
```

Lines 7535–7542:

```js
      const {data:{session}}=await SB.auth.getSession();
      if(session?.user) siteShowNewPassword();
      else siteLoginMessage('Recovery session পাওয়া যায়নি। Reset link আবার request করুন।','err');
    }catch(e){
      console.error('Recovery startup:',e);
      siteLoginMessage(e?.message||'Recovery link verify করা যায়নি।','err');
    }
    return;
```

Lines 7547–7554:

```js
    const {data:{session},error}=await SB.auth.getSession();
    if(error)throw error;
    if(session?.user){
      const profile=await getAuthorizedSiteUser(session.user);
      unlockSite(session.user,profile);
      SITE_BOOTED=true;

      // Cache may paint instantly, but Supabase is always checked and reloaded.
```

Lines 7654–7669:

```js
    const {error}=await SB.from('order_bank_import_rows').insert(chunk);
    if(error)throw Error(`Upload failed near CSV record ${i+2}: ${error.message}`);
    checkSession();
    const completed=Math.min(i+500,rows.length);
    if(progress)progress.value=completed/rows.length*90;
    msg.textContent=`Uploading… ${completed.toLocaleString()} / ${rows.length.toLocaleString()} rows · ${headers.length} columns`;
  }
  msg.textContent='Validating SQL row count and activating snapshot…';checkSession();
  const {data:a,error}=await SB.rpc('finalize_order_bank_import',{p_upload_token:token,p_file_name:f.name,p_expected_rows:rows.length,p_source_columns:headers});
  if(error)throw error;
  activated=true;checkSession();
  if(!a||a.status!=='SUCCESS'||Number(a.staging_rows)!==rows.length||Number(a.raw_rows)!==rows.length||Number(a.source_column_count)!==headers.length)throw Error('SQL upload audit does not match this CSV.');
  if(progress)progress.value=100;
  audit.innerHTML=`<table class="dt"><tbody>
   <tr><td>CSV Rows</td><td class="num">${rows.length.toLocaleString()}</td></tr>
   <tr><td>SQL Raw Rows</td><td class="num">${Number(a.raw_rows).toLocaleString()}</td></tr>
```

Lines 7682–7689:

```js
    const {error}=await SB.from('order_bank_import_rows').delete().eq('upload_token',token);
    if(error)msg.textContent+=' · Incomplete upload cleanup failed; the previous snapshot remains active.';
  }
 }finally{ORDER_BANK_UPLOADING=false;if(btn)btn.disabled=false;}
}


function selectUploadReport(type){
```

Lines 7749–7756:

```js
    const {data,error}=await SB.rpc('replace_floor_allocation',{p_rows:rows});
    if(error)throw error;
    const a=Array.isArray(data)?data[0]:data;
    if(!a||a.status!=='SUCCESS'||Number(a.inserted_rows)!==rows.length)throw Error('SQL row-count validation failed');
    msg.textContent=`✓ Floor Allocation updated: ${Number(a.inserted_rows).toLocaleString()} rows | Missing Rows: 0 | Status: SUCCESS`;
  msg.textContent=msg.textContent+' · refreshing live dashboard…';
     await refreshDashboardAfterSuccessfulUpload('floor');
     msg.textContent=msg.textContent.replace(' · refreshing live dashboard…','')+' · Live Supabase refreshed';
```

Lines 7766–7773:

```js
    const {data,error}=await SB.from('floor_allocation').select('line_no,level,ie_name_line_block,employee_id,updated_at').order('line_no');
    if(error)throw error;
    const rows=data||[];
    box.innerHTML=`<table class="dt"><thead><tr><th>Line</th><th>Level</th><th>IE Name & Line Block</th><th>ID</th></tr></thead><tbody>${
      rows.map(r=>`<tr><td class="num">${r.line_no}</td><td>${esc(r.level||'')}</td><td>${esc(r.ie_name_line_block||'')}</td><td>${esc(r.employee_id||'')}</td></tr>`).join('')
    }</tbody></table><div class="modal-msg" style="margin-top:6px">Total Lines: ${rows.length.toLocaleString()}</div>`;
  }catch(e){box.innerHTML=`<div class="modal-msg">Load failed: ${esc(e?.message||String(e))}</div>`;}
}
```

Lines 7792–7802:

```js
    const {data:existing,error:checkError}=await SB.from('floor_allocation').select('line_no').eq('line_no',lineNo).limit(1);
    if(checkError)throw checkError;
    if(existing?.length){msg.textContent=`Line ${lineNo} already exists. Add Row-এর জন্য নতুন Line দিন।`;return;}
    const {error}=await SB.from('floor_allocation').insert({line_no:lineNo,level,ie_name_line_block:block,employee_id:employeeId});
    if(error)throw error;
    form.reset();
    msg.textContent=`✓ Line ${lineNo} added to SQL. Refreshing dashboard…`;
    try{
      await refreshDashboardAfterSuccessfulUpload('floor');
      msg.textContent=`✓ Line ${lineNo} added to SQL. Floor Allocation refreshed.`;
    }catch(refreshError){
```

Lines 7999–8006:

```js
      let query=SB.from(snapshotId===null?'order_bank_latest_all':'order_bank_raw').select('*');
      if(snapshotId!==null)query=query.eq('upload_batch_id',snapshotId);
      const {data,error}=await query.order('source_row_no',{ascending:true}).range(from,from+pageSize-1);
      if(error)throw error;
      if(sessionGeneration!==SITE_SESSION_GENERATION)return;
      const page=data||[];all.push(...page);
      if(snapshotId===null&&page.length)snapshotId=page[0].upload_batch_id;
      if(msg)msg.textContent=`Loading raw SQL… ${fmt(all.length)} rows`;
```

Lines 8265–8272:

```js
    const {data,error}=await SB.from('efficiency_run_day_ladder').select('item,day_1,day_2,day_3,day_4,day_5,day_6_plus').order('item');
    if(error)throw error;
    const rows=data||[];
    const avg=(field)=>rows.length?rows.reduce((s,r)=>s+N(r[field]),0)/rows.length:0;
    k.innerHTML=`<div class="kpi"><div class="kpi-lbl">Items</div><div class="kpi-val">${fmt(rows.length)}</div><div class="kpi-sub">SQL ladder</div></div>
      <div class="kpi"><div class="kpi-lbl">Avg Day-1</div><div class="kpi-val">${avg('day_1').toFixed(1)}%</div><div class="kpi-sub">Target</div></div>
      <div class="kpi"><div class="kpi-lbl">Avg Day-3</div><div class="kpi-val">${avg('day_3').toFixed(1)}%</div><div class="kpi-sub">Target</div></div>
      <div class="kpi"><div class="kpi-lbl">Avg Day-6 & 6+</div><div class="kpi-val">${avg('day_6_plus').toFixed(1)}%</div><div class="kpi-sub">Target</div></div>`;
```

### accessories-module.js

Lines 141–148:

```js
      const {data,error}=await SB.from('accessories_rows')
        .select('source_row_no,row_data,file_name,uploaded_at').eq('is_active',true)
        .order('source_row_no',{ascending:true}).range(offset,offset+999);
      if(error)throw error;
      if(token!==AC_LOAD_TOKEN||session!==SITE_SESSION_GENERATION||userId!==SITE_AUTH_USER?.id)return;
      rows.push(...(data||[]));if((data||[]).length<1000)break;
    }
    accessoriesSetRows(rows,rows[0]?.file_name||'',rows[0]?.uploaded_at||'','sql');
```

Lines 167–174:

```js
    const {error:tableError}=await SB.from('accessories_rows').select('source_row_no').limit(1);
    if(tableError)throw tableError;
    const batchId=crypto.randomUUID();
    for(let offset=0;offset<rows.length;offset+=150){
      if(session!==SITE_SESSION_GENERATION||userId!==SITE_AUTH_USER?.id)throw Error('Session changed during upload.');
      const part=rows.slice(offset,offset+150).map(row=>({
        batch_id:batchId,report_date:row.row_data.PSD.trim(),source_row_no:row.source_row_no,
        file_name:file.name,row_data:row.row_data
```

Lines 176–187:

```js
      const {error}=await SB.from('accessories_rows').insert(part);
      if(error)throw Error(`Rows ${offset+1}–${Math.min(offset+part.length,rows.length)}: ${error.message}`);
      acMessage('ac-upload-msg',`Staging PSD report dates… ${acCount(Math.min(offset+part.length,rows.length))} / ${acCount(rows.length)} rows`);
    }
    const {data,error}=await SB.rpc('finalize_accessories_upload',{
      p_batch_id:batchId,p_expected_rows:rows.length,p_file_name:file.name
    });
    if(error)throw error;
    if(data?.status!=='SUCCESS'||Number(data?.uploaded_rows)!==rows.length)throw Error('SQL row-count audit did not match. Previous snapshot remains active.');
    acMessage('ac-upload-msg',`✓ ${acCount(rows.length)} rows verified and activated. Report Date comes from each row's PSD.`);
    await loadAccessoriesModule(true);
    resetGanttHoverCache();
```

### embellishment-module.js

Lines 150–157:

```js
      const {data,error}=await SB.from('embellishment_send_receive_rows').select('*').eq('is_active',true)
        .order('source_row_no',{ascending:true}).range(offset,offset+999);
      if(error)throw error;
      if(token!==EM_LOAD_TOKEN||session!==SITE_SESSION_GENERATION||userId!==SITE_AUTH_USER?.id)return;
      rows.push(...(data||[]));if((data||[]).length<1000)break;
    }
    embellishmentSetRows(rows,rows[0]?.file_name||'',rows[0]?.uploaded_at||'','sql');
    S12_EM_ROWS=rows;S12_EM_ERROR='';if(CURRENT_SLIDE===11)renderS12();
```

Lines 181–192:

```js
      const {error}=await SB.from('embellishment_send_receive_rows').insert(part);
      if(error)throw Error(`Rows ${offset+1}–${Math.min(offset+part.length,rows.length)}: ${error.message}`);
      emMessage('em-upload-msg',`Staging… ${emCount(Math.min(offset+part.length,rows.length))} / ${emCount(rows.length)} rows`);
    }
    const {data,error}=await SB.rpc('finalize_embellishment_upload',{
      p_batch_id:batchId,p_expected_rows:rows.length,p_file_name:file.name
    });
    if(error)throw error;
    if(data?.status!=='SUCCESS'||Number(data?.uploaded_rows)!==rows.length)
      throw Error('SQL row-count audit failed; previous snapshot remains active.');
    emMessage('em-upload-msg',`✓ ${emCount(rows.length)} rows verified and activated. ${data.report_dates} report dates in the snapshot.`);
    await loadEmbellishmentModule(true);
```

### ewo-readiness.js

Lines 86–101:

```js
      const {data,error}=await SB.from('plan_uploads').select('id').eq('status','complete')
        .order('uploaded_at',{ascending:false}).order('id',{ascending:false}).limit(1);
      if(error)throw error;if(!current())return;
      uploadId=String(data?.[0]?.id||'');
    }
    if(!uploadId){RD_BUSY=false;renderEWOReadinessBoard();return;}
    const rows=[];
    for(let offset=0;;offset+=1000){
      const {data,error}=await SB.from('ewo_readiness_board').select(RD_COLUMNS).eq('upload_id',uploadId)
        .order('ewo',{ascending:true}).range(offset,offset+999);
      if(error)throw error;if(!current())return;
      rows.push(...(data||[]));if((data||[]).length<1000)break;
    }
    RD_ROWS=rows;RD_UPLOAD_ID=uploadId;rdPopulateBuyers();
  }catch(error){
    if(!current())return;RD_ROWS=[];RD_ERROR=error?.message||String(error);
```

### gantt-action-calendars.js

Lines 43–53:

```js
async function ganttActionSqlRows(table,select){
  const result=[],size=500;
  for(let from=0;;from+=size){
    const {data,error}=await SB.from(table).select(select).eq('is_active',true).order('source_row_no',{ascending:true}).range(from,from+size-1);
    if(error)throw error;
    result.push(...(data||[]));if(!data||data.length<size)break;
  }
  return result;
}
function ganttActionAdd(events,raw,ewo,line,color,action,detail,source){
  const date=ganttActionDate(raw);if(!date||!String(ewo??'').trim())return;
```

Lines 86–103:

```js
async function ganttPsdPaged(build){
  const all=[];for(let from=0;;from+=500){const {data,error}=await build().range(from,from+499);if(error)throw error;
    all.push(...(data||[]));if(!data||data.length<500)break;}return all;
}
async function ganttPsdSources(ewos){
  const ids=[...new Set(ewos.map(ganttKey))].filter(Boolean).sort(),key=ids.join('|');
  const saved=GANTT_PSD_SOURCE_CACHE.get(key);if(saved&&Date.now()-saved.at<60000)return saved.promise;
  const promise=Promise.allSettled([
    ganttPsdPaged(()=>SB.from('order_bank_latest_all').select('EWO,GmtColor,OrderQty').in('EWO',ids)),
    ganttActionSqlRows('size_set_rows','row_data'),
    ganttPsdPaged(()=>SB.from('embellishment_send_receive_rows').select('"Date","EWO No","Color","Today Print Send Qty\n"," Today Print Receive Qty","Today EMB Send Qty","Today EMB Receive Qty"').eq('is_active',true).in('EWO No',ids).order('source_row_no',{ascending:true}))
  ]);
  GANTT_PSD_SOURCE_CACHE.set(key,{at:Date.now(),promise});
  return promise;
}
function ganttPsdDateKey(date){return date?.year?`${date.year}-${String(date.month).padStart(2,'0')}-${String(date.day).padStart(2,'0')}`:'';}
function ganttPsdStatus(rows,field){return [...new Set(rows.map(r=>String(r.row_data?.[field]||'').trim()).filter(Boolean))].join(' · ')||'—';}
function ganttPsdFlag(flags){return flags?.has('yes')?'Yes':flags?.has('no')?'No':'—';}
```

Lines 397–404:

```js
        const {data,error}=await SB.from('fabric_cutting_info').select('ewo,color_name,pattern_received_date,replacement_receive_commitment_date,status').order('id',{ascending:true}).range(from,from+499);
        if(error)throw error;cutting.push(...(data||[]));if(!data||data.length<500)break;
      }
    }
    for(const r of cutting){
      ganttActionAdd(events,r.pattern_received_date,r.ewo,'',r.color_name,'Pattern received',r.status||'','Fabric & Cutting SQL');
      ganttActionAdd(events,r.replacement_receive_commitment_date,r.ewo,'',r.color_name,'Replacement receive commitment',r.status||'','Fabric & Cutting SQL');
    }
```

Lines 412–433:

```js
      for(const {row_data:r} of await ganttActionSqlRows('size_set_rows','row_data')){
        const action=String(r?.['Next Action to Do\n(What)']||'').trim();
        if(action)ganttActionAdd(events,r.When,r.EWO,r.Line,r.Color,action,`Owner: ${r.Who||'—'}`,'Size Set SQL · When');
        ganttActionAdd(events,r['S/S Cut Date Plan'],r.EWO,r.Line,r.Color,'Size Set cut plan','Planned date','Size Set SQL · S/S Cut Date Plan');
      }
    }else if(tab==='accessories'){
      for(const {row_data:r} of await ganttActionSqlRows('accessories_rows','row_data')){
        ganttActionAdd(events,r.PSD,r.EWO,r['Line No'],'',`Sewing trims: ${r['Sewing Trims Pending Stts']||'—'}`,
          `Final status: ${r['Final Status']||'—'}`,'Accessories SQL · PSD status');
      }
    }else if(tab==='print'||tab==='embroidery'){
      const print=tab==='print';
      const send=print?'Today Print Send Qty\n':'Today EMB Send Qty';
      const receive=print?' Today Print Receive Qty':'Today EMB Receive Qty';
      for(const r of await ganttActionSqlRows('embellishment_send_receive_rows','"Date","EWO No","Color","Today Print Send Qty\n"," Today Print Receive Qty","Today EMB Send Qty","Today EMB Receive Qty"')){
        const sent=Number(String(r[send]||'0').replace(/,/g,''))||0,received=Number(String(r[receive]||'0').replace(/,/g,''))||0;
        if(!sent&&!received)continue;
        ganttActionAdd(events,r.Date,r['EWO No'],'',r.Color,`${print?'Print':'Embroidery'} activity`,
          `Sent: ${sent.toLocaleString('en-US')} · Received: ${received.toLocaleString('en-US')}`,
          'Embellishment SQL · report Date');
      }
    }
```

### gantt-hover.js

Lines 25–38:

```js
    rows(()=>SB.from('size_set_rows').select('row_data').eq('is_active',true)
      .filter('row_data->>EWO','eq',String(ewo)).order('source_row_no',{ascending:true})),
    rows(()=>SB.from('accessories_rows').select('row_data').eq('is_active',true)
      .filter('row_data->>EWO','eq',String(ewo)).order('source_row_no',{ascending:true})),
    rows(()=>SB.from('embellishment_send_receive_rows').select('*').eq('is_active',true)
      .eq('EWO No',String(ewo)).order('source_row_no',{ascending:true})),
    rows(()=>SB.from('order_bank_latest_all').select('GmtColor,OrderQty')
      .eq('EWO',String(ewo)))
  ]).then(results=>{
    const available=i=>results[i].status==='fulfilled';
    const matching=(i,getColor)=>available(i)?results[i].value.filter(row=>allowed.has(ganttColorKey(getColor(row)))):[];
    const size=matching(0,row=>row.row_data?.Color),accessories=available(1)?results[1].value:[];
    const embellishment=matching(2,row=>row.Color);
    const orderBank=matching(3,row=>row.GmtColor);
```

### order-execution-bridge.js

Lines 60–67:

```js
          const {data,error}=await SB.from('order_bank_latest_all').select('*')
            .order('source_row_no',{ascending:true}).order('id',{ascending:true})
            .range(from,from+999);
          if(error)throw error;
          if(!current())return;
          orders.push(...(data||[]));
          if((data||[]).length<1000)break;
        }
```

Lines 73–80:

```js
          records=await sbPaged(()=>SB.from('plan_records')
            .select('id,source_row,unit,line_no,buyer,product_type,product,ewo,stroke,po,col,print,emb,outsource,order_qty,planned_qty,pcd,psd,pfd,strip_plan_qty,delivery,manpower,smv,average,criteria,total,is_summary_row')
            .eq('upload_id',uploadId).eq('is_summary_row',false)
            .in('criteria',['Plan/Day','SAH/Day','Clock Hour/Day','Effi/Day'])
            .order('source_row',{ascending:true}).order('id',{ascending:true}));
          if(!current())return;
          const allowedIds=new Set(records.map(r=>String(r.id)));
          const days=new Set();
```

### ready-input-coverage.js

Lines 46–61:

```js
      const {data,error}=await SB.from('plan_uploads').select('id').eq('status','complete').order('uploaded_at',{ascending:false}).limit(1);
      if(error)throw error;if(!current())return;upload=String(data?.[0]?.id||'');
    }
    if(!upload){RC_BUSY=false;renderReadyInputCoverage();return;}
    const cutoff=await SB.from('date_wise_production').select('output_date').order('output_date',{ascending:false}).limit(1);
    if(cutoff.error)throw cutoff.error;if(!current())return;
    const rows=[];
    for(let offset=0;;offset+=1000){
      const {data,error}=await SB.rpc('get_ready_input_coverage',{p_upload_id:upload}).order('ewo',{ascending:true}).range(offset,offset+999);
      if(error)throw error;if(!current())return;rows.push(...(data||[]));if((data||[]).length<1000)break;
    }
    RC_ROWS=rows;RC_CUTOFF=rows[0]?.cutoff_date||cutoff.data?.[0]?.output_date||'';
    const buyer=document.getElementById('rc-buyer');
    if(buyer){const previous=buyer.value;buyer.innerHTML='<option value="">All buyers</option>'+[...new Set(rows.map(r=>r.buyer).filter(Boolean))].sort().map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join('');buyer.value=[...buyer.options].some(o=>o.value===previous)?previous:'';}
  }catch(error){if(!current())return;RC_ROWS=[];RC_ERROR=error?.message||String(error);}
  finally{if(current()){RC_BUSY=false;renderReadyInputCoverage();}}
```

### size-set-module.js

Lines 254–261:

```js
      const {data,error}=await SB.from('size_set_rows')
        .select('source_row_no,row_data,file_name,uploaded_at').eq('is_active',true)
        .order('source_row_no',{ascending:true}).range(offset,offset+999);
      if(error)throw error;
      if(token!==SS_LOAD_TOKEN||session!==SITE_SESSION_GENERATION||userId!==SITE_AUTH_USER?.id)return;
      all.push(...(data||[]));
      if((data||[]).length<1000)break;
    }
```

Lines 297–316:

```js
    const {error:tableError}=await SB.from('size_set_rows').select('source_row_no').limit(1);
    if(tableError)throw tableError;
    const batchId=crypto.randomUUID();
    for(let offset=0;offset<rows.length;offset+=150){
      if(session!==SITE_SESSION_GENERATION||userId!==SITE_AUTH_USER?.id)throw Error('Session changed during upload.');
      const part=rows.slice(offset,offset+150).map(row=>({
        batch_id:batchId,source_row_no:row.source_row_no,file_name:file.name,row_data:row.row_data
      }));
      const {error}=await SB.from('size_set_rows').insert(part);
      if(error)throw Error(`Rows ${offset+1}–${Math.min(offset+part.length,rows.length)}: ${error.message}`);
      ssMessage('ss-upload-msg',`Staging SS.csv… ${ssCount(Math.min(offset+part.length,rows.length))} / ${ssCount(rows.length)} rows`);
    }
    const {data,error}=await SB.rpc('finalize_size_set_upload',{
      p_batch_id:batchId,p_expected_rows:rows.length,p_file_name:file.name
    });
    if(error)throw error;
    if(data?.status!=='SUCCESS'||Number(data?.uploaded_rows)!==rows.length)throw Error('SQL row-count audit failed. Previous snapshot remains active.');
    ssMessage('ss-upload-msg',`✓ ${ssCount(rows.length)} / ${ssCount(data.uploaded_rows)} source rows verified in SQL. Snapshot activated.`);
    await loadSizeSetModule(true);
    resetGanttHoverCache();
```

### supabase/functions/admin-create-user/index.ts

Lines 23–30:

```js
      const {data:admin,error:adminError} = await db.from("site_users")
        .select("id,email,role,status,auth_user_id").eq("auth_user_id",callerId).maybeSingle();
      if (adminError) throw adminError;
      if (!admin || String(admin.role).toLowerCase()!=="admin" || String(admin.status).toLowerCase()!=="active")
        return json({success:false,error:"Only an Active Admin can manage users."},403);
      const body = await req.json();
      const action = String(body.action || "create").toLowerCase();
      if (!["create","update","delete"].includes(action)) return json({success:false,error:"Unknown action."},400);
```

Lines 34–41:

```js
        const {data:target,error} = await db.from("site_users").select("id,email,role,status,auth_user_id")
          .eq("id",body.site_user_id).maybeSingle();
        if (error) throw error;
        if (!target) return json({success:false,error:"User not found in site_users."},404);
        if (action === "update") {
          const role=String(body.role||"").toLowerCase(),status=String(body.status||"").toLowerCase();
          if (!["admin","user"].includes(role)||!["active","disabled"].includes(status))
            return json({success:false,error:"Invalid role or status."},400);
```

Lines 43–50:

```js
          const {error:updateError}=await db.from("site_users").update({role,status,permissions}).eq("id",target.id);
          if(updateError)throw updateError;
          return json({success:true,action:"updated",site_user_id:target.id});
        }
        const email=String(target.email||"").trim().toLowerCase();
        if (body.email && String(body.email).trim().toLowerCase()!==email)
          return json({success:false,error:"User email does not match the selected record."},400);
        if (String(target.auth_user_id)===String(callerId)||email===String(ctx.userClaims?.email||"").toLowerCase())
```

Lines 53–63:

```js
          const {error:authError}=await db.auth.admin.deleteUser(String(target.auth_user_id),false);
          if(authError)throw authError;
        }
        const {error:deleteError}=await db.from("site_users").delete().eq("id",target.id);
        if(deleteError)throw deleteError;
        return json({success:true,action:"deleted",email,auth_deleted:Boolean(target.auth_user_id)});
      }

      const email=String(body.email||"").trim().toLowerCase(),password=String(body.password||"");
      const role=String(body.role||"user").toLowerCase(),status=String(body.status||"active").toLowerCase();
      if(!email.includes("@")||password.length<6)return json({success:false,error:"Valid email and password of at least 6 characters are required."},400);
```

Lines 67–95:

```js
      const {data:existing,error:existingError}=await db.from("site_users")
        .select("id,email,auth_user_id").eq("email",email).maybeSingle();
      if(existingError)throw existingError;
      let authUserId=existing?.auth_user_id?String(existing.auth_user_id):"";
      let created=false;
      if(authUserId){
        // Preserve the existing create/repair behavior for a linked account.
        const {error}=await db.auth.admin.updateUserById(authUserId,{password,email_confirm:true,user_metadata:{role}});
        if(error)throw error;
      }else{
        const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{role}});
        if(error)throw error;
        if(!data?.user?.id)throw new Error("Supabase did not return the new Auth User ID.");
        authUserId=data.user.id;created=true;
      }
      const payload={email,role,status,auth_user_id:authUserId,...(body.permissions==null?{}:{permissions})};
      const result=existing?.id
        ? await db.from("site_users").update(payload).eq("id",existing.id)
        : await db.from("site_users").insert(payload);
      if(result.error){
        if(created){
          const {error:rollbackError}=await db.auth.admin.deleteUser(authUserId,false);
          if(rollbackError)throw new Error("Profile save failed and Auth cleanup failed. Contact Admin before retrying. "+result.error.message);
        }
        throw new Error("site_users save failed: "+result.error.message);
      }
      return json({success:true,action:created?"new-user-created":"existing-user-confirmed",email,auth_user_id:authUserId});
    }catch(error){
      console.error("admin-create-user error:",error);
```

## File inspection manifest

All tracked files were read/scanned for runtime queries, loaders, render/filter paths, permissions, schema definitions, or existing verification/context. Historical `.patch` and inventory/review files are evidence only; they are not executed by the site. Vendor html2canvas was treated as a bundled screenshot library rather than first-party business logic. CSS files have no database calls. Browser/SQL tests are fixtures, not evidence of current live schema or measurements.

| File | Bytes | Audit role |
| --- | ---: | --- |
| `DATE_FORMATS.md` | 4,710 | Prior context/diff/reference; not active runtime |
| `EWO_READINESS_BOARD.md` | 11,105 | Prior context/diff/reference; not active runtime |
| `README.md` | 1,769 | Prior context/diff/reference; not active runtime |
| `READY_INPUT_COVERAGE.md` | 5,248 | Prior context/diff/reference; not active runtime |
| `SLIDE06_DATA_REVIEW.md` | 4,972 | Prior context/diff/reference; not active runtime |
| `accessories-module.js` | 12,492 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `dashboard-theme.css` | 37,145 | Layout/theme/sticky/responsive presentation constraints |
| `dashboard-theme.js` | 2,879 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `embellishment-module.js` | 13,095 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `ewo-readiness.css` | 1,716 | Layout/theme/sticky/responsive presentation constraints |
| `ewo-readiness.js` | 9,514 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `flexible-date-parser.patch` | 5,177 | Prior context/diff/reference; not active runtime |
| `gantt-action-calendars.js` | 45,848 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `gantt-hover.js` | 17,097 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `html2canvas.min.js` | 198,709 | Vendor screenshot library and upfront payload |
| `index.html` | 504,077 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `load-analysis-bridge.js` | 2,275 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `load-analysis-plan-row.js` | 6,121 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `load-analysis.html` | 47,396 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `order-execution-bridge.js` | 4,492 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `order-execution-plan.html` | 169,869 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `planning-mdy-short-year.patch` | 1,571 | Prior context/diff/reference; not active runtime |
| `planning-mdy.patch` | 2,241 | Prior context/diff/reference; not active runtime |
| `ready-input-coverage.js` | 7,454 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `ready-input-coverage.patch` | 4,418 | Prior context/diff/reference; not active runtime |
| `size-set-module.js` | 20,822 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `slide-consistency-review.md` | 9,727 | Prior context/diff/reference; not active runtime |
| `slide-consistency.patch` | 54,443 | Prior context/diff/reference; not active runtime |
| `slide-reference-inventory.txt` | 32,647 | Prior context/diff/reference; not active runtime |
| `slide06-data-fix.patch` | 7,462 | Prior context/diff/reference; not active runtime |
| `slides-config.js` | 5,342 | Runtime source; queries/lifecycle/render/filter/export dependencies |
| `supabase/functions/admin-create-user/index.ts` | 6,030 | Server-side user management and authorization |
| `supabase/migrations/20260923_audit_fixes.sql` | 5,282 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20260924_report_replace_where.sql` | 725 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20260926_accessories_daily.sql` | 5,654 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20260926_size_set_module.sql` | 4,055 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20260927_accessories_psd_report_date.sql` | 3,018 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20260927_embellishment_send_receive.sql` | 5,031 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20260928_embellishment_upload_permission.sql` | 2,922 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20260929_slide4_chassis_strength.sql` | 4,290 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20260929_slide4_chassis_strength_safe_delete.sql` | 786 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20261012093837_chassis_slide10_read_access.sql` | 596 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20261014020815_ewo_readiness_board.sql` | 18,662 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20261014021253_ewo_readiness_query_performance.sql` | 15,284 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20261014021617_ewo_readiness_daily_unique_scan.sql` | 15,181 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20261014032704_flexible_date_parser.sql` | 3,554 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20261014065351_ready_input_coverage.sql` | 11,524 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/migrations/20261014065710_ready_input_scoped_query.sql` | 11,697 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/order-bank-flexible-import.sql` | 7,790 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/order-bank-import-timeout.sql` | 315 | SQL schema/RLS/aggregation/upload history, read only |
| `supabase/order-bank-read-access.sql` | 536 | SQL schema/RLS/aggregation/upload history, read only |
| `table-visuals.css` | 5,408 | Layout/theme/sticky/responsive presentation constraints |
| `tests/admin-user.cjs` | 3,491 | Existing test/fixture; Node executed, SQL/Python read only |
| `tests/audit.cjs` | 3,630 | Existing test/fixture; Node executed, SQL/Python read only |
| `tests/auth-storage.cjs` | 1,781 | Existing test/fixture; Node executed, SQL/Python read only |
| `tests/chassis-slide10-access.sql` | 3,132 | Existing test/fixture; read only |
| `tests/date-parser.cjs` | 4,379 | Existing test/fixture; Node executed, SQL/Python read only |
| `tests/ewo-feeding.cjs` | 3,876 | Existing test/fixture; Node executed, SQL/Python read only |
| `tests/ewo-readiness-browser.py` | 8,948 | Existing test/fixture; read only |
| `tests/ewo-readiness.cjs` | 3,253 | Existing test/fixture; Node executed, SQL/Python read only |
| `tests/ewo-readiness.sql` | 18,383 | Existing test/fixture; read only |
| `tests/gantt-multiple-ewos.cjs` | 3,588 | Existing test/fixture; Node executed, SQL/Python read only |
| `tests/gantt-multiple-visual.py` | 4,459 | Existing test/fixture; read only |
| `tests/gantt-plan-sah.cjs` | 2,333 | Existing test/fixture; Node executed, SQL/Python read only |
| `tests/line-popup.cjs` | 4,871 | Existing test/fixture; Node executed, SQL/Python read only |
| `tests/load-analysis-totals.cjs` | 2,443 | Existing test/fixture; Node executed, SQL/Python read only |
| `tests/loading.cjs` | 7,949 | Existing test/fixture; Node executed, SQL/Python read only |
| `tests/order-bank-import.sql` | 3,273 | Existing test/fixture; read only |
| `tests/order-bank-timeout.sql` | 1,598 | Existing test/fixture; read only |
| `tests/order-bank-upload.cjs` | 4,743 | Existing test/fixture; Node executed, SQL/Python read only |
| `tests/order-bank.cjs` | 3,897 | Existing test/fixture; Node executed, SQL/Python read only |
| `tests/readiness-schema.sql` | 5,453 | Existing test/fixture; read only |
| `tests/ready-input-coverage.cjs` | 3,284 | Existing test/fixture; Node executed, SQL/Python read only |
| `tests/ready-input-coverage.sql` | 7,276 | Existing test/fixture; read only |
| `tests/report-replace.sql` | 1,350 | Existing test/fixture; read only |
| `tests/slides-navigation.py` | 7,573 | Existing test/fixture; read only |
| `tests/theme-visual.py` | 28,436 | Existing test/fixture; read only |

Call appendix scanned 105 Supabase/helper source occurrences; read and mutation tables above explain their execution context.
