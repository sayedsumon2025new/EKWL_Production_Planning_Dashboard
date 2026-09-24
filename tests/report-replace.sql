-- Run after migrations as a database operator. All report changes roll back.
begin;
select set_config('request.jwt.claim.sub',
 (select auth_user_id::text from public.site_users where role='admin' and status='active' limit 1),true);
set local role authenticated;
do $test$
declare sample jsonb; before_count bigint; response jsonb;
begin
 if position('delete from public.%I where true' in pg_get_functiondef('public.ekwl_save_report(text,jsonb,boolean)'::regprocedure))=0 then
  raise exception 'Explicit replacement predicate missing';
 end if;
 select count(*) into before_count from public.fabric_cutting_info;
 select jsonb_build_array(to_jsonb(t)-'id'-'created_at') into sample from public.fabric_cutting_info t limit 1;
 if sample is null then raise exception 'No sample available';end if;
 begin
  response:=public.ekwl_save_report('fabric',sample,true);
  if (response->>'inserted_rows')::int<>1 or (select count(*) from public.fabric_cutting_info)<>1 then
   raise exception 'Replacement test failed';
  end if;
  raise exception 'test rollback' using errcode='Z0001';
 exception when sqlstate 'Z0001' then null;
 end;
 if (select count(*) from public.fabric_cutting_info)<>before_count then raise exception 'Rollback test failed';end if;
end;
$test$;
reset role;
select 'authenticated replacement and rollback passed' as result;
rollback;
