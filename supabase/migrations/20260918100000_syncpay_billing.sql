-- SyncPay recurring billing for FIO SaaS plans.
-- Sensitive provider credentials and subscriber documents never live in PostgreSQL.

create table public.syncpay_plan_mappings (
 id uuid primary key default gen_random_uuid(),
 plan_code text not null references public.plan_features(plan) check(plan_code in ('PRO','PREMIUM')),
 billing_cycle text not null check(billing_cycle in ('weekly','monthly','annual')),
 amount_cents integer not null check(amount_cents > 0),
 periodicity_days integer not null check(periodicity_days > 0),
 billing_method text not null check(billing_method in ('qr_code','pix_automatico','credit_card')),
 provider_plan_token text not null unique check(length(provider_plan_token) between 8 and 200),
 checkout_url text,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(plan_code,billing_cycle,billing_method,amount_cents)
);


create table public.syncpay_enrollment_intents (
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 provider_plan_token text not null check(length(provider_plan_token) between 8 and 200),
 plan_code text not null references public.plan_features(plan) check(plan_code in ('PRO','PREMIUM')),
 billing_cycle text not null check(billing_cycle in ('weekly','monthly','annual')),
 amount_cents integer not null check(amount_cents > 0),
 actor_user_id uuid not null references auth.users(id),
 state text not null default 'creating' check(state in ('creating','uncertain','linked','failed')),
 provider_subscription_token text check(provider_subscription_token is null or length(provider_subscription_token) between 8 and 200),
 last_error_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index one_open_syncpay_enrollment on public.syncpay_enrollment_intents(barbershop_id) where state in ('creating','uncertain');
create index syncpay_enrollment_time on public.syncpay_enrollment_intents(created_at desc);

create table public.saas_provider_subscriptions (
 id uuid primary key default gen_random_uuid(),
 provider text not null default 'syncpay' check(provider='syncpay'),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 provider_subscription_token text not null unique check(length(provider_subscription_token) between 8 and 200),
 provider_plan_token text not null check(length(provider_plan_token) between 8 and 200),
 plan_code text not null references public.plan_features(plan) check(plan_code in ('PRO','PREMIUM')),
 billing_cycle text not null check(billing_cycle in ('weekly','monthly','annual')),
 amount_cents integer not null check(amount_cents > 0),
 provider_status text not null check(provider_status in ('pending_first_payment','active','overdue','suspended','cancelled')),
 is_current boolean not null default true,
 terms_accepted_by uuid not null references auth.users(id),
 terms_accepted_at timestamptz not null default now(),
 terms_version text not null check(length(terms_version) between 3 and 80),
 started_at timestamptz,
 last_event_at timestamptz,
 cancelled_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index one_current_syncpay_subscription on public.saas_provider_subscriptions(barbershop_id) where provider='syncpay' and is_current;
create index syncpay_subscription_status on public.saas_provider_subscriptions(provider_status,last_event_at desc);

create table public.syncpay_webhook_events (
 event_key text primary key check(length(event_key) between 16 and 128),
 event_name text not null check(length(event_name) between 1 and 80),
 subscription_token text not null check(length(subscription_token) between 8 and 200),
 occurred_at timestamptz not null,
 body_sha256 text not null check(body_sha256 ~ '^[0-9a-f]{64}$'),
 result text not null default 'received' check(result in ('received','applied','duplicate','stale','historical')),
 processed_at timestamptz not null default now()
);
create index syncpay_webhook_time on public.syncpay_webhook_events(occurred_at desc);

alter table public.syncpay_plan_mappings enable row level security;
alter table public.syncpay_enrollment_intents enable row level security;
alter table public.saas_provider_subscriptions enable row level security;
alter table public.syncpay_webhook_events enable row level security;
revoke all on public.syncpay_plan_mappings,public.syncpay_enrollment_intents,public.saas_provider_subscriptions,public.syncpay_webhook_events from public,anon,authenticated;
grant all on public.syncpay_plan_mappings,public.syncpay_enrollment_intents,public.saas_provider_subscriptions,public.syncpay_webhook_events to service_role;


create or replace function public.begin_syncpay_enrollment(
 p_shop uuid,p_provider_plan_token text,p_actor uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.syncpay_plan_mappings; existing public.syncpay_enrollment_intents; new_id uuid;
begin
 select * into m from public.syncpay_plan_mappings where provider_plan_token=p_provider_plan_token and active for share;
 if not found then raise exception 'SYNCPAY_PLAN_UNKNOWN'; end if;
 if not exists(select 1 from public.memberships where barbershop_id=p_shop and user_id=p_actor and role='OWNER' and active) then raise exception 'FORBIDDEN'; end if;
 select * into existing from public.syncpay_enrollment_intents
 where barbershop_id=p_shop and state in ('creating','uncertain')
 order by created_at desc limit 1 for update;
 if found then
  return jsonb_build_object(
   'id',existing.id,'state',existing.state,'provider_subscription_token',existing.provider_subscription_token,
   'same_offer',existing.provider_plan_token=m.provider_plan_token,'created',false
  );
 end if;
 insert into public.syncpay_enrollment_intents(barbershop_id,provider_plan_token,plan_code,billing_cycle,amount_cents,actor_user_id)
 values(p_shop,m.provider_plan_token,m.plan_code,m.billing_cycle,m.amount_cents,p_actor) returning id into new_id;
 return jsonb_build_object('id',new_id,'state','creating','provider_subscription_token',null,'same_offer',true,'created',true);
end $$;
revoke all on function public.begin_syncpay_enrollment(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.begin_syncpay_enrollment(uuid,text,uuid) to service_role;

create or replace function public.bind_syncpay_subscription(
 p_shop uuid,p_subscription_token text,p_provider_plan_token text,p_actor uuid,p_terms_version text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare m public.syncpay_plan_mappings; new_id uuid;
begin
 select * into m from public.syncpay_plan_mappings where provider_plan_token=p_provider_plan_token and active for share;
 if not found then raise exception 'SYNCPAY_PLAN_UNKNOWN'; end if;
 if not exists(select 1 from public.memberships where barbershop_id=p_shop and user_id=p_actor and role='OWNER' and active) then raise exception 'FORBIDDEN'; end if;
 update public.saas_provider_subscriptions set is_current=false,updated_at=now()
 where provider='syncpay' and barbershop_id=p_shop and is_current;
 insert into public.saas_provider_subscriptions(
  barbershop_id,provider_subscription_token,provider_plan_token,plan_code,billing_cycle,amount_cents,provider_status,is_current,terms_accepted_by,terms_version
 ) values(
  p_shop,p_subscription_token,p_provider_plan_token,m.plan_code,m.billing_cycle,m.amount_cents,'pending_first_payment',true,p_actor,p_terms_version
 ) returning id into new_id;
 return new_id;
end $$;
revoke all on function public.bind_syncpay_subscription(uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.bind_syncpay_subscription(uuid,text,text,uuid,text) to service_role;

create or replace function public.apply_syncpay_subscription_state(
 p_event_key text,p_event_name text,p_occurred_at timestamptz,p_body_sha256 text,
 p_subscription_token text,p_provider_status text,p_plan_token text,p_started_at timestamptz,p_access_until timestamptz
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link public.saas_provider_subscriptions; m public.syncpay_plan_mappings; fio_status text;
begin
 if p_provider_status not in ('pending_first_payment','active','overdue','suspended','cancelled') then raise exception 'SYNCPAY_STATUS_UNKNOWN'; end if;
 insert into public.syncpay_webhook_events(event_key,event_name,subscription_token,occurred_at,body_sha256)
 values(p_event_key,p_event_name,p_subscription_token,p_occurred_at,p_body_sha256)
 on conflict(event_key) do nothing;
 if not found then return jsonb_build_object('applied',false,'duplicate',true); end if;

 select * into link from public.saas_provider_subscriptions where provider_subscription_token=p_subscription_token for update;
 if not found then raise exception 'SYNCPAY_SUBSCRIPTION_UNKNOWN'; end if;
 if link.last_event_at is not null and p_occurred_at<link.last_event_at then
  update public.syncpay_webhook_events set result='stale',processed_at=now() where event_key=p_event_key;
  return jsonb_build_object('applied',false,'stale',true);
 end if;
 select * into m from public.syncpay_plan_mappings where provider_plan_token=p_plan_token and active;
 if not found then raise exception 'SYNCPAY_PLAN_UNKNOWN'; end if;
 if p_provider_status in ('active','overdue') and p_access_until is null then raise exception 'SYNCPAY_PERIOD_REQUIRED'; end if;

 update public.saas_provider_subscriptions set
  provider_plan_token=m.provider_plan_token,plan_code=m.plan_code,billing_cycle=m.billing_cycle,amount_cents=m.amount_cents,
  provider_status=p_provider_status,started_at=coalesce(started_at,p_started_at),last_event_at=p_occurred_at,
  cancelled_at=case when p_provider_status='cancelled' then coalesce(cancelled_at,p_occurred_at) else cancelled_at end,updated_at=now()
 where id=link.id;

 if not link.is_current then
  update public.syncpay_webhook_events set result='historical',processed_at=now() where event_key=p_event_key;
  return jsonb_build_object('applied',false,'historical',true);
 end if;

 if p_provider_status='active' then fio_status:='active';
 elsif p_provider_status='overdue' then fio_status:='past_due';
 elsif p_provider_status='suspended' then fio_status:='inactive';
 elsif p_provider_status='cancelled' then fio_status:='cancelled';
 else
  update public.syncpay_webhook_events set result='applied',processed_at=now() where event_key=p_event_key;
  return jsonb_build_object('applied',true,'entitlement_changed',false);
 end if;

 update public.saas_subscriptions set
  plan=m.plan_code,status=fio_status,
  starts_at=case when p_provider_status in ('active','overdue') then coalesce(starts_at,p_started_at,p_occurred_at) else starts_at end,
  expires_at=case when p_provider_status in ('active','overdue') then p_access_until else least(coalesce(expires_at,p_occurred_at),p_occurred_at) end,
  cancelled_at=case when p_provider_status='cancelled' then p_occurred_at when p_provider_status='active' then null else cancelled_at end
 where barbershop_id=link.barbershop_id;

 update public.syncpay_webhook_events set result='applied',processed_at=now() where event_key=p_event_key;
 return jsonb_build_object('applied',true,'entitlement_changed',true,'status',fio_status,'plan',m.plan_code);
end $$;
revoke all on function public.apply_syncpay_subscription_state(text,text,timestamptz,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_syncpay_subscription_state(text,text,timestamptz,text,text,text,text,timestamptz,timestamptz) to service_role;
