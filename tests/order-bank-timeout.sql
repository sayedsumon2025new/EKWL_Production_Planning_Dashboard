begin;
set local statement_timeout='60s';
select set_config('request.jwt.claims',jsonb_build_object('sub',auth_user_id,'role','authenticated')::text,true) from public.site_users where role='admin' and status='active' and auth_user_id is not null limit 1;
set local role authenticated;
create temp table ob_timeout_verification(rows bigint, columns int, elapsed_seconds numeric, result text);
do $test$
declare t uuid:=gen_random_uuid(); headers text[]:=array['Buyer','Dept','EWO','PO','GmtColor','EWO&Color','Stroke','Description','Destination','TechPackDate','FOB','RevisedFOB','EFD','FRDate','CostingSMV','UpdatedSMV','TotalHour','FRHour','OrderQty','OrderRate','Ordervalue','Season','ContractNo','ContractUnit','ExecutionUnit','Gender','ConsumptionQtyInHouse','ConsumptionQtyOutSource','FabrickgInHouse','FabrickgOutSource','TotalFabricinKG','Ordertype','OrderStatus','TNADays','MMTeam','CancelReason','Remarks']; started timestamptz; a jsonb;
begin
 insert into public.order_bank_import_rows(upload_token,source_row_no,source_data)
 select t,n,(select jsonb_object_agg(c,case when c='EWO' then '00123' else 'example source value' end) from unnest(headers) c) from generate_series(1,29625) n;
 started:=clock_timestamp();
 a:=public.finalize_order_bank_import(t,'timeout-regression.csv',29625,headers);
 if (a->>'raw_rows')::bigint<>29625 or (a->>'source_column_count')::int<>37 then raise exception 'Audit mismatch'; end if;
 insert into ob_timeout_verification values(29625,37,extract(epoch from clock_timestamp()-started),'PASS');
end $test$;
select * from ob_timeout_verification;
rollback;
