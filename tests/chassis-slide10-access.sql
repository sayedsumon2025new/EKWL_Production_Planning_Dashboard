-- Transactional live RLS regression; restores every temporary fixture change.
-- Requires an existing Auth-linked admin; never creates or sends an Auth account.
begin;
select set_config('request.jwt.claim.sub', (select auth_user_id::text from public.site_users where role='admin' and auth_user_id is not null limit 1), true);
select set_config('ekwl.test.chassis_rows', (select count(*)::text from public.slide4_chassis_strength), true);
do $$ begin
  if auth.uid() is null then raise exception 'Auth-linked admin fixture required'; end if;
  if current_setting('ekwl.test.chassis_rows')::int=0 then raise exception 'Nonempty chassis table required'; end if;
end $$;

update public.site_users set role='user', status='active', permissions='{"slide_10": true}'::jsonb where auth_user_id=auth.uid();
set local role authenticated;
do $$ begin
  if (select count(*) from public.slide4_chassis_strength) <> current_setting('ekwl.test.chassis_rows')::int then raise exception 'slide10 chassis RLS failed'; end if;
end $$;
reset role;

update public.site_users set role='user', status='active', permissions='{}'::jsonb where auth_user_id=auth.uid();
set local role authenticated;
do $$ begin
  if (select count(*) from public.slide4_chassis_strength) <> 0 then raise exception 'denied chassis RLS failed'; end if;
end $$;
reset role;

update public.site_users set role='user', status='disabled', permissions='{"slide_10": true}'::jsonb where auth_user_id=auth.uid();
set local role authenticated;
do $$ begin
  if (select count(*) from public.slide4_chassis_strength) <> 0 then raise exception 'disabled chassis RLS failed'; end if;
end $$;
reset role;

update public.site_users set role='admin', status='active', permissions='{}'::jsonb where auth_user_id=auth.uid();
set local role authenticated;
do $$ begin
  if (select count(*) from public.slide4_chassis_strength) <> current_setting('ekwl.test.chassis_rows')::int then raise exception 'admin chassis RLS failed'; end if;
end $$;
reset role;

update public.site_users set role='user', status='active', permissions='{"slide_4": true}'::jsonb where auth_user_id=auth.uid();
set local role authenticated;
do $$ begin
  if (select count(*) from public.slide4_chassis_strength) <> current_setting('ekwl.test.chassis_rows')::int then raise exception 'legacy4 chassis RLS failed'; end if;
end $$;
reset role;

update public.site_users set role='user', status='active', permissions='{"admin_settings": true}'::jsonb where auth_user_id=auth.uid();
set local role authenticated;
do $$ begin
  if (select count(*) from public.slide4_chassis_strength) <> current_setting('ekwl.test.chassis_rows')::int then raise exception 'settings chassis RLS failed'; end if;
end $$;
reset role;

set local role anon;
do $$ begin
  if has_table_privilege(current_user,'public.slide4_chassis_strength','SELECT') then
    if (select count(*) from public.slide4_chassis_strength) <> 0 then raise exception 'Anonymous chassis rows exposed'; end if;
  end if;
end $$;
reset role;
rollback;
select 'PASS: slide10, denied, disabled, admin, legacy4, settings and anon RLS; all fixture changes rolled back' as result;
