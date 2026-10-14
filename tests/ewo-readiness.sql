-- Run after readiness-schema.sql and the readiness migration in an isolated database.
begin;
set local timezone='Asia/Dhaka';
insert into public.site_users(auth_user_id,email,role,status,permissions)
values(gen_random_uuid(),'readiness-fixture@example.test','admin','active','{}');
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.site_users where email='readiness-fixture@example.test'),true);
insert into public.plan_uploads(file_name,status,planning_id) values('readiness-fixture.csv','complete','readiness-fixture');
insert into public.plan_records(upload_id,source_row,ewo,col,buyer,line_no,criteria,print,emb,pcd,psd,pfd,delivery,total)
select u.id,n,900000+n,'Blue','Buyer','1','Plan/Day','Yes','Yes',current_date+5,current_date+7,current_date+12,current_date+15,100
from public.plan_uploads u cross join generate_series(1,31) n where u.planning_id='readiness-fixture';
insert into public.plan_daily(record_id,upload_id,plan_date,value)
select id,upload_id,current_date+7,100 from public.plan_records where ewo<>900012;
insert into public.fabric_cutting_info(ewo,color_name,total_cut_qty,cutable_qty)
select ewo::text,'Blue',80,80 from public.plan_records where ewo<>900003;
insert into public.size_set_rows(batch_id,source_row_no,file_name,row_data,is_active)
select gen_random_uuid(),2,'fixture.csv',jsonb_build_object('EWO',ewo::text,'Color','Blue','T & A Closed','Closed'),true
from public.plan_records;

-- Real staging evidence exists, but must not participate in the view or board-only reads.
insert into public.size_set_rows(batch_id,source_row_no,file_name,row_data,is_active)
values(gen_random_uuid(),2,'staging.csv','{"EWO":"900001","Color":"Blue","T & A Closed":"Open"}',false);
insert into public.accessories_rows(batch_id,report_date,source_row_no,file_name,row_data,is_active)
values(gen_random_uuid(),'12-Oct-26',2,'staging.csv','{"EWO":"900001","Sewing Trims Pending Stts":"Not Ok"}',false);
insert into public.accessories_rows(batch_id,report_date,source_row_no,file_name,row_data,is_active)
select gen_random_uuid(),'12-Oct-26',2,'fixture.csv',jsonb_build_object('EWO',ewo::text,'Sewing Trims Pending Stts','All Acc. Balanced'),true
from public.plan_records;
insert into public.embellishment_send_receive_rows(batch_id,source_row_no,file_name,"EWO No","Color","Code","Style No","Date",
 "Total Print Receive Qty","Total Print Return Qty","Total EMB Receive Qty","Total EMB Return Qty",is_active)
select gen_random_uuid(),2,'fixture.csv',ewo::text,'Blue','code','style',to_char(current_date,'DD-Mon-YY'),'80','0','80','0',true
from public.plan_records;

-- 79 < ceil(100 * .8); exact 80 is sufficient.
update public.fabric_cutting_info set total_cut_qty=79 where ewo='900002';
update public.embellishment_send_receive_rows set "Total Print Receive Qty"='79',"Total EMB Receive Qty"='79' where "EWO No"='900002';
-- Wrong color cannot supply Blue's quantity.
insert into public.fabric_cutting_info(ewo,color_name,total_cut_qty,cutable_qty) values('900003','Black',800,800);
-- Different colors cannot offset each other's deficits.
insert into public.plan_records(upload_id,source_row,ewo,col,buyer,line_no,criteria,print,emb,pcd,psd,pfd,total)
select upload_id,100,900004,'Red','Buyer','2','Plan/Day','Yes','Yes',pcd,psd,pfd,100 from public.plan_records where ewo=900004;
insert into public.plan_daily(record_id,upload_id,plan_date,value)
select id,upload_id,current_date+7,100 from public.plan_records where source_row=100;
update public.fabric_cutting_info set total_cut_qty=160,cutable_qty=160 where ewo='900004';
insert into public.fabric_cutting_info(ewo,color_name,total_cut_qty,cutable_qty) values('900004','Red',0,0);
-- Non-required embellishment is N/A, not a blocker or part of the score.
update public.plan_records set print='No',emb='No' where ewo=900005;
delete from public.embellishment_send_receive_rows where "EWO No"='900005';
-- Returns reduce usable quantities.
update public.embellishment_send_receive_rows set "Total Print Receive Qty"='100',"Total Print Return Qty"='21' where "EWO No"='900006';
-- Cumulative history must use 80, not 80+70.
insert into public.embellishment_send_receive_rows(batch_id,source_row_no,file_name,"EWO No","Color","Code","Style No","Date",
 "Total Print Receive Qty","Total Print Return Qty","Total EMB Receive Qty","Total EMB Return Qty",is_active)
values(gen_random_uuid(),2,'old.csv','900007','Blue','code','style',to_char(current_date-1,'DD-Mon-YY'),'70','0','70','0',true);
update public.plan_records set print='' where ewo=900008;
update public.accessories_rows set row_data=jsonb_set(row_data,'{Sewing Trims Pending Stts}','"All Acc. Balanced without-(Thread)"') where row_data->>'EWO'='900009';
update public.size_set_rows set row_data=jsonb_set(row_data,'{T & A Closed}','""') where row_data->>'EWO'='900010';
insert into public.fabric_cutting_info(ewo,color_name,total_cut_qty,cutable_qty) values('900011','Blue',81,80);
update public.plan_records set pcd=current_date-2,psd=current_date-1 where ewo=900013;
update public.fabric_cutting_info set total_cut_qty=0,cutable_qty=0 where ewo='900013';
update public.plan_records set pcd=current_date-5,psd=current_date-4,pfd=current_date-1 where ewo=900014;
insert into public.sewing_input_output(ewo,color,po_no,line_no,order_qty,total_input_qty,total_output_qty,total_reject_qty,total_wip_qty)
values('900014','Blue','PO',1,100,100,99,0,1),('900024','Blue','PO',1,100,1,0,0,1);
insert into public.sewing_input_output(ewo,color,po_no,line_no,order_qty,total_input_qty,total_output_qty,total_reject_qty,total_wip_qty)
values('900031','Blue','PO',1,100,100,99,0,1),('900031','Blue','PO',1,100,100,99,0,1);
update public.plan_records set pcd=current_date-5,psd=current_date-4,pfd=current_date-1 where ewo=900031;
update public.fabric_cutting_info set total_cut_qty=0,cutable_qty=0 where ewo='900024';
update public.plan_records set pcd=null where ewo=900015;
update public.plan_records set delivery=pfd-1 where ewo=900027;
insert into public.size_set_rows(batch_id,source_row_no,file_name,row_data,is_active)
values(gen_random_uuid(),3,'fixture.csv','{"EWO":"900028","Color":"Blue","T & A Closed":""}',true);
insert into public.accessories_rows(batch_id,report_date,source_row_no,file_name,row_data,is_active)
values(gen_random_uuid(),'12-Oct-26',3,'fixture.csv','{"EWO":"900028","Sewing Trims Pending Stts":""}',true);
update public.fabric_cutting_info set cutable_qty=null where ewo in ('900029','900030');
update public.fabric_cutting_info set total_cut_qty=79 where ewo='900030';
update public.plan_records set pcd=current_date-1 where ewo=900016;
update public.fabric_cutting_info set total_cut_qty=0,cutable_qty=0 where ewo='900016';
update public.plan_records set criteria='SAH/Day' where ewo=900017;
update public.plan_records set line_no='46' where ewo=900018;
update public.plan_records set is_summary_row=true where ewo=900019;
update public.plan_records set line_no='3' where ewo=900026;
update public.plan_daily set value=0 where record_id=(select id from public.plan_records where ewo=900020);
insert into public.plan_daily(record_id,upload_id,plan_date,value)
select id,upload_id,current_date+8,100 from public.plan_records where ewo=900020;
update public.fabric_cutting_info set ewo='00900021.0',color_name=' blue  ' where ewo='900021';
insert into public.embellishment_send_receive_rows(batch_id,source_row_no,file_name,"EWO No","Color","Code","Style No","Date",
 "Total Print Receive Qty","Total Print Return Qty","Total EMB Receive Qty","Total EMB Return Qty",is_active)
select gen_random_uuid(),3,'fixture.csv',"EWO No","Color","Code","Style No","Date","Total Print Receive Qty","Total Print Return Qty","Total EMB Receive Qty","Total EMB Return Qty",true
from public.embellishment_send_receive_rows where "EWO No" in ('900022','900023');
update public.embellishment_send_receive_rows set "Total Print Receive Qty"='81' where "EWO No"='900023' and source_row_no=3;
-- Print is required only for the printed part of the first-day quantity.
update public.plan_records set print='No',emb='No' where ewo=900025;
insert into public.plan_records(upload_id,source_row,ewo,col,buyer,line_no,criteria,print,emb,pcd,psd,pfd,total)
select upload_id,101,900025,'Blue','Buyer','1','Plan/Day','Yes','No',pcd,psd,pfd,100 from public.plan_records where ewo=900025;
insert into public.plan_daily(record_id,upload_id,plan_date,value)
select id,upload_id,current_date+7,100 from public.plan_records where source_row=101;
update public.fabric_cutting_info set total_cut_qty=160,cutable_qty=160 where ewo='900025';
-- Same EWO under another snapshot has a different starter target.
insert into public.plan_uploads(file_name,status,planning_id) values('second.csv','complete','readiness-second');
insert into public.plan_records(upload_id,source_row,ewo,col,buyer,line_no,criteria,print,emb,pcd,psd,pfd,total)
select u.id,1,900001,'Blue','Buyer','1','Plan/Day','Yes','Yes',current_date+5,current_date+7,current_date+12,200
from public.plan_uploads u where planning_id='readiness-second';
insert into public.plan_daily(record_id,upload_id,plan_date,value)
select r.id,r.upload_id,current_date+7,200 from public.plan_records r join public.plan_uploads u on u.id=r.upload_id where u.planning_id='readiness-second';

set local role authenticated;
do $$ declare r public.ewo_readiness_board%rowtype; upload uuid;
begin
  select id into upload from public.plan_uploads where planning_id='readiness-fixture';
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900001';
  if r.starter_qty<>80 or r.sewing_status<>'green' or r.readiness_score<>100 then raise exception 'Exact 80%% starter boundary failed'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900002';
  if r.sewing_status<>'amber' or r.readiness_score<>75 then raise exception '79%% partial score failed'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900003';
  if r.cutting_status<>'unknown' or r.readiness_score is not null then raise exception 'Wrong color supplied starter quantity'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900004';
  if r.cutting_status<>'red' or r.starter_qty<>160 then raise exception 'Color deficits offset each other'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900005';
  if r.print_status<>'na' or r.embroidery_status<>'na' or r.applicable_stages<>4 or r.readiness_score<>100 then raise exception 'N/A score exclusion failed'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900006';
  if r.print_status<>'amber' or (r.color_details->0->>'print_qty')::numeric<>79 then raise exception 'Returns not deducted'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900007';
  if (r.color_details->0->>'print_qty')::numeric<>80 then raise exception 'Cumulative dates were summed'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900008';
  if r.print_status<>'unknown' then raise exception 'Missing print flag treated as No'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900009';
  if r.accessories_status<>'red' then raise exception 'Balanced without counted as ready'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900010';
  if r.size_set_status<>'unknown' then raise exception 'Blank Closed counted as ready'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900011';
  if r.cutting_status<>'unknown' then raise exception 'Conflicting fabric rows were summed'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900012';
  if r.first_plan_date is not null or r.readiness_score is not null then raise exception 'Missing daily plan guessed'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900013';
  if r.delivery_risk<>'high' or r.risk_reason not like 'PSD%' then raise exception 'PSD breach not flagged'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900014';
  if r.delivery_risk<>'high' or r.risk_reason not like 'PFD%' then raise exception 'PFD breach not flagged'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900015';
  if r.delivery_risk<>'unknown' then raise exception 'Missing milestone guessed'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900016';
  if r.delivery_risk<>'high' or r.risk_reason not like 'PCD%' then raise exception 'PCD breach not flagged'; end if;
  if exists(select 1 from public.ewo_readiness_board where ewo in ('900017','900018','900019')) then raise exception 'Invalid planning rows included'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900020';
  if r.first_plan_date<>current_date+8 or r.starter_qty<>80 then raise exception 'Zero first day selected'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900021';
  if r.cutting_status<>'green' then raise exception 'EWO/color normalization failed'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900022';
  if (r.color_details->0->>'print_qty')::numeric<>80 then raise exception 'Exact duplicate counted twice'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900023';
  if r.print_status<>'unknown' then raise exception 'Conflicting cumulative rows summed'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900024';
  if not r.sewing_started or r.sewing_status<>'red' then raise exception 'Input evidence bypassed prerequisites'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900025';
  if r.starter_qty<>160 or (r.color_details->0->>'print_required_qty')::numeric<>80
    or r.print_status<>'green' or r.readiness_score<>100 then raise exception 'Print-required subset quantity failed'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900027';
  if r.delivery_risk<>'high' or r.risk_reason not like 'Planned finish%' then raise exception 'Negative finish-to-delivery slack missed'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900028';
  if r.accessories_status<>'unknown' or r.size_set_status<>'unknown' or r.readiness_score is not null then raise exception 'Missing approval treated as known partial'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900029';
  if r.fabric_status<>'green' then raise exception 'Sufficient cut evidence discarded because cutable qty missing'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900030';
  if r.fabric_status<>'unknown' then raise exception 'Missing fabric quantity treated as zero'; end if;
  select * into strict r from public.ewo_readiness_board where upload_id=upload and ewo='900031';
  if not r.sewing_started or r.output_qty is not null or r.delivery_risk<>'unknown' then raise exception 'Ambiguous sewing copies gave a definitive finish risk'; end if;
  select v.* into strict r from public.ewo_readiness_board v join public.plan_uploads u on u.id=v.upload_id
    where u.planning_id='readiness-second' and v.ewo='900001';
  if r.starter_qty<>160 or r.sewing_status<>'amber' then raise exception 'Selected upload lost its target'; end if;
  if public.ewo_readiness_date('31-Feb-26') is not null or public.ewo_readiness_date('1-Oct') is not null then raise exception 'Invalid or yearless date inferred'; end if;
  if public.ewo_readiness_number('8,0') is not null or public.ewo_readiness_number('1,000')<>1000 then raise exception 'Malformed numeric source accepted'; end if;
end $$;
reset role;
insert into public.line_chassis_priority(line_no) values(1),(2);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.ewo_readiness_board where ewo='900026') then raise exception 'Unconfigured master line included'; end if;
end $$;
reset role;
delete from public.line_chassis_priority;
-- Board-only users can read the view and active evidence; other module permissions are not required.
update public.site_users set role='user',permissions='{"slide_21":true}' where auth_user_id=auth.uid();
set local role authenticated;
do $$ begin
  if (select count(*) from public.ewo_readiness_board)=0 then raise exception 'Board-only user cannot read'; end if;
  if exists(select 1 from public.size_set_rows where not is_active) then raise exception 'Staging rows visible'; end if;
  if exists(select 1 from public.accessories_rows where not is_active) then raise exception 'Accessories staging rows visible'; end if;
  if has_table_privilege(current_user,'public.ewo_readiness_board','INSERT') then raise exception 'Board write grant'; end if;
  begin
    insert into public.size_set_rows(batch_id,source_row_no,file_name,row_data,is_active)
    values(gen_random_uuid(),2,'forbidden.csv','{}',false);
    raise exception 'Board-only user could upload';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.site_users set status='disabled' where auth_user_id=auth.uid();
set local role authenticated;
do $$ begin if exists(select 1 from public.ewo_readiness_board) then raise exception 'Disabled user read board'; end if; end $$;
reset role;
update public.site_users set status='active',permissions='{}' where auth_user_id=auth.uid();
set local role authenticated;
do $$ begin if exists(select 1 from public.ewo_readiness_board) then raise exception 'Unpermitted user read board'; end if; end $$;
reset role;
do $$ begin
  if has_table_privilege('anon','public.ewo_readiness_board','SELECT') then raise exception 'Anon view grant'; end if;
end $$;
rollback;
select 'PASS readiness thresholds, source grain/history/unknowns, scoring, milestones and RLS' as result;
