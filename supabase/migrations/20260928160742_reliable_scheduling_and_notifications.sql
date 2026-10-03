begin;
-- Existing professionals keep the existing all-services/shop-hours behavior until configured.
create table public.staff_service_rules (
 barbershop_id uuid not null, barber_id uuid not null, service_id uuid not null, enabled boolean not null,
 primary key(barbershop_id,barber_id,service_id),
 foreign key(barbershop_id,barber_id) references public.memberships(barbershop_id,user_id),
 foreign key(barbershop_id,service_id) references public.services(barbershop_id,id)
);
create table public.staff_hours (
 barbershop_id uuid not null, barber_id uuid not null, weekday int not null check(weekday between 0 and 6),
 opens_at time not null, closes_at time not null check(closes_at>opens_at),
 primary key(barbershop_id,barber_id,weekday,opens_at),
 foreign key(barbershop_id,barber_id) references public.memberships(barbershop_id,user_id)
);
create table public.staff_blocks (
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null, barber_id uuid not null,
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 foreign key(barbershop_id,barber_id) references public.memberships(barbershop_id,user_id)
);
create index staff_blocks_lookup on public.staff_blocks(barbershop_id,barber_id,starts_at);
alter table public.staff_service_rules enable row level security;
alter table public.staff_hours enable row level security;
alter table public.staff_blocks enable row level security;
create policy staff_rules_read on public.staff_service_rules for select to authenticated using(public.member_role(barbershop_id) is not null);
create policy staff_hours_read on public.staff_hours for select to authenticated using(public.member_role(barbershop_id)='OWNER' or (public.member_role(barbershop_id)='BARBER' and barber_id=auth.uid()));
create policy staff_blocks_read on public.staff_blocks for select to authenticated using(public.member_role(barbershop_id)='OWNER' or (public.member_role(barbershop_id)='BARBER' and barber_id=auth.uid()));
grant select on public.staff_service_rules,public.staff_hours,public.staff_blocks to authenticated;

create function fio_private.slot_fits(p_shop uuid,p_barber uuid,p_service uuid,p_start timestamptz,p_ignore uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
 select 1 from public.services s join public.barbershops b on b.id=s.barbershop_id
 join public.memberships m on m.barbershop_id=b.id and m.user_id=p_barber and m.active and m.role='BARBER'
 where s.id=p_service and s.barbershop_id=p_shop and s.active
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

-- Same RPC signature: NULL barber opts into deterministic assignment.
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
 and exists(select 1 from public.memberships m where m.barbershop_id=p_shop and m.role='BARBER' and m.active and (p_barber is null or m.user_id=p_barber) and fio_private.slot_fits(p_shop,m.user_id,p_service,slot)) order by slot;
end $$;

-- Preserve the existing subscription and audit implementation; expose only the guarded wrapper.
alter function public.book_appointment(uuid,uuid,uuid,uuid,timestamptz,boolean) rename to book_appointment_legacy;
alter function public.book_appointment_legacy(uuid,uuid,uuid,uuid,timestamptz,boolean) set schema fio_private;
revoke all on function fio_private.book_appointment_legacy(uuid,uuid,uuid,uuid,timestamptz,boolean) from public,anon,authenticated;
create function public.book_appointment(p_shop uuid,p_client uuid,p_barber uuid,p_service uuid,p_start timestamptz,p_use_subscription boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare chosen uuid; r text; zone text;
begin
 r:=public.member_role(p_shop);
 if r is null or (r='CLIENT' and not public.owns_customer(p_shop,p_client)) or (r='BARBER' and p_barber is distinct from auth.uid()) then raise exception 'FORBIDDEN';end if;
 if p_start<=now() or p_start>now()+interval '60 days' then raise exception 'INVALID_TIME';end if;
 -- All creation/rescheduling paths serialize by tenant, including client-overlap checks.
 perform pg_advisory_xact_lock(hashtextextended('booking:'||p_shop::text,0));
 select timezone into zone from public.barbershops where id=p_shop;
 select m.user_id into chosen from public.memberships m where m.barbershop_id=p_shop and m.role='BARBER' and m.active
 and (p_barber is null or m.user_id=p_barber) and fio_private.slot_fits(p_shop,m.user_id,p_service,p_start)
 order by (select coalesce(sum(extract(epoch from a.ends_at-a.starts_at)),0) from public.appointments a where a.barbershop_id=p_shop and a.barber_id=m.user_id and a.status not in ('cancelled','no_show') and (a.starts_at at time zone zone)::date=(p_start at time zone zone)::date),m.user_id limit 1;
 if chosen is null then raise exception 'SLOT_UNAVAILABLE';end if;
 return fio_private.book_appointment_legacy(p_shop,p_client,chosen,p_service,p_start,p_use_subscription);
end $$;
revoke all on function public.book_appointment(uuid,uuid,uuid,uuid,timestamptz,boolean) from public,anon;
grant execute on function public.book_appointment(uuid,uuid,uuid,uuid,timestamptz,boolean) to authenticated;

create function public.reschedule_appointment(p_shop uuid,p_id uuid,p_start timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare a public.appointments; r text; duration int;
begin
 r:=public.member_role(p_shop);if r is null then raise exception 'FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('booking:'||p_shop::text,0));
 select * into a from public.appointments where id=p_id and barbershop_id=p_shop for update;
 if a.id is null or (r='CLIENT' and not public.owns_customer(p_shop,a.client_id)) or (r='BARBER' and a.barber_id<>auth.uid()) then raise exception 'FORBIDDEN';end if;
 if a.status not in ('scheduled','confirmed') then raise exception 'INVALID_TRANSITION';end if;
 if r='CLIENT' and a.starts_at<now()+interval '2 hours' then raise exception 'CANCELLATION_WINDOW';end if;
 if p_start<=now() or p_start>now()+interval '60 days' then raise exception 'INVALID_TIME';end if;
 if not fio_private.slot_fits(p_shop,a.barber_id,a.service_id,p_start,a.id) then raise exception 'SLOT_UNAVAILABLE';end if;
 select duration_minutes into duration from public.services where id=a.service_id and barbershop_id=p_shop;
 if exists(select 1 from public.appointments x where x.barbershop_id=p_shop and x.client_id=a.client_id and x.id<>a.id and x.status not in ('cancelled','no_show') and x.starts_at<p_start+make_interval(mins=>duration) and x.ends_at>p_start) then raise exception 'CLIENT_ALREADY_BOOKED';end if;
 if a.subscription_id is not null and not exists(select 1 from public.client_subscriptions s where s.id=a.subscription_id and s.barbershop_id=p_shop and s.status='active' and s.expires_at>p_start and s.remaining_cuts>0) then raise exception 'NO_ACTIVE_SUBSCRIPTION';end if;
 update public.appointments set starts_at=p_start,ends_at=p_start+make_interval(mins=>duration) where id=a.id;
 insert into public.audit_events(barbershop_id,actor_id,action,target_id) values(p_shop,auth.uid(),'appointment.rescheduled',a.id);
end $$;
revoke all on function public.reschedule_appointment(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.reschedule_appointment(uuid,uuid,timestamptz) to authenticated;

create function public.appointment_period(p_shop uuid,p_from date,p_to date,p_barber uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare zone text; result jsonb;
begin
 if public.member_role(p_shop) is null then raise exception 'FORBIDDEN';end if;
 if p_to<p_from or p_to-p_from>92 then raise exception 'INVALID_DATA';end if;
 select timezone into zone from public.barbershops where id=p_shop;
 select jsonb_build_object('total',count(*),'completed',count(*) filter(where status='completed'),'cancelled',count(*) filter(where status='cancelled'),'noShow',count(*) filter(where status='no_show'),
 'items',coalesce((select jsonb_agg(x order by x.starts_at) from (select id,client_id,barber_id,service_id,starts_at,ends_at,status,price_cents,subscription_id from public.appointments where barbershop_id=p_shop and starts_at>=p_from::timestamp at time zone zone and starts_at<(p_to+1)::timestamp at time zone zone and (p_barber is null or barber_id=p_barber) order by starts_at limit 500) x),'[]'::jsonb)) into result
 from public.appointments where barbershop_id=p_shop and starts_at>=p_from::timestamp at time zone zone and starts_at<(p_to+1)::timestamp at time zone zone and (p_barber is null or barber_id=p_barber);
 return result;
end $$;
revoke all on function public.appointment_period(uuid,date,date,uuid) from public,anon;
grant execute on function public.appointment_period(uuid,date,date,uuid) to authenticated;

create function public.configure_staff_schedule(p_shop uuid,p_barber uuid,p_hours jsonb,p_disabled_services uuid[])
returns void language plpgsql security definer set search_path='' as $$
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from public.memberships where barbershop_id=p_shop and user_id=p_barber and role='BARBER' and active) then raise exception 'INVALID_BARBER';end if;
 if jsonb_typeof(p_hours) is distinct from 'array' or jsonb_array_length(p_hours)>28 then raise exception 'INVALID_DATA';end if;
 perform pg_advisory_xact_lock(hashtextextended('booking:'||p_shop::text,0));
 delete from public.staff_hours where barbershop_id=p_shop and barber_id=p_barber;
 insert into public.staff_hours select p_shop,p_barber,weekday,opens_at,closes_at from jsonb_to_recordset(p_hours) as h(weekday int,opens_at time,closes_at time);
 delete from public.staff_service_rules where barbershop_id=p_shop and barber_id=p_barber;
 insert into public.staff_service_rules select p_shop,p_barber,s,false from unnest(p_disabled_services) s;
end $$;
create function public.add_staff_block(p_shop uuid,p_barber uuid,p_start timestamptz,p_end timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from public.memberships where barbershop_id=p_shop and user_id=p_barber and active and role='BARBER') then raise exception 'INVALID_BARBER';end if;
 perform pg_advisory_xact_lock(hashtextextended('booking:'||p_shop::text,0));
 insert into public.staff_blocks(barbershop_id,barber_id,starts_at,ends_at) values(p_shop,p_barber,p_start,p_end) returning id into result;
 return result;
end $$;
create policy staff_block_delete on public.staff_blocks for delete to authenticated using(public.member_role(barbershop_id)='OWNER');
grant delete on public.staff_blocks to authenticated;
revoke all on function public.configure_staff_schedule(uuid,uuid,jsonb,uuid[]),public.add_staff_block(uuid,uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.configure_staff_schedule(uuid,uuid,jsonb,uuid[]),public.add_staff_block(uuid,uuid,timestamptz,timestamptz) to authenticated;

create table public.appointment_push_devices (
 id uuid primary key default gen_random_uuid(),barbershop_id uuid not null,user_id uuid not null,
 endpoint text not null check(length(endpoint)<=2048),keys jsonb not null,enabled boolean not null default true,
 changes boolean not null default true,reminders boolean not null default true,unique(barbershop_id,user_id,endpoint),
 foreign key(barbershop_id,user_id) references public.memberships(barbershop_id,user_id)
);
alter table public.appointment_push_devices enable row level security;
create policy own_push_device on public.appointment_push_devices for select to authenticated using(user_id=auth.uid() and public.member_role(barbershop_id) is not null);
-- Mutation goes through authenticated RPC; no browser can write an outbox.
grant select on public.appointment_push_devices to authenticated;
create table fio_private.appointment_push_queue (
 id uuid primary key default gen_random_uuid(),barbershop_id uuid not null,appointment_id uuid not null,user_id uuid not null,
 kind text not null,version timestamptz not null,due_at timestamptz not null default now(),
 unique(appointment_id,user_id,kind,version)
);
create table fio_private.appointment_push_deliveries (
 queue_id uuid not null references fio_private.appointment_push_queue(id),device_id uuid not null references public.appointment_push_devices(id),
 status text not null default 'pending',attempts int not null default 0,claimed_at timestamptz,primary key(queue_id,device_id)
);
alter table fio_private.appointment_push_queue enable row level security;
alter table fio_private.appointment_push_deliveries enable row level security;
create function public.register_appointment_push(p_shop uuid,p_endpoint text,p_keys jsonb,p_changes boolean,p_reminders boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if public.member_role(p_shop) is null then raise exception 'FORBIDDEN';end if;
 if p_endpoint !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-zA-Z0-9-]+[.]notify[.]windows[.]com)/' or length(p_endpoint)>2048 or coalesce(p_keys->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}={0,2}$' or coalesce(p_keys->>'auth','') !~ '^[A-Za-z0-9_-]{22}={0,2}$' then raise exception 'INVALID_DATA';end if;
 -- The same browser endpoint must not keep receiving the previous account's events.
 update public.appointment_push_devices set enabled=false where endpoint=p_endpoint and user_id<>auth.uid();
 insert into public.appointment_push_devices(barbershop_id,user_id,endpoint,keys,changes,reminders) values(p_shop,auth.uid(),p_endpoint,p_keys,p_changes,p_reminders)
 on conflict(barbershop_id,user_id,endpoint) do update set keys=excluded.keys,changes=excluded.changes,reminders=excluded.reminders,enabled=true;
end $$;
create function public.disable_appointment_push(p_shop uuid,p_endpoint text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if public.member_role(p_shop) is null then raise exception 'FORBIDDEN';end if;
 update public.appointment_push_devices set enabled=false where barbershop_id=p_shop and user_id=auth.uid() and endpoint=p_endpoint;
end $$;
revoke all on function public.register_appointment_push(uuid,text,jsonb,boolean,boolean),public.disable_appointment_push(uuid,text) from public,anon;
grant execute on function public.register_appointment_push(uuid,text,jsonb,boolean,boolean),public.disable_appointment_push(uuid,text) to authenticated;

alter table public.notifications add column appointment_id uuid;
create function fio_private.appointment_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; recipient record; stamp timestamptz:=clock_timestamp();
begin
 if tg_op='INSERT' then kind:='created';
 elsif new.starts_at is distinct from old.starts_at or new.barber_id is distinct from old.barber_id then kind:='rescheduled';
 elsif new.status is distinct from old.status then kind:=new.status;
 else return new;end if;
 for recipient in select distinct m.user_id from public.memberships m where m.barbershop_id=new.barbershop_id and m.active and
 (m.role='OWNER' or m.user_id=new.barber_id or (tg_op='UPDATE' and m.user_id=old.barber_id) or exists(select 1 from public.customers c where c.barbershop_id=new.barbershop_id and c.id=new.client_id and c.user_id=m.user_id)) loop
  insert into public.notifications(barbershop_id,user_id,title,body,appointment_id) values(new.barbershop_id,recipient.user_id,'Atualização na agenda',case kind when 'created' then 'Um agendamento foi criado.' when 'rescheduled' then 'Um agendamento foi remarcado.' when 'cancelled' then 'Um agendamento foi cancelado.' when 'confirmed' then 'Um agendamento foi confirmado.' else 'O status de um atendimento mudou.' end,new.id);
  insert into fio_private.appointment_push_queue(barbershop_id,appointment_id,user_id,kind,version) values(new.barbershop_id,new.id,recipient.user_id,kind,stamp) on conflict do nothing;
 end loop;
 return new;
end $$;
revoke all on function fio_private.appointment_notice() from public,anon,authenticated;
create trigger appointment_notice after insert or update of starts_at,barber_id,status on public.appointments for each row execute function fio_private.appointment_notice();

-- Worker functions: service_role only. Claims are leased; retries have a stable notification tag.
create function public.claim_appointment_push() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 delete from fio_private.appointment_push_deliveries where queue_id in(select id from fio_private.appointment_push_queue where due_at<now()-interval '7 days');
 delete from fio_private.appointment_push_queue where due_at<now()-interval '7 days';
 with added as (insert into fio_private.appointment_push_queue(barbershop_id,appointment_id,user_id,kind,version)
 select a.barbershop_id,a.id,m.user_id,'reminder',a.starts_at from public.appointments a join public.memberships m on m.barbershop_id=a.barbershop_id and m.active
 where a.status in ('scheduled','confirmed') and a.starts_at>now() and a.starts_at<=now()+interval '24 hours'
 and (m.user_id=a.barber_id or exists(select 1 from public.customers c where c.barbershop_id=a.barbershop_id and c.id=a.client_id and c.user_id=m.user_id)) on conflict do nothing returning *)
 insert into public.notifications(barbershop_id,user_id,title,body,appointment_id) select barbershop_id,user_id,'Lembrete de agendamento','Você tem um horário nas próximas 24 horas. Consulte a agenda.',appointment_id from added;
 insert into fio_private.appointment_push_deliveries(queue_id,device_id)
 select q.id,d.id from fio_private.appointment_push_queue q join public.appointment_push_devices d on d.barbershop_id=q.barbershop_id and d.user_id=q.user_id and d.enabled
 join public.memberships m on m.barbershop_id=d.barbershop_id and m.user_id=d.user_id and m.active
 join public.appointments a on a.id=q.appointment_id and a.barbershop_id=q.barbershop_id
 where q.due_at<=now() and q.due_at>now()-interval '1 day'
 and ((q.kind='reminder' and d.reminders and a.starts_at=q.version and a.starts_at>now() and a.status in ('scheduled','confirmed')) or (q.kind<>'reminder' and d.changes))
 on conflict do nothing;
 with candidates as (select d.queue_id,d.device_id from fio_private.appointment_push_deliveries d
 join fio_private.appointment_push_queue q on q.id=d.queue_id
 join public.appointment_push_devices v on v.id=d.device_id and v.enabled
 join public.memberships m on m.barbershop_id=v.barbershop_id and m.user_id=v.user_id and m.active
 join public.appointments a on a.id=q.appointment_id
 where d.attempts<3 and (d.status in ('pending','failed') or (d.status='sending' and d.claimed_at<now()-interval '5 minutes'))
 and (d.claimed_at is null or d.claimed_at<now()-interval '1 minute') and q.due_at>now()-interval '1 day'
 and ((q.kind='reminder' and v.reminders and a.starts_at=q.version and a.starts_at>now() and a.status in ('scheduled','confirmed')) or (q.kind<>'reminder' and v.changes))
 order by q.due_at limit 100 for update of d skip locked), claimed as (
 update fio_private.appointment_push_deliveries d set status='sending',attempts=attempts+1,claimed_at=clock_timestamp() from candidates c where d.queue_id=c.queue_id and d.device_id=c.device_id returning d.*)
 select coalesce(jsonb_agg(jsonb_build_object('queueId',c.queue_id,'deviceId',c.device_id,'endpoint',v.endpoint,'keys',v.keys,'tag','fio-appointment-'||q.appointment_id::text,'url','/'||lower(m.role)||'/agenda?appointment='||q.appointment_id::text||'&shopId='||q.barbershop_id::text,'kind',q.kind)),'[]'::jsonb) into result
 from claimed c join fio_private.appointment_push_queue q on q.id=c.queue_id join public.appointment_push_devices v on v.id=c.device_id join public.memberships m on m.user_id=v.user_id and m.barbershop_id=v.barbershop_id;
 return result;
end $$;
create function public.finish_appointment_push(p_queue uuid,p_device uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('sent','failed','expired') then raise exception 'INVALID_DATA';end if;
 update fio_private.appointment_push_deliveries set status=p_status where queue_id=p_queue and device_id=p_device;
 if p_status='expired' then update public.appointment_push_devices set enabled=false where id=p_device;end if;
end $$;
revoke all on function public.claim_appointment_push(),public.finish_appointment_push(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_appointment_push(),public.finish_appointment_push(uuid,uuid,text) to service_role;
commit;
