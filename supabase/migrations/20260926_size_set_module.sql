-- Size Set Module: one source-preserving table, with atomic activation after row-count audit.
-- Run this migration before deploying the Size Set UI or uploading SS.csv.
create table if not exists public.size_set_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null,
  source_row_no integer not null check (source_row_no >= 2),
  file_name text not null,
  row_data jsonb not null check (jsonb_typeof(row_data) = 'object'),
  uploaded_by uuid not null default auth.uid(),
  uploaded_at timestamptz not null default now(),
  is_active boolean not null default false,
  unique (batch_id, source_row_no)
);

create index if not exists size_set_rows_active_source_idx
  on public.size_set_rows (is_active, source_row_no);
create index if not exists size_set_rows_active_ewo_idx
  on public.size_set_rows (is_active, (row_data ->> 'EWO'));
create index if not exists size_set_rows_active_buyer_idx
  on public.size_set_rows (is_active, (row_data ->> 'Buyer'));

alter table public.size_set_rows enable row level security;
revoke all on public.size_set_rows from public, anon;
grant select, insert on public.size_set_rows to authenticated;

drop policy if exists size_set_rows_read on public.size_set_rows;
create policy size_set_rows_read on public.size_set_rows
for select to authenticated using (
  exists (
    select 1 from public.site_users u
    where u.auth_user_id = auth.uid()
      and lower(u.status::text) = 'active'
      and (
        lower(u.role::text) = 'admin'
        or coalesce(u.permissions ->> 'slide_17', 'false') = 'true'
      )
  )
  and (is_active or uploaded_by = auth.uid())
);

drop policy if exists size_set_rows_admin_stage on public.size_set_rows;
create policy size_set_rows_admin_stage on public.size_set_rows
for insert to authenticated with check (
  is_active = false and uploaded_by = auth.uid()
  and exists (
    select 1 from public.site_users u
    where u.auth_user_id = auth.uid()
      and lower(u.role::text) = 'admin'
      and lower(u.status::text) = 'active'
  )
);

create or replace function public.finalize_size_set_upload(
  p_batch_id uuid, p_expected_rows integer, p_file_name text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_rows integer;
  v_min_row integer;
  v_max_row integer;
  v_file_count integer;
  v_file_name text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.site_users u
    where u.auth_user_id = auth.uid()
      and lower(u.role::text) = 'admin'
      and lower(u.status::text) = 'active'
  ) then
    raise exception 'Active admin account required' using errcode = '42501';
  end if;
  if p_batch_id is null or p_expected_rows is null or p_expected_rows < 1
     or p_expected_rows > 100000 or nullif(trim(p_file_name), '') is null then
    raise exception 'Invalid Size Set upload details';
  end if;

  -- Serialize competing uploads so only one complete batch becomes active.
  perform pg_advisory_xact_lock(hashtext('public.size_set_rows_snapshot'));
  select count(*), min(source_row_no), max(source_row_no),
         count(distinct file_name), min(file_name)
    into v_rows, v_min_row, v_max_row, v_file_count, v_file_name
    from public.size_set_rows
    where batch_id = p_batch_id and uploaded_by = auth.uid() and is_active = false;

  if v_rows <> p_expected_rows or v_min_row <> 2
     or v_max_row <> p_expected_rows + 1
     or v_file_count <> 1 or v_file_name <> p_file_name then
    raise exception 'Size Set row-count / source-order audit failed';
  end if;

  update public.size_set_rows set is_active = false where is_active = true;
  update public.size_set_rows
     set is_active = true, uploaded_at = now()
   where batch_id = p_batch_id and uploaded_by = auth.uid();
  return jsonb_build_object('status', 'SUCCESS', 'uploaded_rows', v_rows);
end;
$$;

revoke all on function public.finalize_size_set_upload(uuid, integer, text) from public, anon;
grant execute on function public.finalize_size_set_upload(uuid, integer, text) to authenticated;
