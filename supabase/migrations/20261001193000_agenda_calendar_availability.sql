begin;

-- ============================================================
-- HORÁRIOS DISPONÍVEIS
-- Somente inícios em hora cheia no fuso da barbearia.
-- A duração real do serviço continua sendo respeitada.
-- ============================================================

create or replace function public.available_slots(
 p_shop uuid,
 p_barber uuid,
 p_service uuid,
 p_day date
)
returns table(starts_at timestamptz)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
 zone text;
 duration int;
 r text;
begin

 r:=public.member_role(p_shop);

 if r is null then
  raise exception 'FORBIDDEN';
 end if;

 if
  r='BARBER'
  and p_barber is distinct from auth.uid()
 then
  raise exception 'FORBIDDEN';
 end if;

 select timezone
 into zone
 from public.barbershops
 where id=p_shop;

 select duration_minutes
 into duration
 from public.services
 where
  id=p_service
  and barbershop_id=p_shop
  and active;

 if duration is null then
  raise exception 'INVALID_SERVICE';
 end if;

 if
  p_day<(now() at time zone zone)::date
  or
  p_day>(now() at time zone zone)::date+60
 then
  raise exception 'INVALID_TIME';
 end if;

 return query

 select distinct slot

 from public.business_hours h,

 lateral generate_series(

  (
   date_trunc(
    'hour',
    p_day+h.opens_at
   )
   +
   case
    when
     extract(minute from h.opens_at)=0
     and extract(second from h.opens_at)=0
    then interval '0 minutes'
    else interval '1 hour'
   end
  ) at time zone zone,

  (
   (p_day+h.closes_at) at time zone zone
  )
  -
  make_interval(mins=>duration),

  interval '1 hour'

 ) as slot

 where
  h.barbershop_id=p_shop

  and h.weekday=extract(dow from p_day)

  and exists(

   select 1

   from public.memberships m

   join public.barbershops b
    on b.id=m.barbershop_id

   where
    m.barbershop_id=p_shop
    and m.active

    and (
     m.role='BARBER'
     or (
      m.role='OWNER'
      and b.operation_mode='SOLO'
     )
    )

    and (
     p_barber is null
     or m.user_id=p_barber
    )

    and fio_private.slot_fits(
     p_shop,
     m.user_id,
     p_service,
     slot
    )

  )

 order by slot;

end $$;

revoke all
on function public.available_slots(uuid,uuid,uuid,date)
from public,anon;

grant execute
on function public.available_slots(uuid,uuid,uuid,date)
to authenticated;


-- ============================================================
-- DISPONIBILIDADE DO MÊS
-- Usada pelas bolinhas verdes/vermelhas do calendário.
-- ============================================================

create or replace function public.available_days(
 p_shop uuid,
 p_barber uuid,
 p_service uuid,
 p_month date
)
returns table(
 day date,
 available_count bigint
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
 zone text;
 first_day date;
 last_day date;
 today_local date;
begin

 if public.member_role(p_shop) is null then
  raise exception 'FORBIDDEN';
 end if;

 if
  public.member_role(p_shop)='BARBER'
  and p_barber is distinct from auth.uid()
 then
  raise exception 'FORBIDDEN';
 end if;

 select timezone
 into zone
 from public.barbershops
 where id=p_shop;

 if zone is null then
  raise exception 'INVALID_SHOP';
 end if;

 first_day:=
  date_trunc('month',p_month)::date;

 last_day:=
  (
   first_day+
   interval '1 month - 1 day'
  )::date;

 today_local:=
  (now() at time zone zone)::date;

 if
  first_day >
  date_trunc(
   'month',
   today_local+interval '60 days'
  )::date
 then
  raise exception 'INVALID_TIME';
 end if;

 return query

 select
  d::date,
  count(s.starts_at)::bigint

 from generate_series(
  greatest(first_day,today_local),
  least(last_day,today_local+60),
  interval '1 day'
 ) d

 left join lateral
  public.available_slots(
   p_shop,
   p_barber,
   p_service,
   d::date
  ) s
 on true

 group by d::date

 order by d::date;

end $$;

revoke all
on function public.available_days(uuid,uuid,uuid,date)
from public,anon;

grant execute
on function public.available_days(uuid,uuid,uuid,date)
to authenticated;


-- ============================================================
-- NOVO AGENDAMENTO
-- Mantém "sem preferência", isolamento, carga e duração.
-- Horário escolhido pelo usuário precisa começar em HH:00.
-- ============================================================

create or replace function public.book_appointment(
 p_shop uuid,
 p_client uuid,
 p_barber uuid,
 p_service uuid,
 p_start timestamptz,
 p_use_subscription boolean default false
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
 chosen uuid;
 r text;
 zone text;
begin

 r:=public.member_role(p_shop);

 if
  r is null
  or (
   r='CLIENT'
   and not public.owns_customer(p_shop,p_client)
  )
  or (
   r='BARBER'
   and p_barber is distinct from auth.uid()
  )
 then
  raise exception 'FORBIDDEN';
 end if;

 if
  p_start<=now()
  or p_start>now()+interval '60 days'
 then
  raise exception 'INVALID_TIME';
 end if;

 perform pg_advisory_xact_lock(
  hashtextextended(
   'booking:'||p_shop::text,
   0
  )
 );

 select timezone
 into zone
 from public.barbershops
 where id=p_shop;

 if zone is null then
  raise exception 'INVALID_SHOP';
 end if;

 select m.user_id
 into chosen

 from public.memberships m

 join public.barbershops b
  on b.id=m.barbershop_id

 where
  m.barbershop_id=p_shop
  and m.active

  and (
   m.role='BARBER'
   or (
    m.role='OWNER'
    and b.operation_mode='SOLO'
   )
  )

  and (
   p_barber is null
   or m.user_id=p_barber
  )

  and fio_private.slot_fits(
   p_shop,
   m.user_id,
   p_service,
   p_start
  )

 order by

  (
   select coalesce(
    sum(
     extract(
      epoch from a.ends_at-a.starts_at
     )
    ),
    0
   )

   from public.appointments a

   where
    a.barbershop_id=p_shop
    and a.barber_id=m.user_id
    and a.status not in ('cancelled','no_show')
    and
    (
     a.starts_at at time zone zone
    )::date
    =
    (
     p_start at time zone zone
    )::date
  ),

  m.user_id

 limit 1;

 if chosen is null then
  raise exception 'SLOT_UNAVAILABLE';
 end if;

 -- Depois de validar disponibilidade:
 -- novos horários precisam iniciar exatamente em hora cheia.
 if
  extract(
   minute from
   (p_start at time zone zone)
  )<>0
  or
  extract(
   second from
   (p_start at time zone zone)
  )<>0
 then
  raise exception 'FULL_HOUR_REQUIRED';
 end if;

 return fio_private.book_appointment_legacy(
  p_shop,
  p_client,
  chosen,
  p_service,
  p_start,
  p_use_subscription
 );

end $$;

revoke all
on function public.book_appointment(
 uuid,uuid,uuid,uuid,timestamptz,boolean
)
from public,anon;

grant execute
on function public.book_appointment(
 uuid,uuid,uuid,uuid,timestamptz,boolean
)
to authenticated;


-- ============================================================
-- REMARCAÇÃO
-- Também precisa ser HH:00, sem alterar horários antigos.
-- ============================================================

create or replace function public.reschedule_appointment(
 p_shop uuid,
 p_id uuid,
 p_start timestamptz
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
 a public.appointments;
 r text;
 duration int;
 zone text;
begin

 r:=public.member_role(p_shop);

 if r is null then
  raise exception 'FORBIDDEN';
 end if;

 perform pg_advisory_xact_lock(
  hashtextextended(
   'booking:'||p_shop::text,
   0
  )
 );

 select *
 into a
 from public.appointments
 where
  id=p_id
  and barbershop_id=p_shop
 for update;

 if
  a.id is null
  or (
   r='CLIENT'
   and not public.owns_customer(
    p_shop,
    a.client_id
   )
  )
  or (
   r='BARBER'
   and a.barber_id<>auth.uid()
  )
 then
  raise exception 'FORBIDDEN';
 end if;

 if
  a.status not in (
   'scheduled',
   'confirmed'
  )
 then
  raise exception 'INVALID_TRANSITION';
 end if;

 if
  r='CLIENT'
  and a.starts_at<now()+interval '2 hours'
 then
  raise exception 'CANCELLATION_WINDOW';
 end if;

 if
  p_start<=now()
  or p_start>now()+interval '60 days'
 then
  raise exception 'INVALID_TIME';
 end if;

 if not fio_private.slot_fits(
  p_shop,
  a.barber_id,
  a.service_id,
  p_start,
  a.id
 )
 then
  raise exception 'SLOT_UNAVAILABLE';
 end if;

 select timezone
 into zone
 from public.barbershops
 where id=p_shop;

 if zone is null then
  raise exception 'INVALID_SHOP';
 end if;

 if
  extract(
   minute from
   (p_start at time zone zone)
  )<>0
  or
  extract(
   second from
   (p_start at time zone zone)
  )<>0
 then
  raise exception 'FULL_HOUR_REQUIRED';
 end if;

 select duration_minutes
 into duration
 from public.services
 where
  id=a.service_id
  and barbershop_id=p_shop;

 if exists(

  select 1

  from public.appointments x

  where
   x.barbershop_id=p_shop
   and x.client_id=a.client_id
   and x.id<>a.id
   and x.status not in (
    'cancelled',
    'no_show'
   )

   and x.starts_at<
    p_start+
    make_interval(mins=>duration)

   and x.ends_at>p_start

 )
 then
  raise exception 'CLIENT_ALREADY_BOOKED';
 end if;

 if
  a.subscription_id is not null

  and not exists(

   select 1

   from public.client_subscriptions s

   where
    s.id=a.subscription_id
    and s.barbershop_id=p_shop
    and s.status='active'
    and s.expires_at>p_start
    and s.remaining_cuts>0

  )
 then
  raise exception 'NO_ACTIVE_SUBSCRIPTION';
 end if;

 update public.appointments

 set
  starts_at=p_start,
  ends_at=
   p_start+
   make_interval(mins=>duration)

 where id=a.id;

 insert into public.audit_events(
  barbershop_id,
  actor_id,
  action,
  target_id
 )
 values(
  p_shop,
  auth.uid(),
  'appointment.rescheduled',
  a.id
 );

end $$;

revoke all
on function public.reschedule_appointment(
 uuid,uuid,timestamptz
)
from public,anon;

grant execute
on function public.reschedule_appointment(
 uuid,uuid,timestamptz
)
to authenticated;

commit;