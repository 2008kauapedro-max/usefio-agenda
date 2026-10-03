alter table public.syncpay_webhook_events drop constraint syncpay_webhook_events_result_check;
alter table public.syncpay_webhook_events add constraint syncpay_webhook_events_result_check check(result in ('received','applied','duplicate','stale','historical','deferred'));

-- Persistent locks: never retry an uncertain plan-change mutation automatically.
create table public.syncpay_plan_changes(
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id),
 subscription_token text not null,
 target_plan_token text not null,
 target_plan text not null check(target_plan in ('PRO','PREMIUM')),
 target_cycle text not null check(target_cycle in ('weekly','monthly','annual')),
 actor uuid not null references auth.users(id),
 state text not null check(state in ('creating','uncertain','pending','complete','failed')),
 result_type text check(result_type in ('upgrade','downgrade','same_value')),
 charge_cycle integer,charge_amount_cents integer,charge_identifier text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index syncpay_one_pending_change on public.syncpay_plan_changes(subscription_token) where state in ('creating','uncertain','pending');
alter table public.syncpay_plan_changes enable row level security;
revoke all on public.syncpay_plan_changes from public,anon,authenticated;
grant select,insert,update on public.syncpay_plan_changes to service_role;

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
 if not found and not exists(select 1 from public.syncpay_webhook_events where event_key=p_event_key and result='deferred') then return jsonb_build_object('applied',false,'duplicate',true); end if;

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
  provider_status=p_provider_status,started_at=coalesce(started_at,p_started_at,case when p_provider_status in ('active','overdue') then p_occurred_at else null end),last_event_at=p_occurred_at,
  cancelled_at=case when p_provider_status='cancelled' then coalesce(cancelled_at,p_occurred_at) else cancelled_at end,updated_at=now()
 where id=link.id;

 if not link.is_current then
  update public.syncpay_webhook_events set result='historical',processed_at=now() where event_key=p_event_key;
  return jsonb_build_object('applied',false,'historical',true);
 end if;

 -- Cancelling an unpaid enrollment must not end an existing trial or free access.
 if p_provider_status in ('cancelled','suspended') and link.started_at is null and link.provider_status not in ('active','overdue') then
  update public.syncpay_webhook_events set result='applied',processed_at=now() where event_key=p_event_key;
  return jsonb_build_object('applied',true,'entitlement_changed',false);
 end if;
 -- The provider applies an upgrade before its proportional Pix is paid.
 -- Only the service-side exact-charge reconciliation can close this gate.
 if p_provider_status in ('active','overdue') and exists(
  select 1 from public.syncpay_plan_changes c where c.subscription_token=p_subscription_token
  and c.state in ('creating','uncertain','pending') and c.target_plan_token=p_plan_token
 ) then
  update public.syncpay_webhook_events set result='deferred',processed_at=now() where event_key=p_event_key;
  return jsonb_build_object('applied',true,'entitlement_changed',false);
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
