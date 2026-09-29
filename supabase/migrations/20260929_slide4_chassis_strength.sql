-- Slide 04 only: editable chassis HW Line Strength master.
-- Apply this migration in the existing EKWL Supabase project before publishing the UI.
begin;

create table if not exists public.slide4_chassis_strength (
  id bigint generated always as identity primary key,
  item_name text not null check (length(btrim(item_name)) between 1 and 80),
  line_strength numeric(10,1) not null check (line_strength >= 0 and line_strength <= 9999),
  sort_order integer not null check (sort_order between 1 and 100),
  updated_at timestamptz not null default now()
);
create unique index if not exists slide4_chassis_strength_name_unique
  on public.slide4_chassis_strength (lower(btrim(item_name)));
create unique index if not exists slide4_chassis_strength_order_unique
  on public.slide4_chassis_strength (sort_order);

insert into public.slide4_chassis_strength (item_name,line_strength,sort_order)
select seed.item_name,seed.line_strength,seed.sort_order
from (values
  ('T-Shirt',12.0,1),('Hoody/Jacket',13.0,2),('Sweat Shirt',3.0,3),
  ('Polo',12.0,4),('TOP''s',1.0,5),('Bottom',6.0,6)
) as seed(item_name,line_strength,sort_order)
where not exists (select 1 from public.slide4_chassis_strength);

alter table public.slide4_chassis_strength enable row level security;
revoke all on public.slide4_chassis_strength from public,anon,authenticated;
grant select on public.slide4_chassis_strength to authenticated;

drop policy if exists slide4_chassis_strength_read on public.slide4_chassis_strength;
create policy slide4_chassis_strength_read on public.slide4_chassis_strength
for select to authenticated using (
  exists (select 1 from public.site_users u
    where u.auth_user_id=auth.uid() and lower(u.status::text)='active'
      and (lower(u.role::text)='admin'
        or coalesce(u.permissions ->> 'slide_4','false')='true'
        or coalesce(u.permissions ->> 'admin_settings','false')='true'))
);

create or replace function public.replace_slide4_chassis_strength(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_count integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.site_users u
    where u.auth_user_id=auth.uid() and lower(u.status::text)='active'
      and (lower(u.role::text)='admin'
        or coalesce(u.permissions ->> 'admin_settings','false')='true')
  ) then
    raise exception 'Active Admin / Parameter Settings permission required' using errcode='42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array'
     or jsonb_array_length(p_rows) not between 1 and 100 then
    raise exception 'Provide 1 to 100 chassis rows';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where coalesce(jsonb_typeof(r->'item_name')<>'string',true)
      or coalesce(length(btrim(r->>'item_name')) not between 1 and 80,true)
      or lower(btrim(r->>'item_name'))='unmapped'
      or coalesce(jsonb_typeof(r->'line_strength')<>'number',true)
      or coalesce((r->>'line_strength')::numeric not between 0 and 9999,true)
  ) then
    raise exception 'Each row needs an item name and a strength from 0 to 9999';
  end if;
  select count(*) into v_count
  from (select lower(btrim(r->>'item_name')) as name from jsonb_array_elements(p_rows) r
        group by lower(btrim(r->>'item_name')) having count(*)>1) duplicate;
  if v_count>0 then raise exception 'Duplicate chassis item name'; end if;

  perform pg_advisory_xact_lock(hashtext('public.slide4_chassis_strength'));
  -- Every stored row has sort_order 1..100. Keep a WHERE clause for
  -- Supabase's safe-update protection on authenticated RPC requests.
  delete from public.slide4_chassis_strength where sort_order between 1 and 100;
  insert into public.slide4_chassis_strength (item_name,line_strength,sort_order,updated_at)
  select btrim(r.value->>'item_name'),(r.value->>'line_strength')::numeric,
         r.ordinality::integer,now()
    from jsonb_array_elements(p_rows) with ordinality as r(value,ordinality);
  return jsonb_build_object('status','SUCCESS','row_count',jsonb_array_length(p_rows));
end;
$$;
revoke all on function public.replace_slide4_chassis_strength(jsonb) from public,anon;
grant execute on function public.replace_slide4_chassis_strength(jsonb) to authenticated;

commit;
