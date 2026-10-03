begin;

alter table public.barbershops
 add column if not exists operation_mode text not null default 'SHOP';

do $$ begin
 alter table public.barbershops add constraint barbershops_operation_mode_check check(operation_mode in ('SHOP','SOLO'));
exception when duplicate_object then null;
end $$;

create or replace function public.create_workspace(
 p_name text,
 p_slug text,
 p_display_name text,
 p_operation_mode text default 'SHOP'
) returns uuid language plpgsql security definer set search_path='' as $$
declare shop uuid;
begin
 if p_operation_mode not in ('SHOP','SOLO') then raise exception 'INVALID_OPERATION_MODE'; end if;
 shop:=public.create_barbershop(p_name,p_slug,p_display_name);
 update public.barbershops set operation_mode=p_operation_mode where id=shop;
 return shop;
end $$;
revoke all on function public.create_workspace(text,text,text,text) from public,anon;
grant execute on function public.create_workspace(text,text,text,text) to authenticated;

create or replace function fio_private.is_provider(p_shop uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1
  from public.memberships m
  join public.barbershops b on b.id=m.barbershop_id
  where m.barbershop_id=p_shop and m.user_id=p_user and m.active
   and (m.role='BARBER' or (m.role='OWNER' and b.operation_mode='SOLO'))
 );
$$;
revoke all on function fio_private.is_provider(uuid,uuid) from public,anon,authenticated;

create or replace function fio_private.slot_fits(p_shop uuid,p_barber uuid,p_service uuid,p_start timestamptz,p_ignore uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
 select 1 from public.services s join public.barbershops b on b.id=s.barbershop_id
 where s.id=p_service and s.barbershop_id=p_shop and s.active
 and fio_private.is_provider(p_shop,p_barber)
 and p_start>now() and p_start<=now()+interval '60 days'
 and not exists(select 1 from public.staff_service_rules r where r.barbershop_id=p_shop and r.barber_id=p_barber and r.service_id=p_service and not r.enabled)
 and exists(select 1 from public.business_hours h where h.barbershop_id=p_shop and h.weekday=extract(dow from p_start at time zone b.timezone)
  and (p_start at time zone b.timezone)::time>=h.opens_at
  and ((p_start+make_interval(mins=>s.duration_minutes)) at time zone b.timezone)::date=(p_start at time zone b.timezone)::date
  and ((p_start+make_interval(mins=>s.duration_minutes)) at time zone b.timezone)::time<=h.closes_at)
 and (not exists(select 1 from public.staff_hours h where h.barbershop_id=p_shop and h.barber_id=p_barber)
  or exists(select 1 from public.staff_hours h where h.barbershop_id=p_shop and h.barber_id=p_barber
   and h.weekday=extract(dow from p_start at time zone b.timezone) and (p_start at time zone b.timezone)::time>=h.opens_at
   and ((p_start+make_interval(mins=>s.duration_minutes)) at time zone b.timezone)::time<=h.closes_at))
 and not exists(select 1 from public.staff_blocks x where x.barbershop_id=p_shop and x.barber_id=p_barber and x.starts_at<p_start+make_interval(mins=>s.duration_minutes) and x.ends_at>p_start)
 and not exists(select 1 from public.appointments a where a.barbershop_id=p_shop and a.barber_id=p_barber and a.id is distinct from p_ignore and a.status not in ('cancelled','no_show') and a.starts_at<p_start+make_interval(mins=>s.duration_minutes) and a.ends_at>p_start)
 );
$$;
revoke all on function fio_private.slot_fits(uuid,uuid,uuid,timestamptz,uuid) from public,anon,authenticated;

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
 return query select distinct slot from public.business_hours h,
 lateral generate_series((p_day+h.opens_at) at time zone zone,((p_day+h.closes_at) at time zone zone)-make_interval(mins=>duration),interval '15 minutes') slot
 where h.barbershop_id=p_shop and h.weekday=extract(dow from p_day)
 and exists(
  select 1 from public.memberships m join public.barbershops b on b.id=m.barbershop_id
  where m.barbershop_id=p_shop and m.active
   and (m.role='BARBER' or (m.role='OWNER' and b.operation_mode='SOLO'))
   and (p_barber is null or m.user_id=p_barber)
   and fio_private.slot_fits(p_shop,m.user_id,p_service,slot)
 ) order by slot;
end $$;

create or replace function fio_private.book_appointment_legacy(p_shop uuid,p_client uuid,p_barber uuid,p_service uuid,p_start timestamptz,p_use_subscription boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare r text; svc public.services; finish timestamptz; zone text; local_start timestamp; booking uuid; sub_id uuid;
begin
 r := public.member_role(p_shop);
 if r is null or (r='CLIENT' and not public.owns_customer(p_shop,p_client)) or (r='BARBER' and p_barber<>auth.uid()) then raise exception 'FORBIDDEN'; end if;
 if not fio_private.is_provider(p_shop,p_barber) then raise exception 'INVALID_BARBER'; end if;
 select * into svc from public.services where barbershop_id=p_shop and id=p_service and active;
 if svc.id is null then raise exception 'INVALID_SERVICE'; end if;
 if p_start<now() or p_start>now()+interval '60 days' then raise exception 'INVALID_TIME'; end if;
 select timezone into zone from public.barbershops where id=p_shop;
 local_start := p_start at time zone zone;
 finish := p_start+make_interval(mins=>svc.duration_minutes);
 if not exists(select 1 from public.business_hours where barbershop_id=p_shop and weekday=extract(dow from local_start) and local_start::time>=opens_at and (finish at time zone zone)::date=local_start::date and (finish at time zone zone)::time<=closes_at) then raise exception 'OUTSIDE_BUSINESS_HOURS'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_shop::text||p_barber::text,0));
 if exists(select 1 from public.appointments where barbershop_id=p_shop and barber_id=p_barber and status not in ('cancelled','no_show') and starts_at<finish and ends_at>p_start) then raise exception 'SLOT_UNAVAILABLE'; end if;
 if exists(select 1 from public.appointments where barbershop_id=p_shop and client_id=p_client and status not in ('cancelled','no_show') and starts_at<finish and ends_at>p_start) then raise exception 'CLIENT_ALREADY_BOOKED'; end if;
 if p_use_subscription then
  select id into sub_id from public.client_subscriptions where barbershop_id=p_shop and client_id=p_client and status='active' and expires_at>p_start and remaining_cuts>0 order by expires_at,id limit 1 for update;
  if sub_id is null then raise exception 'NO_ACTIVE_SUBSCRIPTION'; end if;
 end if;
 insert into public.appointments(barbershop_id,client_id,barber_id,service_id,starts_at,ends_at,price_cents,created_by,subscription_id,payment_method)
 values(p_shop,p_client,p_barber,p_service,p_start,finish,svc.price_cents,auth.uid(),sub_id,case when sub_id is null then 'pending' else 'subscription' end) returning id into booking;
 insert into public.audit_events(barbershop_id,actor_id,action,target_id) values(p_shop,auth.uid(),'appointment.created',booking);
 return booking;
end $$;
revoke all on function fio_private.book_appointment_legacy(uuid,uuid,uuid,uuid,timestamptz,boolean) from public,anon,authenticated;

create or replace function public.book_appointment(p_shop uuid,p_client uuid,p_barber uuid,p_service uuid,p_start timestamptz,p_use_subscription boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare chosen uuid; r text; zone text;
begin
 r:=public.member_role(p_shop);
 if r is null or (r='CLIENT' and not public.owns_customer(p_shop,p_client)) or (r='BARBER' and p_barber is distinct from auth.uid()) then raise exception 'FORBIDDEN';end if;
 if p_start<=now() or p_start>now()+interval '60 days' then raise exception 'INVALID_TIME';end if;
 perform pg_advisory_xact_lock(hashtextextended('booking:'||p_shop::text,0));
 select timezone into zone from public.barbershops where id=p_shop;
 select m.user_id into chosen
 from public.memberships m join public.barbershops b on b.id=m.barbershop_id
 where m.barbershop_id=p_shop and m.active
  and (m.role='BARBER' or (m.role='OWNER' and b.operation_mode='SOLO'))
  and (p_barber is null or m.user_id=p_barber)
  and fio_private.slot_fits(p_shop,m.user_id,p_service,p_start)
 order by (select coalesce(sum(extract(epoch from a.ends_at-a.starts_at)),0) from public.appointments a where a.barbershop_id=p_shop and a.barber_id=m.user_id and a.status not in ('cancelled','no_show') and (a.starts_at at time zone zone)::date=(p_start at time zone zone)::date),m.user_id limit 1;
 if chosen is null then raise exception 'SLOT_UNAVAILABLE';end if;
 return fio_private.book_appointment_legacy(p_shop,p_client,chosen,p_service,p_start,p_use_subscription);
end $$;
revoke all on function public.book_appointment(uuid,uuid,uuid,uuid,timestamptz,boolean) from public,anon;
grant execute on function public.book_appointment(uuid,uuid,uuid,uuid,timestamptz,boolean) to authenticated;

commit;
