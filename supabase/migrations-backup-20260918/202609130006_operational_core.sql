-- Operational hardening: richer appointment lifecycle, explicit subscription consumption,
-- payment semantics, plan catalog and financial summary.

alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check check (status in ('scheduled','confirmed','in_service','completed','cancelled','no_show'));
alter table public.client_subscriptions add constraint client_subscriptions_shop_id_unique unique(barbershop_id,id);
alter table public.appointments add column if not exists subscription_id uuid;
alter table public.appointments add constraint appointments_subscription_fk foreign key(barbershop_id,subscription_id) references public.client_subscriptions(barbershop_id,id);
alter table public.appointments add column if not exists payment_method text not null default 'pending' check (payment_method in ('pending','cash','pix','card','subscription','other'));
alter table public.appointments add column if not exists completed_at timestamptz;
alter table public.appointments add column if not exists cancelled_at timestamptz;

create table if not exists public.subscription_plans(
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 name text not null check(length(name) between 2 and 100), cuts integer not null check(cuts between 1 and 1000),
 validity_days integer not null check(validity_days between 1 and 730), price_cents integer not null default 0 check(price_cents>=0),
 active boolean not null default true, created_at timestamptz not null default now(), unique(barbershop_id,id)
);
alter table public.subscription_plans enable row level security;
create policy subscription_plans_select on public.subscription_plans for select to authenticated using(public.member_role(barbershop_id) is not null);
create policy subscription_plans_owner on public.subscription_plans for all to authenticated using(public.member_role(barbershop_id)='OWNER') with check(public.member_role(barbershop_id)='OWNER');
grant select on public.subscription_plans to authenticated;
grant insert(barbershop_id,name,cuts,validity_days,price_cents,active),update(name,cuts,validity_days,price_cents,active) on public.subscription_plans to authenticated;

alter table public.client_subscriptions add column if not exists plan_id uuid;
alter table public.client_subscriptions add constraint client_subscriptions_plan_fk foreign key(barbershop_id,plan_id) references public.subscription_plans(barbershop_id,id);
alter table public.client_subscriptions add column if not exists initial_cuts integer;
alter table public.client_subscriptions add column if not exists price_cents integer not null default 0;
alter table public.client_subscriptions add column if not exists cancelled_at timestamptz;
update public.client_subscriptions set initial_cuts=remaining_cuts where initial_cuts is null;
alter table public.client_subscriptions alter column initial_cuts set not null;

create table if not exists public.subscription_usage(
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 subscription_id uuid not null,
 appointment_id uuid not null,
 foreign key(barbershop_id,subscription_id) references public.client_subscriptions(barbershop_id,id) on delete restrict,
 foreign key(barbershop_id,appointment_id) references public.appointments(barbershop_id,id) on delete restrict,
 used_at timestamptz not null default now(), unique(appointment_id)
);
alter table public.subscription_usage enable row level security;
create policy subscription_usage_select on public.subscription_usage for select to authenticated using(public.member_role(barbershop_id) is not null);
grant select on public.subscription_usage to authenticated;

-- Replace booking with an explicit subscription choice. A subscription is locked and validated server-side.
drop function if exists public.book_appointment(uuid,uuid,uuid,uuid,timestamptz);
create function public.book_appointment(p_shop uuid,p_client uuid,p_barber uuid,p_service uuid,p_start timestamptz,p_use_subscription boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare r text; svc public.services; finish timestamptz; zone text; local_start timestamp; booking uuid; sub_id uuid;
begin
 r := public.member_role(p_shop);
 if r is null or (r='CLIENT' and not public.owns_customer(p_shop,p_client)) or (r='BARBER' and p_barber<>auth.uid()) then raise exception 'FORBIDDEN'; end if;
 if not exists(select 1 from public.memberships where barbershop_id=p_shop and user_id=p_barber and role='BARBER' and active) then raise exception 'INVALID_BARBER'; end if;
 select * into svc from public.services where barbershop_id=p_shop and id=p_service and active;
 if svc.id is null then raise exception 'INVALID_SERVICE'; end if;
 if p_start<now() or p_start>now()+interval '60 days' then raise exception 'INVALID_TIME'; end if;
 select timezone into zone from public.barbershops where id=p_shop;
 local_start := p_start at time zone zone; finish := p_start+make_interval(mins=>svc.duration_minutes);
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

-- Explicit state machine. Subscription is consumed exactly once only on completion.
drop function if exists public.transition_appointment(uuid,uuid,text);
create function public.transition_appointment(p_shop uuid,p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare a public.appointments; r text; sub public.client_subscriptions;
begin
 r := public.member_role(p_shop);
 select * into a from public.appointments where barbershop_id=p_shop and id=p_id for update;
 if a.id is null or r is null or (r='BARBER' and a.barber_id<>auth.uid()) or (r='CLIENT' and (not public.owns_customer(p_shop,a.client_id) or p_status<>'cancelled')) then raise exception 'FORBIDDEN'; end if;
 if r='CLIENT' and a.starts_at<now()+interval '2 hours' then raise exception 'CANCELLATION_WINDOW'; end if;
 if p_status='cancelled' and a.status in ('scheduled','confirmed') then
   update public.appointments set status='cancelled',cancelled_at=now() where id=p_id;
 elsif p_status='confirmed' and a.status='scheduled' and r in ('OWNER','BARBER') then
   update public.appointments set status='confirmed' where id=p_id;
 elsif p_status='in_service' and a.status in ('scheduled','confirmed') and r in ('OWNER','BARBER') then
   if a.starts_at>now()+interval '30 minutes' then raise exception 'TOO_EARLY'; end if;
   update public.appointments set status='in_service' where id=p_id;
 elsif p_status='completed' and a.status='in_service' and r in ('OWNER','BARBER') then
   if a.subscription_id is not null then
     select * into sub from public.client_subscriptions where id=a.subscription_id and barbershop_id=p_shop for update;
     if sub.id is null or sub.status<>'active' or sub.expires_at<a.starts_at or sub.remaining_cuts<=0 then raise exception 'SUBSCRIPTION_UNAVAILABLE'; end if;
     insert into public.subscription_usage(barbershop_id,subscription_id,appointment_id) values(p_shop,sub.id,p_id) on conflict(appointment_id) do nothing;
     if found then update public.client_subscriptions set remaining_cuts=remaining_cuts-1 where id=sub.id; end if;
   end if;
   update public.appointments set status='completed',completed_at=now() where id=p_id;
 elsif p_status='no_show' and a.status in ('scheduled','confirmed') and r in ('OWNER','BARBER') then
   if a.starts_at>now() then raise exception 'TOO_EARLY'; end if;
   update public.appointments set status='no_show' where id=p_id;
 else raise exception 'INVALID_TRANSITION'; end if;
 insert into public.audit_events(barbershop_id,actor_id,action,target_id) values(p_shop,auth.uid(),'appointment.'||p_status,p_id);
end $$;

-- Subscription-covered appointments cannot also be recorded as an avulso payment.
drop function if exists public.record_payment(uuid,uuid);
create function public.record_payment(p_shop uuid,p_appointment uuid,p_method text default 'pix') returns void language plpgsql security definer set search_path='' as $$
declare a public.appointments;
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 if p_method not in ('cash','pix','card','other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
 select * into a from public.appointments where barbershop_id=p_shop and id=p_appointment and status='completed' for update;
 if a.id is null then raise exception 'INVALID_APPOINTMENT'; end if;
 if a.subscription_id is not null or a.payment_method='subscription' then raise exception 'SUBSCRIPTION_COVERED'; end if;
 insert into public.payments(barbershop_id,appointment_id,amount_cents) values(p_shop,a.id,a.price_cents);
 update public.appointments set payment_method=p_method where id=a.id;
 insert into public.audit_events(barbershop_id,actor_id,action,target_id) values(p_shop,auth.uid(),'payment.recorded',p_appointment);
end $$;

create or replace function public.issue_subscription(p_shop uuid,p_client uuid,p_name text,p_cuts integer,p_expires timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare sub uuid;
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 if p_expires<=now() or p_cuts<1 then raise exception 'INVALID_SUBSCRIPTION'; end if;
 if not exists(select 1 from public.customers where id=p_client and barbershop_id=p_shop) then raise exception 'INVALID_CLIENT'; end if;
 insert into public.client_subscriptions(barbershop_id,client_id,name,remaining_cuts,initial_cuts,expires_at) values(p_shop,p_client,p_name,p_cuts,p_cuts,p_expires) returning id into sub;
 return sub;
end $$;

create or replace function public.issue_subscription_from_plan(p_shop uuid,p_client uuid,p_plan uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare plan public.subscription_plans; sub uuid;
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 select * into plan from public.subscription_plans where id=p_plan and barbershop_id=p_shop and active;
 if plan.id is null then raise exception 'INVALID_PLAN'; end if;
 if not exists(select 1 from public.customers where id=p_client and barbershop_id=p_shop) then raise exception 'INVALID_CLIENT'; end if;
 insert into public.client_subscriptions(barbershop_id,client_id,plan_id,name,remaining_cuts,initial_cuts,price_cents,expires_at)
 values(p_shop,p_client,plan.id,plan.name,plan.cuts,plan.cuts,plan.price_cents,now()+make_interval(days=>plan.validity_days)) returning id into sub;
 return sub;
end $$;

create or replace function public.cancel_subscription(p_shop uuid,p_subscription uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 update public.client_subscriptions set status='cancelled',cancelled_at=now() where id=p_subscription and barbershop_id=p_shop and status='active';
 if not found then raise exception 'INVALID_SUBSCRIPTION'; end if;
end $$;

revoke execute on function public.book_appointment(uuid,uuid,uuid,uuid,timestamptz,boolean),public.transition_appointment(uuid,uuid,text),public.record_payment(uuid,uuid,text),public.issue_subscription_from_plan(uuid,uuid,uuid),public.cancel_subscription(uuid,uuid) from public,anon;
grant execute on function public.book_appointment(uuid,uuid,uuid,uuid,timestamptz,boolean),public.transition_appointment(uuid,uuid,text),public.record_payment(uuid,uuid,text),public.issue_subscription_from_plan(uuid,uuid,uuid),public.cancel_subscription(uuid,uuid) to authenticated;
