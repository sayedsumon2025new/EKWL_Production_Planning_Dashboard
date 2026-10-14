-- Limit daily grouping to eligible Plan/Day records and compute cumulative receipts once.
-- Keeps readiness rules, columns and RLS unchanged.
create or replace view public.ewo_readiness_board
with (security_invoker=true,security_barrier=true) as
with
valid_lines as (select line_no from generate_series(1,48) line_no where line_no<>46),
master_lines as (
  select distinct c.line_no from public.line_chassis_priority c join valid_lines v on v.line_no=c.line_no
),
allowed_lines as (
  select v.line_no from valid_lines v where not exists(select 1 from master_lines)
    or exists(select 1 from master_lines m where m.line_no=v.line_no)
),
p as not materialized (
  select r.id,r.upload_id,public.ewo_readiness_ewo(r.ewo::text) ewo,
    public.ewo_readiness_key(r.col) color_key,r.col color,r.buyer,
    public.ewo_readiness_key(r.print) print_flag,public.ewo_readiness_key(r.emb) emb_flag,
    r.pcd,r.psd,r.pfd,r.delivery,r.total,
    case when substring(r.line_no from '[0-9]+') ~ '^[0-9]{1,2}$'
      then substring(r.line_no from '[0-9]+')::integer end line_no
  from public.plan_records r join public.plan_uploads u on u.id=r.upload_id
  where u.status='complete' and r.criteria='Plan/Day' and not coalesce(r.is_summary_row,false)
    and r.ewo is not null and (select public.current_site_can('slide_21'))
    and case when substring(r.line_no from '[0-9]+') ~ '^[0-9]{1,2}$'
      then substring(r.line_no from '[0-9]+')::integer end in (select line_no from allowed_lines)
),
daily as not materialized (
  select d.record_id,d.upload_id,d.plan_date,max(d.value) qty,
    count(distinct d.value)>1 or count(d.value)<>count(*) conflict
  from public.plan_daily d join p eligible on eligible.id=d.record_id and eligible.upload_id=d.upload_id
  group by d.record_id,d.upload_id,d.plan_date
),
scheduled as not materialized (
  select p.*,d.plan_date,d.qty,d.conflict from p join daily d
    on d.record_id=p.id and d.upload_id=p.upload_id where d.qty>0
),
first_day as (
  select upload_id,ewo,min(plan_date) first_plan_date from scheduled group by upload_id,ewo
),
plan as not materialized (
  select p.upload_id,p.ewo,string_agg(distinct p.buyer,', ' order by p.buyer) buyer,
    array_agg(distinct p.line_no order by p.line_no) lines,
    min(p.pcd) pcd,min(p.psd) psd,max(p.pfd) pfd,min(p.delivery) delivery,
    sum(p.total) plan_qty,
    bool_and(p.pcd is not null and p.psd is not null and p.pfd is not null
      and p.pcd<=p.psd and p.psd<=p.pfd) dates_valid,
    bool_and(p.total is not null and p.total>=0) plan_qty_valid,
    bool_or(p.delivery is not null and p.pfd>p.delivery) finish_after_delivery,
    bool_or(p.print_flag='yes') print_required,bool_and(p.print_flag in ('yes','no')) print_flags_known,
    bool_or(p.emb_flag='yes') emb_required,bool_and(p.emb_flag in ('yes','no')) emb_flags_known,
    bool_and(exists(select 1 from daily d where d.record_id=p.id and d.upload_id=p.upload_id and d.qty>0)) schedule_complete
  from p group by p.upload_id,p.ewo
),
targets as (
  select s.upload_id,s.ewo,s.color_key,min(s.color) color,f.first_plan_date,
    sum(s.qty) first_day_plan_qty,ceil(sum(s.qty)*0.8) threshold_qty,
    ceil(coalesce(sum(s.qty) filter(where s.print_flag='yes'),0)*0.8) print_threshold_qty,
    ceil(coalesce(sum(s.qty) filter(where s.emb_flag='yes'),0)*0.8) emb_threshold_qty,
    bool_and(s.print_flag in ('yes','no')) print_flags_known,
    bool_and(s.emb_flag in ('yes','no')) emb_flags_known,bool_or(s.conflict) plan_conflict
  from scheduled s join first_day f on f.upload_id=s.upload_id and f.ewo=s.ewo and f.first_plan_date=s.plan_date
  group by s.upload_id,s.ewo,s.color_key,f.first_plan_date
),
fabric as (
  select public.ewo_readiness_ewo(ewo) ewo,public.ewo_readiness_key(color_name) color_key,
    -- Same-grain conflicting rows cannot safely be summed into starter quantity.
    count(distinct jsonb_build_array(total_cut_qty,cutable_qty))>1 conflict,
    max(total_cut_qty) cut_qty,max(cutable_qty) cutable_qty,max(uploaded_at) uploaded_at
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
accessories as (
  select public.ewo_readiness_ewo(row_data->>'EWO') ewo,
    case when bool_and(public.ewo_readiness_key(row_data->>'Sewing Trims Pending Stts') in ('ok','all acc. balanced')) then 'green'
      when bool_or(public.ewo_readiness_key(row_data->>'Sewing Trims Pending Stts')='') then 'unknown'
      when bool_or(public.ewo_readiness_key(row_data->>'Sewing Trims Pending Stts') in ('ok','all acc. balanced')) then 'amber'
      else 'red' end status,max(uploaded_at) uploaded_at
  from public.accessories_rows where is_active group by 1
),
size_set as (
  select public.ewo_readiness_ewo(row_data->>'EWO') ewo,public.ewo_readiness_key(row_data->>'Color') color_key,
    case when bool_and(public.ewo_readiness_key(row_data->>'T & A Closed')='closed') then 'green'
      when bool_or(public.ewo_readiness_key(row_data->>'T & A Closed')='') then 'unknown'
      when bool_or(public.ewo_readiness_key(row_data->>'T & A Closed')='closed') then 'amber'
      else 'red' end status,max(uploaded_at) uploaded_at
  from public.size_set_rows where is_active group by 1,2
),
sewing_rows as (
  select public.ewo_readiness_ewo(ewo) ewo,public.ewo_readiness_key(color) color_key,
    po_no,line_no,order_qty,total_input_qty,total_output_qty,total_reject_qty,total_wip_qty,count(*) copies
  from public.sewing_input_output
  group by 1,2,po_no,line_no,order_qty,total_input_qty,total_output_qty,total_reject_qty,total_wip_qty
),
sewing as (
  select ewo,bool_or(total_input_qty>0) sewing_started,
    case when bool_and(copies=1 and total_input_qty is not null and total_input_qty>=0) then sum(total_input_qty) end input_qty,
    case when bool_and(copies=1 and total_output_qty is not null and total_output_qty>=0) then sum(total_output_qty) end output_qty
  from sewing_rows group by ewo
),
color_status as (
  select t.*,case when f.conflict then null else f.cut_qty end cut_qty,
    case when f.conflict then null else greatest(f.cut_qty,f.cutable_qty) end fabric_available_qty,
    e.print_qty,e.emb_qty,e.report_date embellishment_date,
    f.uploaded_at fabric_uploaded_at,e.uploaded_at embellishment_uploaded_at,ss.uploaded_at size_set_uploaded_at,
    case when t.plan_conflict or t.color_key='' or not pl.schedule_complete or f.conflict
      or f.cut_qty<0 or f.cutable_qty<0 then 'unknown'
      when greatest(f.cut_qty,f.cutable_qty)>=t.threshold_qty then 'green'
      when f.cut_qty is null or f.cutable_qty is null then 'unknown'
      when greatest(f.cut_qty,f.cutable_qty)>0 then 'amber'
      when greatest(f.cut_qty,f.cutable_qty)=0 then 'red' else 'unknown' end fabric_status,
    case when t.plan_conflict or t.color_key='' or not pl.schedule_complete or f.conflict or f.cut_qty is null or f.cut_qty<0 then 'unknown'
      when f.cut_qty>=t.threshold_qty then 'green' when f.cut_qty>0 then 'amber' else 'red' end cutting_status,
    case when not t.print_flags_known or t.plan_conflict or not pl.schedule_complete then 'unknown'
      when t.print_threshold_qty=0 then 'na' when t.color_key='' or e.print_qty is null then 'unknown'
      when e.print_qty>=t.print_threshold_qty then 'green' when e.print_qty>0 then 'amber' else 'red' end print_status,
    case when not t.emb_flags_known or t.plan_conflict or not pl.schedule_complete then 'unknown'
      when t.emb_threshold_qty=0 then 'na' when t.color_key='' or e.emb_qty is null then 'unknown'
      when e.emb_qty>=t.emb_threshold_qty then 'green' when e.emb_qty>0 then 'amber' else 'red' end embroidery_status,
    case when t.color_key='' then 'unknown' else coalesce(ss.status,'unknown') end size_set_status
  from targets t join plan pl on pl.upload_id=t.upload_id and pl.ewo=t.ewo
  left join fabric f on f.ewo=t.ewo and f.color_key=t.color_key
  left join em e on e.ewo=t.ewo and e.color_key=t.color_key
  left join size_set ss on ss.ewo=t.ewo and ss.color_key=t.color_key
),
rollup as (
  select upload_id,ewo,min(first_plan_date) first_plan_date,sum(first_day_plan_qty) first_day_plan_qty,
    sum(threshold_qty) starter_qty,
    public.ewo_readiness_light(array_agg(fabric_status)) fabric_status,
    public.ewo_readiness_light(array_agg(cutting_status)) cutting_status,
    public.ewo_readiness_light(array_agg(print_status)) print_status,
    public.ewo_readiness_light(array_agg(embroidery_status)) embroidery_status,
    public.ewo_readiness_light(array_agg(size_set_status)) size_set_status,
    jsonb_agg(jsonb_build_object('color',color,'plan_qty',first_day_plan_qty,'required_qty',threshold_qty,
      'fabric_qty',fabric_available_qty,'cut_qty',cut_qty,'print_qty',print_qty,'emb_qty',emb_qty,
      'print_required_qty',print_threshold_qty,'emb_required_qty',emb_threshold_qty,
      'fabric',fabric_status,'cutting',cutting_status,'print',print_status,'embroidery',embroidery_status,
      'size_set',size_set_status,'fabric_uploaded_at',fabric_uploaded_at,
      'embellishment_date',embellishment_date,'embellishment_uploaded_at',embellishment_uploaded_at,
      'size_set_uploaded_at',size_set_uploaded_at) order by color_key) color_details
  from color_status group by upload_id,ewo
),
core as (
  select pl.*,r.first_plan_date,r.first_day_plan_qty,r.starter_qty,
    coalesce(r.fabric_status,'unknown') fabric_status,coalesce(r.cutting_status,'unknown') cutting_status,
    coalesce(r.print_status,case when not pl.print_required and pl.print_flags_known then 'na' else 'unknown' end) print_status,
    coalesce(r.embroidery_status,case when not pl.emb_required and pl.emb_flags_known then 'na' else 'unknown' end) embroidery_status,
    coalesce(a.status,'unknown') accessories_status,coalesce(r.size_set_status,'unknown') size_set_status,
    a.uploaded_at accessories_uploaded_at,s.input_qty,s.output_qty,coalesce(s.sewing_started,false) sewing_started,
    coalesce(r.color_details,'[]'::jsonb) color_details,(now() at time zone 'Asia/Dhaka')::date as_of_date
  from plan pl left join rollup r on r.upload_id=pl.upload_id and r.ewo=pl.ewo
  left join accessories a on a.ewo=pl.ewo left join sewing s on s.ewo=pl.ewo
),
scored as (
  select c.*,x.applicable_stages,x.known_stages,
    case when x.known_stages=x.applicable_stages then x.score end readiness_score,
    public.ewo_readiness_light(array[
      fabric_status,cutting_status,print_status,embroidery_status,accessories_status,size_set_status]) sewing_status
  from core c cross join lateral (
    select count(*) filter(where status<>'na') applicable_stages,
      count(*) filter(where status in ('green','amber','red')) known_stages,
      round(avg(case status when 'green' then 100 when 'amber' then 50 when 'red' then 0 end),1) score
    from unnest(array[c.fabric_status,c.cutting_status,c.print_status,c.embroidery_status,c.accessories_status,c.size_set_status]) status
  ) x
)
select s.*,
  case
    when finish_after_delivery then 'high'
    when dates_valid and pfd<as_of_date and plan_qty_valid and output_qty<plan_qty then 'high'
    when dates_valid and psd<=as_of_date and not sewing_started and sewing_status in ('red','amber') then 'high'
    when dates_valid and pcd<=as_of_date and not sewing_started
      and public.ewo_readiness_light(array[fabric_status,cutting_status,size_set_status]) in ('red','amber') then 'high'
    when not dates_valid or readiness_score is null or not schedule_complete
      or (pfd<=as_of_date and (output_qty is null or not plan_qty_valid)) then 'unknown'
    when sewing_status in ('red','amber') or (pfd=as_of_date and output_qty<plan_qty) then 'watch'
    else 'low' end delivery_risk,
  case
    when finish_after_delivery then 'Planned finish is after the delivery date on a source planning row'
    when dates_valid and pfd<as_of_date and plan_qty_valid and output_qty<plan_qty then 'PFD passed; reported sewing output is below planned quantity'
    when dates_valid and psd<=as_of_date and not sewing_started and sewing_status in ('red','amber') then 'PSD reached; sewing-start prerequisites are incomplete'
    when dates_valid and pcd<=as_of_date and not sewing_started
      and public.ewo_readiness_light(array[fabric_status,cutting_status,size_set_status]) in ('red','amber') then 'PCD reached; fabric/cutting/size-set prerequisites are incomplete'
    when not dates_valid then 'Missing or inconsistent PCD/PSD/PFD'
    when readiness_score is null or not schedule_complete then 'Missing, ambiguous or incomplete source evidence'
    when pfd<=as_of_date and (output_qty is null or not plan_qty_valid) then 'Finish milestone cannot be assessed from available quantities'
    when sewing_status in ('red','amber') then 'Upcoming milestone; sewing-start prerequisites are incomplete'
    when pfd=as_of_date and output_qty<plan_qty then 'PFD today; reported output is below planned quantity'
    else 'No evidenced milestone breach; this is not a delivery forecast' end risk_reason
from scored s;

revoke all on public.ewo_readiness_board from public,anon;
grant select on public.ewo_readiness_board to authenticated;
