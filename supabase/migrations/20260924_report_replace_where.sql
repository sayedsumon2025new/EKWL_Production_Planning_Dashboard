-- Keep explicit full-report replacement compatible with safeupdate.
-- Authorization, RLS and transaction rollback remain enforced.
begin;
do $fix$
declare def text;
begin
 select pg_get_functiondef('public.ekwl_save_report(text,jsonb,boolean)'::regprocedure) into def;
 if position('delete from public.%I where true' in def)=0 then
  if position('delete from public.%I' in def)=0 then
   raise exception 'Unexpected ekwl_save_report definition; inspect before patching';
  end if;
  def:=replace(def,'''delete from public.%I''','''delete from public.%I where true''');
  if position('delete from public.%I where true' in def)=0 then raise exception 'Replacement failed'; end if;
  execute def;
 end if;
end;
$fix$;
commit;
