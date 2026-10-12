-- Run on Supabase as postgres. All fixture rows/snapshots are rolled back.
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub',auth_user_id,'role','authenticated')::text,true)
from public.site_users where role='admin' and status='active' and auth_user_id is not null limit 1;
set local role authenticated;
do $$
declare
 t uuid; other_token uuid:=gen_random_uuid(); n bigint; a jsonb; before_count bigint;
begin
 if not public.current_site_can('slide_14') then raise exception 'An active admin fixture is required'; end if;
 insert into public.order_bank_import_rows(upload_token,source_row_no,source_data)
 values(other_token,1,'{"Other column":"isolated"}');
 foreach n in array array[1,501,29625]::bigint[] loop
  t:=gen_random_uuid();
  insert into public.order_bank_import_rows(upload_token,source_row_no,source_data)
  select t,i,jsonb_build_object('EWO','00123','New column',case when i=2 then '' else '  exact value  ' end)
  from generate_series(1,n) i;
  a:=public.finalize_order_bank_import(t,'test.csv',n,array['New column','EWO']);
  if (a->>'raw_rows')::bigint<>n or (a->>'source_column_count')::int<>2 then raise exception 'Audit failed'; end if;
  if (select count(*) from public.order_bank_latest_all)<>n then raise exception 'Latest view count failed'; end if;
  if not exists(select 1 from public.order_bank_latest_all where source_row_no=1 and source_data->>'New column'='  exact value  ' and "EWO"='00123' and source_columns=array['New column','EWO']) then
   raise exception 'Exact source value/order failed'; end if;
  if exists(select 1 from public.order_bank_import_rows where upload_token=t) then raise exception 'Cleanup failed'; end if;
  if not exists(select 1 from public.order_bank_import_rows where upload_token=other_token) then raise exception 'Other upload was changed'; end if;
 end loop;
 -- A later upload can remove EWO and use entirely different columns.
 a:=public.finalize_order_bank_import(other_token,'one-column.csv',1,array['Other column']);
 if (select count(*) from public.order_bank_latest_all)<>1 or not exists(select 1 from public.order_bank_latest_all where source_data='{"Other column":"isolated"}'::jsonb and source_columns=array['Other column']) then raise exception 'Removed columns failed'; end if;
 select count(*) into before_count from public.order_bank_upload_batches;
 t:=gen_random_uuid();
 insert into public.order_bank_import_rows(upload_token,source_row_no,source_data) values(t,1,'{"EWO":"123"}');
 begin
  perform public.finalize_order_bank_import(t,'incomplete.csv',2,array['EWO']);
  raise exception 'Incomplete upload accepted';
 exception when others then
  if sqlerrm not like 'CSV row count mismatch:%' then raise; end if;
 end;
 if (select count(*) from public.order_bank_upload_batches)<>before_count then raise exception 'Failed upload activated'; end if;
 begin
  perform public.finalize_order_bank_import(t,'wrong-columns.csv',1,array['Unexpected']);
  raise exception 'Wrong columns accepted';
 exception when others then
  if sqlerrm<>'Source columns or cell types do not match CSV' then raise; end if;
 end;
end;
$$;
select 'PASS: 1, 501 and 29625 rows; added/removed columns; exact cells/order; isolated tokens; failed uploads stay inactive' as verification;
rollback;
