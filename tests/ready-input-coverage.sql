-- Isolated harness only: readiness-schema + original readiness migration + coverage view.
begin;
insert into public.site_users(auth_user_id,email,role,status,permissions)
values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','coverage@example.test','user','active','{"slide_21":true}');
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
insert into public.plan_uploads(id,file_name,status) values('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','coverage.csv','complete');
insert into public.plan_records(upload_id,source_row,ewo,col,buyer,line_no,criteria,print,emb,total)
select 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',n,900000+n,'Blue','Buyer','Line 01','Plan/Day',case when n in (7,8) then 'Yes' else 'No' end,
  case when n=8 then 'Yes' else 'No' end,300 from generate_series(1,10) n;
insert into public.plan_daily(record_id,upload_id,plan_date,value)
select id,upload_id,date '2026-10-11'+d,100 from public.plan_records cross join generate_series(1,3) d;
insert into public.date_wise_production(ewo,line_no,output_date,total_qty)
select (900000+n)::text,1,'2026-10-11',10 from generate_series(1,9) n;
insert into public.fabric_cutting_info(ewo,color_name,total_cut_qty)
select (900000+n)::text,'Blue',case n when 2 then 299 when 3 then 100 when 7 then 500 else 300 end from generate_series(1,10) n;
insert into public.sewing_input_output(ewo,color,po_no,line_no,order_qty,total_input_qty,total_output_qty,total_reject_qty,total_wip_qty)
select (900000+n)::text,'Blue','PO',1,300,case when n=7 then 100 else 0 end,0,0,0 from generate_series(1,10) n;
-- Missing day poisons only that day and later cumulative calculations.
delete from public.plan_daily where record_id=(select id from public.plan_records where ewo=900004) and plan_date='2026-10-13';
-- Duplicate sewing evidence, contradictory cut evidence and two required stages.
insert into public.sewing_input_output(ewo,color,po_no,line_no,order_qty,total_input_qty,total_output_qty,total_reject_qty,total_wip_qty)
select ewo,color,po_no,line_no,order_qty,total_input_qty,total_output_qty,total_reject_qty,total_wip_qty from public.sewing_input_output where ewo='900005';
insert into public.fabric_cutting_info(ewo,color_name,total_cut_qty) values('900006','Blue',301);
insert into public.embellishment_send_receive_rows("EWO No","Color","Code","Style No","Date","Total Print Receive Qty","Total Print Return Qty","Total EMB Receive Qty","Total EMB Return Qty",is_active)
values('900007','Blue','code','style',to_char(current_date-2,'DD-Mon-YY'),'900','0','0','0',true),
 ('900007','Blue','code','style',to_char(current_date-1,'DD-Mon-YY'),'450','150','0','0',true);
-- One pooled EWO serving two lines: daily total 120; 300 stock cannot cover day 3.
insert into public.plan_records(upload_id,source_row,ewo,col,buyer,line_no,criteria,print,emb,total)
values('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',11,900009,'Blue','Buyer','Line 02','Plan/Day','No','No',180);
update public.plan_daily set value=60 where record_id=(select id from public.plan_records where ewo=900009 and line_no='Line 01');
insert into public.plan_daily(record_id,upload_id,plan_date,value)
select id,upload_id,date '2026-10-11'+d,60 from public.plan_records cross join generate_series(1,3) d where source_row=11;
do $$ declare r record; begin
 select * into r from public.ready_input_coverage where ewo='900001';
 if r.day1_status<>'green' or r.day2_status<>'green' or r.day3_status<>'green' or r.shortage_qty<>0 then raise exception 'Exact coverage failed'; end if;
 select * into r from public.ready_input_coverage where ewo='900002';
 if r.day2_status<>'green' or r.day3_status<>'red' or r.shortage_qty<>1 or r.first_short_date<>date '2026-10-14' then raise exception 'Day 3 shortage failed'; end if;
 select * into r from public.ready_input_coverage where ewo='900003';
 if r.day1_status<>'green' or r.day2_status<>'red' or r.day3_status<>'red' or r.shortage_qty<>200 then raise exception 'Stock reused across dates'; end if;
 select * into r from public.ready_input_coverage where ewo='900004';
 if r.day1_status<>'green' or r.day2_status<>'unknown' or r.day3_status<>'unknown' or r.required_qty is not null then raise exception 'Missing date became zero/off-day'; end if;
 if exists(select 1 from public.ready_input_coverage where ewo in ('900005','900006','900008') and day1_status<>'unknown') then raise exception 'Conflicting/dual-stage evidence became ready'; end if;
 select * into r from public.ready_input_coverage where ewo='900007';
 if r.ready_input_qty<>200 or r.day2_status<>'green' or r.day3_status<>'red' then raise exception 'Cumulative report/returns/input subtraction failed'; end if;
 select * into r from public.ready_input_coverage where ewo='900009';
 if r.lines<>array[1,2] or r.day1_plan<>120 or r.day3_status<>'red' or r.shortage_qty<>60 then raise exception 'Stock duplicated across lines'; end if;
 if exists(select 1 from public.ready_input_coverage where ewo='900010') then raise exception 'Non-running EWO included'; end if;
end $$;
do $$ begin
 if exists((select to_jsonb(r) from public.ready_input_coverage r) except (select to_jsonb(r) from public.get_ready_input_coverage('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') r)) then raise exception 'Scoped RPC differs from view'; end if;
 if exists(select 1 from public.get_ready_input_coverage('cccccccc-cccc-cccc-cccc-cccccccccccc')) then raise exception 'Unknown upload returned data'; end if;
end $$;
savepoint off_day;
update public.plan_daily set value=0 where plan_date='2026-10-12';
do $$ begin if not (select day1_off from public.ready_input_coverage where ewo='900001') then raise exception 'Confirmed global off-day missing'; end if; end $$;
rollback to off_day;
savepoint colors;
insert into public.plan_records(upload_id,source_row,ewo,col,buyer,line_no,criteria,print,emb,total)
values('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',12,900001,'Red','Buyer','Line 01','Plan/Day','No','No',300);
insert into public.plan_daily(record_id,upload_id,plan_date,value)
select id,upload_id,date '2026-10-11'+d,100 from public.plan_records cross join generate_series(1,3) d where source_row=12;
insert into public.fabric_cutting_info(ewo,color_name,total_cut_qty) values('900001','Red',1000);
insert into public.sewing_input_output(ewo,color,po_no,line_no,order_qty,total_input_qty) values('900001','Red','PO',1,300,0);
update public.fabric_cutting_info set total_cut_qty=100 where ewo='900001' and color_name='Blue';
do $$ begin if (select day2_status from public.ready_input_coverage where ewo='900001')<>'red' then raise exception 'Wrong color stock covered demand'; end if; end $$;
rollback to colors;
set local role authenticated;
do $$ begin if (select count(*) from public.ready_input_coverage)<>9 then raise exception 'Slide 21-only access failed'; end if; end $$;
reset role;
update public.site_users set permissions='{}';
set local role authenticated;
do $$ begin if exists(select 1 from public.ready_input_coverage) or exists(select 1 from public.get_ready_input_coverage('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')) then raise exception 'Denied user read coverage'; end if; end $$;
reset role;
do $$ begin if has_table_privilege('anon','public.ready_input_coverage','SELECT') then raise exception 'Anon view exposure'; end if; end $$;
rollback;
