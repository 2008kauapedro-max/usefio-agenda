-- FIO: tenant boundaries are enforced in PostgreSQL, independently of the UI.
create table public.barbershops (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 100),
 slug text not null unique check(slug ~ '^[a-z0-9-]{3,60}$'), timezone text not null default 'America/Sao_Paulo',
 created_at timestamptz not null default now()
);
create table public.memberships (
 barbershop_id uuid not null references public.barbershops(id), user_id uuid not null references auth.users(id),
 role text not null check(role in ('OWNER','BARBER','CLIENT')), display_name text not null check(length(display_name) between 2 and 100),
 active boolean not null default true, primary key(barbershop_id,user_id)
);
create table public.plan_features (
 plan text primary key check(plan in ('FREE','PRO','PREMIUM')), ai_enabled boolean not null,
 ai_daily_limit integer not null check(ai_daily_limit >= 0), ai_per_minute integer not null check(ai_per_minute > 0)
);
insert into public.plan_features values ('FREE',false,0,5),('PRO',true,100,10),('PREMIUM',true,500,20);
create table public.saas_subscriptions (
 barbershop_id uuid primary key references public.barbershops(id), plan text not null default 'FREE' references public.plan_features(plan),
 status text not null default 'active' check(status in ('active','inactive')), expires_at timestamptz
);
create table public.services (
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null references public.barbershops(id),
 name text not null check(length(name) between 2 and 100), duration_minutes integer not null check(duration_minutes between 10 and 240),
 price_cents integer not null check(price_cents between 0 and 1000000), active boolean not null default true,
 unique(barbershop_id,id)
);
create table public.customers (
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null references public.barbershops(id),
 user_id uuid references auth.users(id), name text not null check(length(name) between 2 and 100),
 created_at timestamptz not null default now(), unique(barbershop_id,id), unique(barbershop_id,user_id)
);
create table public.business_hours (
 barbershop_id uuid not null references public.barbershops(id), weekday integer not null check(weekday between 0 and 6),
 opens_at time not null, closes_at time not null, check(closes_at > opens_at), primary key(barbershop_id,weekday)
);
create table public.appointments (
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null references public.barbershops(id),
 client_id uuid not null, barber_id uuid not null, service_id uuid not null,
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at > starts_at),
 price_cents integer not null check(price_cents >= 0), status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(barbershop_id,client_id) references public.customers(barbershop_id,id),
 foreign key(barbershop_id,barber_id) references public.memberships(barbershop_id,user_id),
 foreign key(barbershop_id,service_id) references public.services(barbershop_id,id), unique(barbershop_id,id)
);
create index appointments_calendar on public.appointments(barbershop_id,barber_id,starts_at) where status <> 'cancelled';
create index appointments_client on public.appointments(barbershop_id,client_id,starts_at);
create table public.client_subscriptions (
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null references public.barbershops(id), client_id uuid not null,
 name text not null check(length(name) between 2 and 100), remaining_cuts integer not null check(remaining_cuts between 0 and 1000),
 expires_at timestamptz not null, status text not null default 'active' check(status in ('active','cancelled')),
 foreign key(barbershop_id,client_id) references public.customers(barbershop_id,id)
);
create unique index one_active_subscription on public.client_subscriptions(barbershop_id,client_id) where status = 'active';
create table public.payments (
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null references public.barbershops(id), appointment_id uuid not null unique,
 amount_cents integer not null check(amount_cents > 0), created_at timestamptz not null default now(),
 foreign key(barbershop_id,appointment_id) references public.appointments(barbershop_id,id)
);
create table public.invitations (
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null references public.barbershops(id),
 token uuid not null unique default gen_random_uuid(), role text not null check(role in ('BARBER','CLIENT')),
 created_by uuid not null references auth.users(id), expires_at timestamptz not null default now() + interval '48 hours', used_at timestamptz
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null references public.barbershops(id),
 actor_id uuid not null references auth.users(id), action text not null, target_id uuid, created_at timestamptz not null default now()
);

create function public.member_role(shop uuid) returns text language sql stable security definer set search_path = '' as $$
 select role from public.memberships where barbershop_id=shop and user_id=auth.uid() and active;
$$;
create function public.owns_customer(shop uuid, customer uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.customers where barbershop_id=shop and id=customer and user_id=auth.uid());
$$;
create function public.barber_knows_customer(shop uuid, customer uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.appointments where barbershop_id=shop and client_id=customer and barber_id=auth.uid());
$$;

alter table public.barbershops enable row level security;
alter table public.memberships enable row level security;
alter table public.plan_features enable row level security;
alter table public.saas_subscriptions enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.business_hours enable row level security;
alter table public.appointments enable row level security;
alter table public.client_subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_events enable row level security;

create policy shop_read on public.barbershops for select to authenticated using(public.member_role(id) is not null);
create policy memberships_read on public.memberships for select to authenticated using(public.member_role(barbershop_id) is not null and (user_id=auth.uid() or role='BARBER' or public.member_role(barbershop_id)='OWNER'));
create policy features_read on public.plan_features for select to authenticated using(true);
create policy saas_read on public.saas_subscriptions for select to authenticated using(public.member_role(barbershop_id) is not null);
create policy services_read on public.services for select to authenticated using(public.member_role(barbershop_id) is not null);
create policy services_insert on public.services for insert to authenticated with check(public.member_role(barbershop_id)='OWNER');
create policy services_update on public.services for update to authenticated using(public.member_role(barbershop_id)='OWNER') with check(public.member_role(barbershop_id)='OWNER');
create policy customers_read on public.customers for select to authenticated using(public.member_role(barbershop_id)='OWNER' or (public.member_role(barbershop_id)='CLIENT' and user_id=auth.uid()) or (public.member_role(barbershop_id)='BARBER' and public.barber_knows_customer(barbershop_id,id)));
create policy customers_insert on public.customers for insert to authenticated with check(public.member_role(barbershop_id)='OWNER' and user_id is null);
create policy hours_read on public.business_hours for select to authenticated using(public.member_role(barbershop_id) is not null);
create policy hours_write on public.business_hours for all to authenticated using(public.member_role(barbershop_id)='OWNER') with check(public.member_role(barbershop_id)='OWNER');
create policy appointments_read on public.appointments for select to authenticated using(public.member_role(barbershop_id)='OWNER' or (public.member_role(barbershop_id)='BARBER' and barber_id=auth.uid()) or (public.member_role(barbershop_id)='CLIENT' and public.owns_customer(barbershop_id,client_id)));
create policy subscriptions_read on public.client_subscriptions for select to authenticated using(public.member_role(barbershop_id)='OWNER' or (public.member_role(barbershop_id)='CLIENT' and public.owns_customer(barbershop_id,client_id)));
create policy payments_read on public.payments for select to authenticated using(public.member_role(barbershop_id)='OWNER');
create policy invitations_read on public.invitations for select to authenticated using(public.member_role(barbershop_id)='OWNER');
create policy audit_read on public.audit_events for select to authenticated using(public.member_role(barbershop_id)='OWNER');

-- Explicit grants: writes of roles, billing, appointment snapshots and audit are RPC-only.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.barbershops,public.memberships,public.plan_features,public.saas_subscriptions,public.services,public.customers,public.business_hours,public.appointments,public.client_subscriptions,public.payments,public.invitations,public.audit_events to authenticated;
grant insert(barbershop_id,name,duration_minutes,price_cents) on public.services to authenticated;
grant update(name,duration_minutes,price_cents,active) on public.services to authenticated;
grant insert(barbershop_id,name) on public.customers to authenticated;
grant insert,update,delete on public.business_hours to authenticated;

create function public.create_barbershop(p_name text,p_slug text,p_display_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare shop uuid;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from public.memberships where user_id=auth.uid() and role='OWNER') then raise exception 'OWNER_SHOP_LIMIT'; end if;
 insert into public.barbershops(name,slug) values(p_name,lower(p_slug)) returning id into shop;
 insert into public.memberships values(shop,auth.uid(),'OWNER',p_display_name,true);
 insert into public.saas_subscriptions(barbershop_id) values(shop);
 insert into public.business_hours select shop,n,'09:00'::time,'19:00'::time from generate_series(1,6) n;
 return shop;
end $$;

create function public.join_barbershop(p_slug text,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare shop uuid;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select id into shop from public.barbershops where slug=p_slug;
 if shop is null then raise exception 'SHOP_NOT_FOUND'; end if;
 insert into public.memberships values(shop,auth.uid(),'CLIENT',p_name,true);
 insert into public.customers(barbershop_id,user_id,name) values(shop,auth.uid(),p_name);
 return shop;
end $$;

create function public.create_invitation(p_shop uuid,p_role text) returns uuid language plpgsql security definer set search_path='' as $$
declare invite uuid;
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 insert into public.invitations(barbershop_id,role,created_by) values(p_shop,p_role,auth.uid()) returning token into invite;
 insert into public.audit_events(barbershop_id,actor_id,action) values(p_shop,auth.uid(),'invitation.created');
 return invite;
end $$;
create function public.accept_invitation(p_token uuid,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare invite public.invitations;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into invite from public.invitations where token=p_token and used_at is null and expires_at>now() for update;
 if invite.id is null then raise exception 'INVALID_INVITATION'; end if;
 insert into public.memberships values(invite.barbershop_id,auth.uid(),invite.role,p_name,true);
 if invite.role='CLIENT' then insert into public.customers(barbershop_id,user_id,name) values(invite.barbershop_id,auth.uid(),p_name); end if;
 update public.invitations set used_at=now() where id=invite.id;
 return invite.barbershop_id;
end $$;

create function public.book_appointment(p_shop uuid,p_client uuid,p_barber uuid,p_service uuid,p_start timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare r text; svc public.services; finish timestamptz; zone text; local_start timestamp; booking uuid;
begin
 r := public.member_role(p_shop);
 if r is null or (r='CLIENT' and not public.owns_customer(p_shop,p_client)) or (r='BARBER' and p_barber<>auth.uid()) then raise exception 'FORBIDDEN'; end if;
 if not exists(select 1 from public.memberships where barbershop_id=p_shop and user_id=p_barber and role='BARBER' and active) then raise exception 'INVALID_BARBER'; end if;
 select * into svc from public.services where barbershop_id=p_shop and id=p_service and active;
 if svc.id is null then raise exception 'INVALID_SERVICE'; end if;
 if p_start<now() or p_start>now()+interval '60 days' then raise exception 'INVALID_TIME'; end if;
 select timezone into zone from public.barbershops where id=p_shop;
 local_start := p_start at time zone zone;
 finish := p_start+make_interval(mins=>svc.duration_minutes);
 if not exists(select 1 from public.business_hours where barbershop_id=p_shop and weekday=extract(dow from local_start) and local_start::time>=opens_at and (finish at time zone zone)::date=local_start::date and (finish at time zone zone)::time<=closes_at) then raise exception 'OUTSIDE_BUSINESS_HOURS'; end if;
 -- Serialize all mutations of one barber calendar. No direct INSERT grant exists.
 perform pg_advisory_xact_lock(hashtextextended(p_shop::text||p_barber::text,0));
 if exists(select 1 from public.appointments where barbershop_id=p_shop and barber_id=p_barber and status<>'cancelled' and starts_at<finish and ends_at>p_start) then raise exception 'SLOT_UNAVAILABLE'; end if;
 insert into public.appointments(barbershop_id,client_id,barber_id,service_id,starts_at,ends_at,price_cents,created_by)
 values(p_shop,p_client,p_barber,p_service,p_start,finish,svc.price_cents,auth.uid()) returning id into booking;
 insert into public.audit_events(barbershop_id,actor_id,action,target_id) values(p_shop,auth.uid(),'appointment.created',booking);
 return booking;
end $$;

create function public.available_slots(p_shop uuid,p_barber uuid,p_service uuid,p_day date) returns table(starts_at timestamptz) language plpgsql stable security definer set search_path='' as $$
declare duration integer; zone text;
begin
 if public.member_role(p_shop) is null then raise exception 'FORBIDDEN'; end if;
 if p_day<current_date-1 or p_day>current_date+61 then raise exception 'INVALID_TIME'; end if;
 select duration_minutes into duration from public.services where id=p_service and barbershop_id=p_shop and active;
 if duration is null or not exists(select 1 from public.memberships where barbershop_id=p_shop and user_id=p_barber and role='BARBER' and active) then raise exception 'INVALID_SERVICE_OR_BARBER'; end if;
 select timezone into zone from public.barbershops where id=p_shop;
 return query select slot from public.business_hours h,
 lateral generate_series((p_day+h.opens_at) at time zone zone,((p_day+h.closes_at) at time zone zone)-make_interval(mins=>duration),interval '15 minutes') slot
 where h.barbershop_id=p_shop and h.weekday=extract(dow from p_day) and slot>now() and slot<=now()+interval '60 days'
 and not exists(select 1 from public.appointments a where a.barbershop_id=p_shop and a.barber_id=p_barber and a.status<>'cancelled' and a.starts_at<slot+make_interval(mins=>duration) and a.ends_at>slot);
end $$;

create function public.transition_appointment(p_shop uuid,p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare a public.appointments; r text;
begin
 r := public.member_role(p_shop);
 select * into a from public.appointments where barbershop_id=p_shop and id=p_id for update;
 if a.id is null or r is null or (r='BARBER' and a.barber_id<>auth.uid()) or (r='CLIENT' and (not public.owns_customer(p_shop,a.client_id) or p_status<>'cancelled')) then raise exception 'FORBIDDEN'; end if;
 if a.status<>'scheduled' or p_status not in ('completed','cancelled') then raise exception 'INVALID_TRANSITION'; end if;
 if r='CLIENT' and a.starts_at<now()+interval '2 hours' then raise exception 'CANCELLATION_WINDOW'; end if;
 if p_status='completed' and a.starts_at>now() then raise exception 'TOO_EARLY'; end if;
 update public.appointments set status=p_status where id=p_id;
 if p_status='completed' then
  update public.client_subscriptions set remaining_cuts=remaining_cuts-1 where barbershop_id=p_shop and client_id=a.client_id and status='active' and expires_at>now() and remaining_cuts>0;
 end if;
 insert into public.audit_events(barbershop_id,actor_id,action,target_id) values(p_shop,auth.uid(),'appointment.'||p_status,p_id);
end $$;

create function public.record_payment(p_shop uuid,p_appointment uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 if not exists(select 1 from public.appointments where barbershop_id=p_shop and id=p_appointment and status='completed') then raise exception 'INVALID_APPOINTMENT'; end if;
 insert into public.payments(barbershop_id,appointment_id,amount_cents) select p_shop,id,price_cents from public.appointments where barbershop_id=p_shop and id=p_appointment;
 insert into public.audit_events(barbershop_id,actor_id,action,target_id) values(p_shop,auth.uid(),'payment.recorded',p_appointment);
end $$;
create function public.issue_subscription(p_shop uuid,p_client uuid,p_name text,p_cuts integer,p_expires timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare sub uuid;
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 if p_expires<=now() then raise exception 'INVALID_TIME'; end if;
 insert into public.client_subscriptions(barbershop_id,client_id,name,remaining_cuts,expires_at) values(p_shop,p_client,p_name,p_cuts,p_expires) returning id into sub;
 insert into public.audit_events(barbershop_id,actor_id,action,target_id) values(p_shop,auth.uid(),'subscription.issued',sub);
 return sub;
end $$;

-- PostgreSQL grants EXECUTE to PUBLIC by default; revoke it explicitly.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.member_role(uuid),public.owns_customer(uuid,uuid),public.barber_knows_customer(uuid,uuid),public.create_barbershop(text,text,text),public.join_barbershop(text,text),public.create_invitation(uuid,text),public.accept_invitation(uuid,text),public.book_appointment(uuid,uuid,uuid,uuid,timestamptz),public.available_slots(uuid,uuid,uuid,date),public.transition_appointment(uuid,uuid,text),public.record_payment(uuid,uuid),public.issue_subscription(uuid,uuid,text,integer,timestamptz) to authenticated;
