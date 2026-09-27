-- EKWLHW-Accessories.csv: source-preserving daily snapshots.
-- Prepared for review. Apply to the existing Supabase project only after demo approval.
create table if not exists public.accessories_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null,
  report_date date not null,
  source_row_no integer not null check (source_row_no >= 2),
  file_name text not null,
  row_data jsonb not null check (
    jsonb_typeof(row_data) = 'object' and row_data ?& array[
      'SI','Buyer/Team','EWO','Line No','PSD','PCD',
      'Sewing Trims Pending Stts','Finishing Trims Pending stts',
      'Carton Receiving Stts','Inventory Status','Inspection Status',
      'Trims Card status','Final Status','Relavant Concern ',
      'Relevant M&M Name'
    ]
  ),
  uploaded_by uuid not null default auth.uid(),
  uploaded_at timestamptz not null default now(),
  is_active boolean not null default false,
  unique (batch_id, source_row_no)
);

create index if not exists accessories_rows_active_date_source_idx
  on public.accessories_rows (report_date desc, source_row_no) where is_active;
create index if not exists accessories_rows_active_ewo_idx
  on public.accessories_rows (report_date, (row_data ->> 'EWO')) where is_active;

alter table public.accessories_rows enable row level security;
revoke all on public.accessories_rows from public, anon;
grant select, insert on public.accessories_rows to authenticated;

drop policy if exists accessories_rows_read on public.accessories_rows;
create policy accessories_rows_read on public.accessories_rows
for select to authenticated using (
  exists (
    select 1 from public.site_users u
    where u.auth_user_id = auth.uid() and lower(u.status::text) = 'active'
      and (lower(u.role::text) = 'admin'
           or coalesce(u.permissions ->> 'slide_18', 'false') = 'true')
  )
  and (is_active or uploaded_by = auth.uid())
);

drop policy if exists accessories_rows_admin_stage on public.accessories_rows;
create policy accessories_rows_admin_stage on public.accessories_rows
for insert to authenticated with check (
  is_active = false and uploaded_by = auth.uid()
  and exists (
    select 1 from public.site_users u
    where u.auth_user_id = auth.uid()
      and lower(u.role::text) = 'admin'
      and lower(u.status::text) = 'active'
  )
);

create or replace function public.list_accessories_snapshots()
returns table (report_date date, row_count bigint, file_name text, uploaded_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.site_users u
    where u.auth_user_id = auth.uid() and lower(u.status::text) = 'active'
      and (lower(u.role::text) = 'admin'
           or coalesce(u.permissions ->> 'slide_18', 'false') = 'true')
  ) then
    raise exception 'Accessories access denied' using errcode = '42501';
  end if;
  return query
    select r.report_date, count(*)::bigint, min(r.file_name), max(r.uploaded_at)
    from public.accessories_rows r where r.is_active
    group by r.report_date order by r.report_date desc;
end;
$$;
revoke all on function public.list_accessories_snapshots() from public, anon;
grant execute on function public.list_accessories_snapshots() to authenticated;

create or replace function public.finalize_accessories_upload(
  p_batch_id uuid, p_report_date date, p_expected_rows integer, p_file_name text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_rows integer;
  v_min_row integer;
  v_max_row integer;
  v_dates integer;
  v_files integer;
  v_file text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.site_users u
    where u.auth_user_id = auth.uid()
      and lower(u.role::text) = 'admin'
      and lower(u.status::text) = 'active'
  ) then
    raise exception 'Active admin account required' using errcode = '42501';
  end if;
  if p_batch_id is null or p_report_date is null or p_expected_rows is null
      or p_expected_rows < 1 or p_expected_rows > 100000
      or nullif(trim(p_file_name),'') is null then
    raise exception 'Invalid Accessories upload details';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.accessories_rows_snapshot'),
                                hashtext(p_report_date::text));
  select count(*), min(r.source_row_no), max(r.source_row_no),
         count(distinct r.report_date), count(distinct r.file_name), min(r.file_name)
  into v_rows, v_min_row, v_max_row, v_dates, v_files, v_file
  from public.accessories_rows r
  where r.batch_id = p_batch_id and r.uploaded_by = auth.uid() and not r.is_active;

  if v_rows <> p_expected_rows or v_min_row <> 2
      or v_max_row <> p_expected_rows + 1 or v_dates <> 1
      or v_files <> 1 or v_file <> p_file_name
      or exists (
        select 1 from public.accessories_rows r
        where r.batch_id = p_batch_id and r.report_date <> p_report_date
      ) then
    raise exception 'Accessories date / source-order / row-count audit failed';
  end if;

  update public.accessories_rows set is_active = false
    where report_date = p_report_date and is_active;
  update public.accessories_rows set is_active = true, uploaded_at = now()
    where batch_id = p_batch_id and uploaded_by = auth.uid();
  return jsonb_build_object('status','SUCCESS','report_date',p_report_date,
                            'uploaded_rows',v_rows);
end;
$$;
revoke all on function public.finalize_accessories_upload(uuid,date,integer,text) from public, anon;
grant execute on function public.finalize_accessories_upload(uuid,date,integer,text) to authenticated;
