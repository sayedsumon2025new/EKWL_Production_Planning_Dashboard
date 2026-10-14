-- Isolated PostgreSQL 17 test harness. Never run on the production database.
-- Relevant columns/types and SELECT policies mirror the inspected project schema.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema public,auth to anon,authenticated;
create table public.site_users (
  id bigint generated always as identity primary key,auth_user_id uuid unique,
  email text unique not null,role text not null default 'user',status text not null default 'active',
  permissions jsonb not null default '{}'
);
create function public.current_site_can(p_key text) returns boolean language sql stable
security definer set search_path=public as $$
  select coalesce((select role='admin' or coalesce((permissions->>p_key)::boolean,false)
    from public.site_users where auth_user_id=auth.uid() and status='active' limit 1),false)
$$;
create table public.plan_uploads (
  id uuid primary key default gen_random_uuid(),file_name text not null,status text,
  uploaded_at timestamptz default now(),planning_month date,sequence_no integer,planning_id text
);
create table public.plan_records (
  id bigint generated always as identity primary key,upload_id uuid references public.plan_uploads(id),
  source_row integer not null,ewo numeric,col text,buyer text,line_no text,criteria text,
  is_summary_row boolean default false,print text,emb text,pcd date,psd date,pfd date,delivery date,total numeric,
  unique(upload_id,source_row)
);
create table public.plan_daily (
  id bigint generated always as identity primary key,record_id bigint references public.plan_records(id),
  upload_id uuid references public.plan_uploads(id),plan_date date not null,value numeric,
  unique(record_id,plan_date)
);
create table public.line_chassis_priority (line_no integer,priority_order integer,product_name text);
alter table public.line_chassis_priority enable row level security;
create policy existing_priority_read on public.line_chassis_priority for select to authenticated using(true);
grant select on public.line_chassis_priority to authenticated;
create table public.fabric_cutting_info (
  id bigint generated always as identity primary key,ewo text,color_name text,
  total_cut_qty numeric,cutable_qty numeric,uploaded_at timestamptz default now()
);
create table public.sewing_input_output (
  id bigint generated always as identity primary key,ewo text,color text,po_no text,line_no integer,
  order_qty numeric,total_input_qty numeric,total_output_qty numeric,total_reject_qty numeric,total_wip_qty numeric
);
create table public.accessories_rows (
  id bigint generated always as identity primary key,batch_id uuid,report_date text,source_row_no integer,
  file_name text,row_data jsonb,uploaded_by uuid default auth.uid(),uploaded_at timestamptz default now(),is_active boolean
);
create table public.size_set_rows (
  id bigint generated always as identity primary key,batch_id uuid,source_row_no integer,file_name text,
  row_data jsonb,uploaded_by uuid default auth.uid(),uploaded_at timestamptz default now(),is_active boolean
);
create table public.embellishment_send_receive_rows (
  id bigint generated always as identity primary key,batch_id uuid,source_row_no integer,file_name text,
  "EWO No" text,"Color" text,"Code" text,"Style No" text,"Date" text,
  "Total Print Receive Qty" text,"Total Print Return Qty" text,"Total EMB Receive Qty" text,"Total EMB Return Qty" text,
  uploaded_by uuid default auth.uid(),uploaded_at timestamptz default now(),is_active boolean
);
alter table public.site_users enable row level security;
create policy read_self on public.site_users for select to authenticated using(auth_user_id=auth.uid());
grant select on public.site_users to authenticated;
do $$ declare tab text; begin
  foreach tab in array array['plan_uploads','plan_records','plan_daily','fabric_cutting_info','sewing_input_output'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('create policy existing_read on public.%I for select to anon,authenticated using(true)',tab);
    execute format('grant select on public.%I to anon,authenticated',tab);
  end loop;
  foreach tab in array array['accessories_rows','size_set_rows','embellishment_send_receive_rows'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('grant select,insert on public.%I to authenticated',tab);
    execute format('create policy existing_admin_stage on public.%I for insert to authenticated with check (
      exists(select 1 from public.site_users where auth_user_id=auth.uid() and role=''admin'' and status=''active''))',tab);
  end loop;
end $$;
create policy existing_accessories_read on public.accessories_rows for select to authenticated using (
  public.current_site_can('slide_18') and (is_active or uploaded_by=auth.uid()));
create policy existing_size_set_read on public.size_set_rows for select to authenticated using (
  public.current_site_can('slide_17') and (is_active or uploaded_by=auth.uid()));
create policy existing_embellishment_read on public.embellishment_send_receive_rows for select to authenticated using (
  public.current_site_can('slide_19') and (is_active or uploaded_by=auth.uid()));
grant usage,select on all sequences in schema public to authenticated;
