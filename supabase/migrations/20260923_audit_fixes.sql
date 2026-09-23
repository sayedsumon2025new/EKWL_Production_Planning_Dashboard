-- Preserve existing report calculations; enforce the existing upload permissions.
begin;

-- An invoker RPC keeps the caller's RLS policies in force and rolls back the
-- complete replacement if any conversion, constraint, or INSERT fails.
create or replace function public.ekwl_save_report(p_kind text, p_rows jsonb, p_replace boolean default true)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_table text; v_perm text; v_columns text; v_count bigint;
begin
  case p_kind
    when 'fabric' then v_table:='fabric_cutting_info';v_perm:='fabric';
    when 'sewing' then v_table:='sewing_input_output';v_perm:='sewing';
    when 'production' then v_table:='date_wise_production';v_perm:='production';
    when 'chassis' then v_table:='line_chassis_priority';v_perm:='admin_settings';
    else raise exception 'Unknown report kind';
  end case;
  if auth.uid() is null or not public.current_site_can(v_perm) then
    raise exception 'Upload permission required' using errcode='42501';
  end if;
  if p_kind='chassis' and public.current_site_role() is distinct from 'admin' then
    raise exception 'Active admin required' using errcode='42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Rows must be an array';end if;
  if jsonb_array_length(p_rows)=0 and p_kind<>'chassis' then raise exception 'Empty upload rejected';end if;
  if exists(select 1 from jsonb_array_elements(p_rows) x where jsonb_typeof(x)<>'object') then
    raise exception 'Each row must be an object';
  end if;
  -- The table name is chosen above, never supplied as executable SQL.
  if exists(
    select 1 from jsonb_array_elements(p_rows) x cross join lateral jsonb_object_keys(x) k
    where k in ('id','created_at') or not exists(
      select 1 from pg_attribute a where a.attrelid=('public.'||v_table)::regclass
        and a.attname=k and a.attnum>0 and not a.attisdropped and a.attgenerated=''
    )
  ) then raise exception 'Unexpected upload column';end if;
  select string_agg(format('%I',k),',' order by k) into v_columns
  from (select distinct jsonb_object_keys(x) k from jsonb_array_elements(p_rows) x) q;
  perform pg_advisory_xact_lock(hashtextextended('ekwl-report:'||v_table,0));
  if p_replace then
    if p_kind='production' then
      if exists(select 1 from jsonb_array_elements(p_rows) x where nullif(x->>'output_date','') is null) then
        raise exception 'Production date is required';
      end if;
      delete from public.date_wise_production
      where output_date in (select (x->>'output_date')::date from jsonb_array_elements(p_rows) x);
    else
      execute format('delete from public.%I',v_table);
    end if;
  end if;
  v_count:=0;
  if jsonb_array_length(p_rows)>0 then
    execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I,$1)',
      v_table,v_columns,v_columns,v_table) using p_rows;
    get diagnostics v_count=row_count;
  end if;
  if v_count<>jsonb_array_length(p_rows) then raise exception 'Upload row count mismatch';end if;
  return jsonb_build_object('success',true,'inserted_rows',v_count);
end;
$$;
revoke all on function public.ekwl_save_report(text,jsonb,boolean) from public,anon;
grant execute on function public.ekwl_save_report(text,jsonb,boolean) to authenticated;

-- Remove permissive write policies that otherwise OR together with stricter ones.
do $$
declare t text;p record;k text;
begin
  foreach t in array array['fabric_cutting_info','sewing_input_output','date_wise_production','plan_uploads','plan_records','plan_daily'] loop
    k:=case t when 'fabric_cutting_info' then 'fabric' when 'sewing_input_output' then 'sewing'
      when 'date_wise_production' then 'production' else 'planning_upload' end;
    for p in select policyname from pg_policies where schemaname='public' and tablename=t and cmd in ('INSERT','UPDATE','DELETE','ALL') loop
      execute format('drop policy %I on public.%I',p.policyname,t);
    end loop;
    execute format('create policy ekwl_upload_insert on public.%I for insert to authenticated with check (public.current_site_can(%L))',t,k);
    execute format('create policy ekwl_upload_update on public.%I for update to authenticated using (public.current_site_can(%L)) with check (public.current_site_can(%L))',t,k,k);
    execute format('create policy ekwl_upload_delete on public.%I for delete to authenticated using (public.current_site_can(%L))',t,k);
  end loop;
end;
$$;

-- Existing definer RPC previously lacked any caller check. Keep its output and
-- calculation intact, adding the same active-admin requirement as its staging table.
do $$
declare def text;
begin
  select pg_get_functiondef('public.finalize_order_bank_upload(text)'::regprocedure) into def;
  if position('EKWL_ACTIVE_ADMIN_CHECK' in def)=0 then
    def:=regexp_replace(def,'\mbegin\M',
      E'begin\n -- EKWL_ACTIVE_ADMIN_CHECK\n if public.current_site_role() is distinct from ''admin'' then raise exception ''Active admin required'' using errcode=''42501''; end if;', 'i');
    execute def;
  end if;
end;
$$;
revoke execute on function public.finalize_order_bank_upload(text) from public,anon;
grant execute on function public.finalize_order_bank_upload(text) to authenticated;
commit;
