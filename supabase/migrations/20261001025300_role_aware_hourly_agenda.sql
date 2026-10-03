begin;

-- O cliente escolhe horários em passos de uma hora. As mesmas regras continuam
-- valendo para dono, barbeiro, barbeiro solo, expediente, bloqueios e duração.
create or replace function public.available_slots(p_shop uuid,p_barber uuid,p_service uuid,p_day date)
returns table(starts_at timestamptz) language plpgsql stable security definer set search_path='' as $$
declare zone text; duration int; r text;
begin
 r:=public.member_role(p_shop);if r is null then raise exception 'FORBIDDEN';end if;
 if r='BARBER' and p_barber is distinct from auth.uid() then raise exception 'FORBIDDEN';end if;
 select timezone into zone from public.barbershops where id=p_shop;
 select duration_minutes into duration from public.services where id=p_service and barbershop_id=p_shop and active;
 if duration is null then raise exception 'INVALID_SERVICE';end if;
 if p_day<(now() at time zone zone)::date or p_day>(now() at time zone zone)::date+60 then raise exception 'INVALID_TIME';end if;
 return query
 select distinct slot
 from public.business_hours h,
 lateral generate_series(
  (p_day+h.opens_at) at time zone zone,
  ((p_day+h.closes_at) at time zone zone)-make_interval(mins=>duration),
  interval '1 hour'
 ) slot
 where h.barbershop_id=p_shop
  and h.weekday=extract(dow from p_day)
  and exists(
   select 1
   from public.memberships m
   join public.barbershops b on b.id=m.barbershop_id
   where m.barbershop_id=p_shop
    and m.active
    and (m.role='BARBER' or (m.role='OWNER' and b.operation_mode='SOLO'))
    and (p_barber is null or m.user_id=p_barber)
    and fio_private.slot_fits(p_shop,m.user_id,p_service,slot)
  )
 order by slot;
end $$;

revoke all on function public.available_slots(uuid,uuid,uuid,date) from public,anon;
grant execute on function public.available_slots(uuid,uuid,uuid,date) to authenticated;

commit;
