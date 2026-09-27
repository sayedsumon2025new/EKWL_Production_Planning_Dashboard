-- Source CSV: Embellishment Send Receive.csv. Its 20 named headings are quoted
-- verbatim (including two line breaks and a leading space). CSV column 21 has
-- an empty heading, so PostgreSQL requires the surrogate csv_column_21.
-- Every source cell is text, preserving zeros, formatting and blank values.
create table if not exists public.embellishment_send_receive_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null,
  source_row_no integer not null check (source_row_no >= 2),
  file_name text not null,
  "Code" text not null,
  "Date" text not null,
  "EWO No" text not null,
  "Style No" text not null,
  "Buyer" text not null,
  "Buyer Team" text not null,
  "Color" text not null,
  "Order Qty" text not null,
  "Today Print Send Qty
" text not null,
  "Total Print Send Qty
" text not null,
  " Today Print Receive Qty" text not null,
  "Total Print Receive Qty" text not null,
  "Today Print Return Qty" text not null,
  "Total Print Return Qty" text not null,
  "Today EMB Send Qty" text not null,
  "Total EMB Send Qty" text not null,
  "Today EMB Receive Qty" text not null,
  "Total EMB Receive Qty" text not null,
  "Today EMB Return Qty" text not null,
  "Total EMB Return Qty" text not null,
  csv_column_21 text not null,
  uploaded_by uuid not null default auth.uid(),
  uploaded_at timestamptz not null default now(),
  is_active boolean not null default false,
  unique(batch_id,source_row_no)
);
create index if not exists embellishment_rows_active_order_idx
 on public.embellishment_send_receive_rows (source_row_no) where is_active;
create index if not exists embellishment_rows_active_date_idx
 on public.embellishment_send_receive_rows ("Date") where is_active;

alter table public.embellishment_send_receive_rows enable row level security;
revoke all on public.embellishment_send_receive_rows from public, anon;
grant select,insert on public.embellishment_send_receive_rows to authenticated;
grant usage,select on sequence public.embellishment_send_receive_rows_id_seq to authenticated;

drop policy if exists embellishment_rows_read on public.embellishment_send_receive_rows;
create policy embellishment_rows_read on public.embellishment_send_receive_rows
for select to authenticated using (
  exists (select 1 from public.site_users u
    where u.auth_user_id=auth.uid() and lower(u.status::text)='active'
    and (lower(u.role::text)='admin' or coalesce(u.permissions ->> 'slide_19','false')='true'))
  and (is_active or uploaded_by=auth.uid())
);
drop policy if exists embellishment_rows_admin_stage on public.embellishment_send_receive_rows;
create policy embellishment_rows_admin_stage on public.embellishment_send_receive_rows
for insert to authenticated with check (
  not is_active and uploaded_by=auth.uid()
  and exists (select 1 from public.site_users u
    where u.auth_user_id=auth.uid() and lower(u.role::text)='admin'
    and lower(u.status::text)='active')
);

create or replace function public.finalize_embellishment_upload(
 p_batch_id uuid,p_expected_rows integer,p_file_name text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_count integer;v_min integer;v_max integer;v_names integer;v_dates integer;
begin
 if auth.uid() is null or not exists(select 1 from public.site_users u
    where u.auth_user_id=auth.uid() and lower(u.role::text)='admin'
      and lower(u.status::text)='active') then
   raise exception 'Active admin account required' using errcode='42501';
 end if;
 if p_batch_id is null or p_expected_rows is null or p_expected_rows < 1
    or p_expected_rows > 100000 or nullif(btrim(p_file_name),'') is null then
   raise exception 'Invalid Embellishment upload details';
 end if;
 perform pg_advisory_xact_lock(hashtext('public.embellishment_send_receive_rows_snapshot'));
 select count(*),min(r.source_row_no),max(r.source_row_no),count(distinct r.file_name),
        count(distinct r."Date")
 into v_count,v_min,v_max,v_names,v_dates
 from public.embellishment_send_receive_rows r
 where r.batch_id=p_batch_id and r.uploaded_by=auth.uid() and not r.is_active
   and r.file_name=p_file_name;
 if v_count <> p_expected_rows or v_min <> 2 or v_max <> p_expected_rows+1
    or v_names <> 1 or exists(select 1 from public.embellishment_send_receive_rows r
      where r.batch_id=p_batch_id and (r.is_active or r.uploaded_by<>auth.uid() or r.file_name<>p_file_name)) then
   raise exception 'Embellishment source-order/file/row-count audit failed';
 end if;
 update public.embellishment_send_receive_rows set is_active=false where is_active;
 update public.embellishment_send_receive_rows set is_active=true,uploaded_at=now()
  where batch_id=p_batch_id and uploaded_by=auth.uid();
 return jsonb_build_object('status','SUCCESS','uploaded_rows',v_count,'report_dates',v_dates);
end;
$$;
revoke all on function public.finalize_embellishment_upload(uuid,integer,text) from public,anon;
grant execute on function public.finalize_embellishment_upload(uuid,integer,text) to authenticated;
