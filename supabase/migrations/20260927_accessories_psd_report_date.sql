-- Follow-up to the empty Accessories table created on 2026-09-27.
-- The source CSV's PSD is the report date. It may be D-Mon or D-Mon-YY,
-- so preserve the supplied text instead of inventing a year.
alter table public.accessories_rows
  alter column report_date type text using report_date::text;

alter table public.accessories_rows
  add constraint accessories_report_date_matches_psd check (
    report_date <> '' and report_date = coalesce(btrim(row_data ->> 'PSD'),'')
  );

-- The earlier per-day functions have not been used; replace them before UI publish.
drop function if exists public.list_accessories_snapshots();
drop function if exists public.finalize_accessories_upload(uuid,date,integer,text);

create or replace function public.finalize_accessories_upload(
  p_batch_id uuid, p_expected_rows integer, p_file_name text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_rows integer;
  v_min_row integer;
  v_max_row integer;
  v_files integer;
  v_file text;
  v_psd_matches boolean;
  v_psd_dates integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.site_users u
    where u.auth_user_id = auth.uid()
      and lower(u.role::text) = 'admin'
      and lower(u.status::text) = 'active'
  ) then
    raise exception 'Active admin account required' using errcode = '42501';
  end if;
  if p_batch_id is null or p_expected_rows is null
      or p_expected_rows < 1 or p_expected_rows > 100000
      or nullif(btrim(p_file_name),'') is null then
    raise exception 'Invalid Accessories upload details';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.accessories_rows_snapshot'));
  select count(*), min(r.source_row_no), max(r.source_row_no),
         count(distinct r.file_name), min(r.file_name),
         bool_and(r.report_date = btrim(r.row_data ->> 'PSD')),
         count(distinct r.report_date)
  into v_rows, v_min_row, v_max_row, v_files, v_file, v_psd_matches, v_psd_dates
  from public.accessories_rows r
  where r.batch_id = p_batch_id and r.uploaded_by = auth.uid() and not r.is_active;

  if v_rows <> p_expected_rows or v_min_row <> 2
      or v_max_row <> p_expected_rows + 1
      or v_files <> 1 or v_file <> p_file_name
      or not coalesce(v_psd_matches,false) then
    raise exception 'Accessories PSD / source-order / row-count audit failed';
  end if;

  -- One complete file is current; previous files remain stored as inactive batches.
  update public.accessories_rows set is_active = false where is_active;
  update public.accessories_rows set is_active = true, uploaded_at = now()
    where batch_id = p_batch_id and uploaded_by = auth.uid();
  return jsonb_build_object('status','SUCCESS','uploaded_rows',v_rows,
                            'report_dates_from_psd',v_psd_dates);
end;
$$;
revoke all on function public.finalize_accessories_upload(uuid,integer,text) from public, anon;
grant execute on function public.finalize_accessories_upload(uuid,integer,text) to authenticated;
