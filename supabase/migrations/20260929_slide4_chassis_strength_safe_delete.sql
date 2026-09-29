-- Supabase's authenticated RPC sessions require DELETE statements with a WHERE clause.
-- The table check constraint keeps every sort_order between 1 and 100.
do $$
declare v_ddl text;
begin
  v_ddl := pg_get_functiondef('public.replace_slide4_chassis_strength(jsonb)'::regprocedure);
  if position('delete from public.slide4_chassis_strength where sort_order between 1 and 100;' in v_ddl)>0 then
    return;
  end if;
  if position('delete from public.slide4_chassis_strength;' in v_ddl)=0 then
    raise exception 'Expected original DELETE statement not found; function was not changed';
  end if;
  v_ddl := replace(v_ddl, 'delete from public.slide4_chassis_strength;',
    'delete from public.slide4_chassis_strength where sort_order between 1 and 100;');
  execute v_ddl;
end $$;
