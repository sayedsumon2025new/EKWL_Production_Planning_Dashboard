-- Chassis Analysis is logical Slide 10; keep legacy Slide 04 read compatibility.
alter policy slide4_chassis_strength_read
on public.slide4_chassis_strength
to authenticated
using (
  exists (
    select 1 from public.site_users u
    where u.auth_user_id = (select auth.uid())
      and lower(u.status::text) = 'active'
      and (
        lower(u.role::text) = 'admin'
        or coalesce(u.permissions ->> 'slide_4', 'false') = 'true'
        or coalesce(u.permissions ->> 'slide_10', 'false') = 'true'
        or coalesce(u.permissions ->> 'admin_settings', 'false') = 'true'
      )
  )
);
