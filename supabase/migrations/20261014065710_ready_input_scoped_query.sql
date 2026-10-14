-- Bind selected upload before materialized evidence CTEs; same coverage rules as the view.
create or replace function public.get_ready_input_coverage(p_upload_id uuid)
returns setof public.ready_input_coverage
language sql stable security invoker set search_path=pg_catalog
as $coverage$
with
valid_lines as (select line_no from generate_series(1,48) line_no where line_no<>46),
master_lines as (
  select distinct c.line_no from public.line_chassis_priority c join valid_lines v on v.line_no=c.line_no
),
allowed_lines as (
  select v.line_no from valid_lines v where not exists(select 1 from master_lines)
    or exists(select 1 from master_lines m where m.line_no=v.line_no)
),
cutoff as (select max(output_date) cutoff_date from public.date_wise_production),
calendar as (select c.cutoff_date,c.cutoff_date+i run_date,i day_no from cutoff c cross join generate_series(1,3) i where c.cutoff_date is not null),
p as not materialized (
  select r.id,r.upload_id,public.ewo_readiness_ewo(r.ewo::text) ewo,r.buyer,
    public.ewo_readiness_key(r.col) color_key,r.col color,
    public.ewo_readiness_key(r.print) print_flag,public.ewo_readiness_key(r.emb) emb_flag,
    case when substring(r.line_no from '[0-9]+') ~ '^[0-9]{1,2}$' then substring(r.line_no from '[0-9]+')::integer end line_no
  from public.plan_records r join public.plan_uploads u on u.id=r.upload_id
  where r.upload_id=p_upload_id and u.status='complete' and r.criteria='Plan/Day' and not coalesce(r.is_summary_row,false)
    and r.ewo is not null and (select public.current_site_can('slide_21'))
    and substring(r.line_no from '[0-9]+') ~ '^[0-9]{1,2}$'
    and case when substring(r.line_no from '[0-9]+') ~ '^[0-9]{1,2}$' then substring(r.line_no from '[0-9]+')::integer end in (select line_no from allowed_lines)
),
color_daily as (
  select p.upload_id,p.ewo,p.color_key,min(p.color) color,c.run_date,c.day_no,
    bool_and(d.record_id is not null and d.value is not null and d.value>=0) plan_known,
    sum(d.value) qty,
    bool_and(p.print_flag='no') no_print,bool_and(p.print_flag='yes') all_print,
    bool_and(p.emb_flag='no') no_emb,bool_and(p.emb_flag='yes') all_emb
  from p cross join calendar c left join public.plan_daily d
    on d.upload_id=p.upload_id and d.record_id=p.id and d.plan_date=c.run_date
  group by p.upload_id,p.ewo,p.color_key,c.run_date,c.day_no
),
global_daily as (
  select upload_id,day_no,bool_and(plan_known) and sum(qty)=0 off_day
  from color_daily group by upload_id,day_no
),
color_targets as (
  select upload_id,ewo,color_key,min(color) color,
    bool_and(no_print) no_print,bool_and(all_print) all_print,
    bool_and(no_emb) no_emb,bool_and(all_emb) all_emb
  from color_daily group by upload_id,ewo,color_key having sum(qty)>0
),
fabric as (
  select public.ewo_readiness_ewo(ewo) ewo,public.ewo_readiness_key(color_name) color_key,
    count(distinct jsonb_build_array(total_cut_qty))>1 or bool_or(total_cut_qty is null or total_cut_qty<0) conflict,
    max(total_cut_qty) cut_qty,max(uploaded_at) uploaded_at
  from public.fabric_cutting_info group by 1,2
),
em_raw as (
  select public.ewo_readiness_ewo("EWO No") ewo,public.ewo_readiness_key("Color") color_key,
    "Code" code,"Style No" style,public.ewo_readiness_date("Date") report_date,
    public.ewo_readiness_number("Total Print Receive Qty") print_receive,
    public.ewo_readiness_number("Total Print Return Qty") print_return,
    public.ewo_readiness_number("Total EMB Receive Qty") emb_receive,
    public.ewo_readiness_number("Total EMB Return Qty") emb_return,uploaded_at
  from public.embellishment_send_receive_rows where is_active
),
em_dates as (
  select ewo,color_key,max(report_date) report_date,
    bool_or(report_date is null or report_date>(now() at time zone 'Asia/Dhaka')::date) dates_unknown
  from em_raw group by ewo,color_key
),
em_latest as (
  -- Receive/Return columns are cumulative: never add older report dates.
  select distinct r.ewo,r.color_key,r.code,r.style,r.print_receive,r.print_return,
    r.emb_receive,r.emb_return,r.uploaded_at from em_raw r join em_dates d
    on d.ewo=r.ewo and d.color_key=r.color_key and d.report_date=r.report_date
),
em_codes as (
  select ewo,color_key,code,style,max(print_receive) print_receive,max(print_return) print_return,
    max(emb_receive) emb_receive,max(emb_return) emb_return,max(uploaded_at) uploaded_at,
    count(distinct jsonb_build_array(print_receive,print_return))>1 print_conflict,
    count(distinct jsonb_build_array(emb_receive,emb_return))>1 emb_conflict,
    bool_and(print_receive is not null and print_return is not null) print_known,
    bool_and(emb_receive is not null and emb_return is not null) emb_known
  from em_latest group by ewo,color_key,code,style
),
em as materialized (
  select r.ewo,r.color_key,
    case when bool_and(r.print_known and not r.print_conflict and r.print_return<=r.print_receive)
      and not max(d.dates_unknown::integer)::boolean then sum(r.print_receive-r.print_return) end print_qty,
    case when bool_and(r.emb_known and not r.emb_conflict and r.emb_return<=r.emb_receive)
      and not max(d.dates_unknown::integer)::boolean then sum(r.emb_receive-r.emb_return) end emb_qty,
    max(d.report_date) report_date,max(r.uploaded_at) uploaded_at
  from em_codes r join em_dates d on d.ewo=r.ewo and d.color_key=r.color_key
  group by r.ewo,r.color_key
),
input_rows as (
  select public.ewo_readiness_ewo(ewo) ewo,public.ewo_readiness_key(color) color_key,
    po_no,line_no,order_qty,total_input_qty,total_output_qty,total_reject_qty,total_wip_qty,
    count(*) copies,max(uploaded_at) uploaded_at
  from public.sewing_input_output group by 1,2,po_no,line_no,order_qty,total_input_qty,total_output_qty,total_reject_qty,total_wip_qty
),
inputs as (
  select ewo,color_key,
    case when bool_and(copies=1 and total_input_qty is not null and total_input_qty>=0) then sum(total_input_qty) end input_qty,
    max(uploaded_at) uploaded_at
  from input_rows group by ewo,color_key
),
eligible as (
  select t.*,f.cut_qty,i.input_qty,e.print_qty,e.emb_qty,
    f.uploaded_at fabric_uploaded_at,i.uploaded_at input_uploaded_at,e.uploaded_at embellishment_uploaded_at,e.report_date,
    case
      when t.color_key='' then 'Missing planning color'
      when f.ewo is null then 'No matching cut report'
      when f.conflict then 'Missing, negative or conflicting cut quantity'
      when i.input_qty is null then 'Missing, invalid or duplicate sewing input evidence'
      when not (t.no_print or t.all_print) or not (t.no_emb or t.all_emb) then 'Mixed or unknown Print/EMB requirements for this color'
      when t.all_print and t.all_emb then 'Both Print and EMB required; common finished-piece identity is unavailable'
      when t.all_print and e.print_qty is null then 'Missing or conflicting net Print receipts'
      when t.all_emb and e.emb_qty is null then 'Missing or conflicting net EMB receipts'
    end evidence_issue,
    case when t.no_print and t.no_emb then f.cut_qty
      when t.all_print and t.no_emb then least(f.cut_qty,e.print_qty)
      when t.no_print and t.all_emb then least(f.cut_qty,e.emb_qty) end eligible_cut_qty
  from color_targets t left join fabric f on f.ewo=t.ewo and f.color_key=t.color_key
    left join inputs i on i.ewo=t.ewo and i.color_key=t.color_key
    left join em e on e.ewo=t.ewo and e.color_key=t.color_key
),
stock as (
  select e.*,case when evidence_issue is null and eligible_cut_qty is not null and input_qty<=eligible_cut_qty
    then eligible_cut_qty-input_qty end ready_qty,
    coalesce(evidence_issue,case when input_qty>eligible_cut_qty then 'Sewing input exceeds eligible cut/receipt quantity' end) reason
  from eligible e
),
color_cumulative as (
  select d.*,bool_and(plan_known) over w prefix_known,
    sum(qty) over w cumulative_qty,s.ready_qty,s.reason,s.cut_qty,s.input_qty,s.print_qty,s.emb_qty,
    s.fabric_uploaded_at,s.input_uploaded_at,s.embellishment_uploaded_at,s.report_date,
    s.color_key is not null stock_required
  from color_daily d left join stock s on s.upload_id=d.upload_id and s.ewo=d.ewo and s.color_key=d.color_key
  window w as (partition by d.upload_id,d.ewo,d.color_key order by d.day_no rows between unbounded preceding and current row)
),
daily_result as (
  select d.upload_id,d.ewo,d.day_no,min(d.run_date) run_date,
    case when bool_and(d.plan_known) then sum(d.qty) end plan_qty,
    case when bool_and(d.prefix_known) then sum(d.cumulative_qty) end required_qty,
    case when bool_and(d.prefix_known and (not d.stock_required or d.cumulative_qty=0 or d.ready_qty is not null))
      then sum(greatest(d.cumulative_qty-coalesce(d.ready_qty,0),0)) end shortage_qty,
    case when not bool_and(d.prefix_known and (not d.stock_required or d.cumulative_qty=0 or d.ready_qty is not null)) then 'unknown'
      when bool_or(d.cumulative_qty>coalesce(d.ready_qty,0)) then 'red' else 'green' end status,
    coalesce(bool_and(g.off_day),false) off_day
  from color_cumulative d join global_daily g on g.upload_id=d.upload_id and g.day_no=d.day_no
  group by d.upload_id,d.ewo,d.day_no
),
stock_totals as (
  select upload_id,ewo,case when bool_and(ready_qty is not null) then sum(ready_qty) end ready_input_qty,
    jsonb_agg(jsonb_build_object('color',color,'cut_qty',cut_qty,'input_qty',input_qty,'print_qty',print_qty,'emb_qty',emb_qty,
      'ready_qty',ready_qty,'reason',reason,'fabric_uploaded_at',fabric_uploaded_at,'input_uploaded_at',input_uploaded_at,
      'embellishment_uploaded_at',embellishment_uploaded_at,'embellishment_date',report_date) order by color_key) color_details
  from stock group by upload_id,ewo
),
running as (
  select public.ewo_readiness_ewo(d.ewo) ewo,sum(d.total_qty) cutoff_output
  from public.date_wise_production d join cutoff c on d.output_date=c.cutoff_date
  group by 1 having sum(d.total_qty)>0
),
metadata as (
  select upload_id,ewo,string_agg(distinct buyer,', ' order by buyer) buyer,array_agg(distinct line_no order by line_no) lines
  from p group by upload_id,ewo
)
select m.*,c.cutoff_date,r.cutoff_output,s.ready_input_qty,s.color_details,
  max(d.run_date) filter(where d.day_no=1) day1_date,max(d.run_date) filter(where d.day_no=2) day2_date,max(d.run_date) filter(where d.day_no=3) day3_date,
  max(d.plan_qty) filter(where d.day_no=1) day1_plan,max(d.plan_qty) filter(where d.day_no=2) day2_plan,max(d.plan_qty) filter(where d.day_no=3) day3_plan,
  max(d.status) filter(where d.day_no=1) day1_status,max(d.status) filter(where d.day_no=2) day2_status,max(d.status) filter(where d.day_no=3) day3_status,
  bool_or(d.off_day) filter(where d.day_no=1) day1_off,bool_or(d.off_day) filter(where d.day_no=2) day2_off,bool_or(d.off_day) filter(where d.day_no=3) day3_off,
  max(d.required_qty) filter(where d.day_no=3) required_qty,
  max(d.shortage_qty) filter(where d.day_no=3) shortage_qty,
  min(d.run_date) filter(where d.status='red') first_short_date,
  jsonb_agg(jsonb_build_object('date',d.run_date,'plan_qty',d.plan_qty,'cumulative_qty',d.required_qty,'shortage_qty',d.shortage_qty,'status',d.status,'off_day',d.off_day) order by d.day_no) day_details
from metadata m join running r on r.ewo=m.ewo cross join cutoff c
  join daily_result d on d.upload_id=m.upload_id and d.ewo=m.ewo
  left join stock_totals s on s.upload_id=m.upload_id and s.ewo=m.ewo
where exists(select 1 from color_daily x where x.upload_id=m.upload_id and x.ewo=m.ewo and x.qty>0)
group by m.upload_id,m.ewo,m.buyer,m.lines,c.cutoff_date,r.cutoff_output,s.ready_input_qty,s.color_details
$coverage$;
revoke all on function public.get_ready_input_coverage(uuid) from public,anon;
grant execute on function public.get_ready_input_coverage(uuid) to authenticated;
