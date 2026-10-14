-- Calendar dates retain their written date, without timezone conversion.
create or replace function public.dashboard_parse_date(v text,date_order text default 'auto')
returns date language plpgsql immutable security invoker set search_path=pg_catalog
as $$
declare
  raw text:=btrim(v); p text[]; y integer; m integer; d integer; a integer; b integer; serial integer;
  names text[]:=array['january','february','march','april','may','june','july','august','september','october','november','december'];
  month_name text;
begin
  if raw is null or raw='' or date_order is null or date_order not in ('auto','dmy','mdy','excel') then return null; end if;
  if date_order='excel' then
    if raw !~ '^[0-9]+(\.[0-9]+)?$' or floor(raw::numeric) not between 1 and 2958465 then return null; end if;
    serial:=floor(raw::numeric)::integer;
    if serial=60 then return null; end if; -- Excel's fictional 1900-02-29.
    return date '1899-12-31'+serial-case when serial>60 then 1 else 0 end;
  end if;
  p:=regexp_match(raw,'^([0-9]{4})([-/.])([0-9]{1,2})\2([0-9]{1,2})$');
  if p is not null then y:=p[1]::integer; m:=p[3]::integer; d:=p[4]::integer;
  else
    p:=regexp_match(raw,'^([0-9]{4})([0-9]{2})([0-9]{2})$');
    if p is not null then y:=p[1]::integer; m:=p[2]::integer; d:=p[3]::integer;
    else
      p:=regexp_match(raw,'^([0-9]{4})-([0-9]{2})-([0-9]{2})[T ]([01][0-9]|2[0-3]):([0-5][0-9])(:([0-5][0-9])(\.[0-9]{1,6})?)?(Z|[+-](0[0-9]|1[0-4]):[0-5][0-9])?$');
      if p is not null then
        y:=p[1]::integer; m:=p[2]::integer; d:=p[3]::integer;
        if p[9] ~ '^[+-]14:' and right(p[9],3)<>':00' then return null; end if;
      else
        p:=regexp_match(raw,'^([0-9]{1,2})[-/ .]([A-Za-z]+)[-/ ,]+([0-9]{2}|[0-9]{4})$');
        if p is not null then d:=p[1]::integer; month_name:=lower(p[2]); y:=case when length(p[3])=2 then 2000 else 0 end+p[3]::integer;
        else
          p:=regexp_match(raw,'^([A-Za-z]+)[-/ .]([0-9]{1,2})[-/ ,]+([0-9]{2}|[0-9]{4})$');
          if p is not null then month_name:=lower(p[1]); d:=p[2]::integer; y:=case when length(p[3])=2 then 2000 else 0 end+p[3]::integer;
          else
            p:=regexp_match(raw,'^([0-9]{1,2})([-/.])([0-9]{1,2})\2([0-9]{2}|[0-9]{4})$');
            if p is null then return null; end if;
            a:=p[1]::integer; b:=p[3]::integer; y:=case when length(p[4])=2 then 2000 else 0 end+p[4]::integer;
            if date_order='dmy' or date_order='auto' and a>12 then d:=a; m:=b;
            elsif date_order='mdy' or date_order='auto' and b>12 then m:=a; d:=b;
            elsif a=b then m:=a; d:=b;
            else return null; end if;
          end if;
        end if;
        if month_name is not null then
          select n into m from generate_subscripts(names,1) n where names[n]=month_name or left(names[n],3)=month_name;
          if m is null then return null; end if;
        end if;
      end if;
    end if;
  end if;
  if y not between 1 and 9999 then return null; end if;
  return make_date(y,m,d);
exception when datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then return null;
end;
$$;
revoke all on function public.dashboard_parse_date(text,text) from public,anon;
grant execute on function public.dashboard_parse_date(text,text) to authenticated;

-- Preserve the existing view dependency and function privileges.
create or replace function public.ewo_readiness_date(v text)
returns date language sql immutable security invoker set search_path=pg_catalog
as $$ select public.dashboard_parse_date(v,'auto') $$;
