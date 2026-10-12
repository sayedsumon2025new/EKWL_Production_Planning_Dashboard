-- Flexible CSV imports: exact source headers/cells, isolated uploads, atomic activation.
alter table public.order_bank_raw add column source_data jsonb;
alter table public.order_bank_upload_batches add column source_columns text[];

create table public.order_bank_import_rows (
  upload_token uuid not null,
  source_row_no bigint not null check (source_row_no > 0),
  source_data jsonb not null check (jsonb_typeof(source_data) = 'object'),
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (upload_token, source_row_no)
);
alter table public.order_bank_import_rows enable row level security;
revoke all on public.order_bank_import_rows from public, anon;
grant select, insert, delete on public.order_bank_import_rows to authenticated;
create policy order_bank_import_admin_read on public.order_bank_import_rows
for select to authenticated using (uploaded_by=(select auth.uid()) and (select public.current_site_role())='admin');
create policy order_bank_import_admin_insert on public.order_bank_import_rows
for insert to authenticated with check (uploaded_by=(select auth.uid()) and (select public.current_site_role())='admin');
create policy order_bank_import_admin_delete on public.order_bank_import_rows
for delete to authenticated using (uploaded_by=(select auth.uid()) and (select public.current_site_role())='admin');

-- Definer is needed to write protected snapshot tables. Caller and ownership are checked explicitly.
create function public.finalize_order_bank_import(
  p_upload_token uuid, p_file_name text, p_expected_rows bigint, p_source_columns text[]
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_batch bigint; v_count bigint; v_raw bigint; v_nonblank bigint; v_min bigint; v_max bigint;
begin
  if auth.uid() is null or public.current_site_role() is distinct from 'admin' then
    raise exception 'Active admin required' using errcode='42501';
  end if;
  if p_upload_token is null or p_expected_rows is null or p_expected_rows<=0 then
    raise exception 'Nonempty upload and expected row count required';
  end if;
  if p_source_columns is null or cardinality(p_source_columns)=0
     or exists(select 1 from unnest(p_source_columns) c where c is null or btrim(c)='')
     or (select count(distinct lower(c)) from unnest(p_source_columns) c)<>cardinality(p_source_columns) then
    raise exception 'Unique nonblank column names required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('order-bank-import:'||p_upload_token::text,0));
  -- Serialize staging writes for the short finalization transaction.
  lock table public.order_bank_import_rows in share row exclusive mode;
  if exists(select 1 from public.order_bank_import_rows where upload_token=p_upload_token and uploaded_by<>auth.uid()) then
    raise exception 'Upload belongs to another user' using errcode='42501';
  end if;
  select count(*),min(source_row_no),max(source_row_no) into v_count,v_min,v_max
  from public.order_bank_import_rows where upload_token=p_upload_token and uploaded_by=auth.uid();
  if v_count<>p_expected_rows or v_min<>1 or v_max<>p_expected_rows then
    raise exception 'CSV row count mismatch: expected %, staged %',p_expected_rows,v_count;
  end if;
  if exists(
    select 1 from public.order_bank_import_rows i where upload_token=p_upload_token and
    (not (source_data ?& p_source_columns)
      or (select count(*) from jsonb_object_keys(source_data))<>cardinality(p_source_columns)
      or exists(select 1 from jsonb_each(source_data) e where jsonb_typeof(e.value)<>'string'))
  ) then raise exception 'Source columns or cell types do not match CSV'; end if;
  select count(*) into v_nonblank from public.order_bank_import_rows i
  where upload_token=p_upload_token and exists(select 1 from jsonb_each_text(source_data) e where btrim(e.value)<>'');
  if v_nonblank=0 then raise exception 'CSV has no nonblank data rows'; end if;
  insert into public.order_bank_upload_batches(file_name,staging_rows,status,source_columns)
  values(p_file_name,v_count,'PROCESSING',p_source_columns) returning id into v_batch;
  insert into public.order_bank_raw(upload_batch_id,source_row_no,source_data,"Code-EWO", "Code", "Buyer", "Dept", "EWO", "PO", "GmtColor", "EWO&Color", "Stroke", "Description", "Destination", "TechPackDate", "FOB", "RevisedFOB", "EFD", "FRDate", "CostingSMV", "UpdatedSMV", "TotalHour", "FRHour", "OrderQty", "OrderRate", "Ordervalue", "Season", "ContractNo", "ContractUnit", "ExecutionUnit", "Gender", "ConsumptionQtyInHouse", "ConsumptionQtyOutSource", "FabrickgInHouse", "FabrickgOutSource", "TotalFabricinKG", "Ordertype", "OrderStatus", "TNADays", "MMTeam", "CancelReason", "Remarks", "Month")
  select v_batch,i.source_row_no,i.source_data,coalesce(i.source_data->>'Code-EWO',''), coalesce(i.source_data->>'Code',''), coalesce(i.source_data->>'Buyer',''), coalesce(i.source_data->>'Dept',''), coalesce(i.source_data->>'EWO',''), coalesce(i.source_data->>'PO',''), coalesce(i.source_data->>'GmtColor',''), coalesce(i.source_data->>'EWO&Color',''), coalesce(i.source_data->>'Stroke',''), coalesce(i.source_data->>'Description',''), coalesce(i.source_data->>'Destination',''), coalesce(i.source_data->>'TechPackDate',''), coalesce(i.source_data->>'FOB',''), coalesce(i.source_data->>'RevisedFOB',''), coalesce(i.source_data->>'EFD',''), coalesce(i.source_data->>'FRDate',''), coalesce(i.source_data->>'CostingSMV',''), coalesce(i.source_data->>'UpdatedSMV',''), coalesce(i.source_data->>'TotalHour',''), coalesce(i.source_data->>'FRHour',''), coalesce(i.source_data->>'OrderQty',''), coalesce(i.source_data->>'OrderRate',''), coalesce(i.source_data->>'Ordervalue',''), coalesce(i.source_data->>'Season',''), coalesce(i.source_data->>'ContractNo',''), coalesce(i.source_data->>'ContractUnit',''), coalesce(i.source_data->>'ExecutionUnit',''), coalesce(i.source_data->>'Gender',''), coalesce(i.source_data->>'ConsumptionQtyInHouse',''), coalesce(i.source_data->>'ConsumptionQtyOutSource',''), coalesce(i.source_data->>'FabrickgInHouse',''), coalesce(i.source_data->>'FabrickgOutSource',''), coalesce(i.source_data->>'TotalFabricinKG',''), coalesce(i.source_data->>'Ordertype',''), coalesce(i.source_data->>'OrderStatus',''), coalesce(i.source_data->>'TNADays',''), coalesce(i.source_data->>'MMTeam',''), coalesce(i.source_data->>'CancelReason',''), coalesce(i.source_data->>'Remarks',''), coalesce(i.source_data->>'Month','')
  from public.order_bank_import_rows i where upload_token=p_upload_token order by source_row_no;
  get diagnostics v_raw=row_count;
  if v_raw<>p_expected_rows then raise exception 'SQL row count mismatch'; end if;
  update public.order_bank_upload_batches set raw_rows=v_raw,nonblank_rows=v_nonblank,status='SUCCESS',
    note='Exact CSV source cells and column order preserved; row count verified.' where id=v_batch;
  delete from public.order_bank_import_rows where upload_token=p_upload_token;
  return jsonb_build_object('batch_id',v_batch,'staging_rows',v_count,'raw_rows',v_raw,
    'nonblank_rows',v_nonblank,'source_column_count',cardinality(p_source_columns),'status','SUCCESS');
end;
$$;
revoke all on function public.finalize_order_bank_import(uuid,text,bigint,text[]) from public,anon;
grant execute on function public.finalize_order_bank_import(uuid,text,bigint,text[]) to authenticated;

create or replace view public.order_bank_latest_all with (security_invoker=true) as
select r.*, b.source_columns from public.order_bank_raw r
join public.order_bank_upload_batches b on b.id=r.upload_batch_id
where r.upload_batch_id=(select id from public.order_bank_upload_batches where status='SUCCESS' order by uploaded_at desc,id desc limit 1);
notify pgrst, 'reload schema';
