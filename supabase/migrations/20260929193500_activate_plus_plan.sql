-- Activate FIO PLUS across entitlements, billing and enforced capacities.

alter table public.plan_features drop constraint if exists plan_features_plan_check;
alter table public.plan_features add constraint plan_features_plan_check
 check(plan in ('FREE','PRO','PLUS','PREMIUM'));

insert into public.plan_features(plan,ai_enabled,ai_daily_limit,ai_per_minute)
values ('PLUS',true,250,15)
on conflict(plan) do update set
 ai_enabled=excluded.ai_enabled,
 ai_daily_limit=excluded.ai_daily_limit,
 ai_per_minute=excluded.ai_per_minute;

insert into public.saas_plans(code,name,price_cents,active,features,limits)
values ('PLUS','FIO PLUS',null,true,'{"ai_enabled":true}'::jsonb,'{"ai_daily_limit":250,"ai_per_minute":15}'::jsonb)
on conflict(code) do update set
 name=excluded.name,
 active=true,
 features=excluded.features,
 limits=excluded.limits,
 updated_at=now();

alter table public.syncpay_plan_mappings drop constraint if exists syncpay_plan_mappings_plan_code_check;
alter table public.syncpay_plan_mappings add constraint syncpay_plan_mappings_plan_code_check
 check(plan_code in ('PRO','PLUS','PREMIUM'));

alter table public.syncpay_enrollment_intents drop constraint if exists syncpay_enrollment_intents_plan_code_check;
alter table public.syncpay_enrollment_intents add constraint syncpay_enrollment_intents_plan_code_check
 check(plan_code in ('PRO','PLUS','PREMIUM'));

alter table public.saas_provider_subscriptions drop constraint if exists saas_provider_subscriptions_plan_code_check;
alter table public.saas_provider_subscriptions add constraint saas_provider_subscriptions_plan_code_check
 check(plan_code in ('PRO','PLUS','PREMIUM'));

alter table public.syncpay_plan_changes drop constraint if exists syncpay_plan_changes_target_plan_check;
alter table public.syncpay_plan_changes add constraint syncpay_plan_changes_target_plan_check
 check(target_plan in ('PRO','PLUS','PREMIUM'));

create or replace function fio_private.enforce_plan_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
declare plan text; cap integer; used integer;
begin
 if tg_table_name='memberships' then
  if new.role<>'BARBER' or not new.active then return new; end if;
 end if;
 if tg_table_name in ('services','subscription_plans') then
  if not new.active then return new; end if;
 end if;
 if tg_op='UPDATE' then
  if old.active and new.active then return new; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('capacity:'||new.barbershop_id::text,0));
 plan:=public.effective_fio_plan(new.barbershop_id);
 if tg_table_name='memberships' then
  cap:=case plan when 'FREE' then 1 when 'PRO' then 5 when 'PLUS' then 10 else null end;
  select count(*) into used from public.memberships where barbershop_id=new.barbershop_id and role='BARBER' and active;
 elsif tg_table_name='services' then
  cap:=case plan when 'FREE' then 8 when 'PRO' then 40 when 'PLUS' then 80 else null end;
  select count(*) into used from public.services where barbershop_id=new.barbershop_id and active;
 elsif tg_table_name='customers' then
  cap:=case plan when 'FREE' then 100 when 'PRO' then 1500 when 'PLUS' then 3000 else null end;
  select count(*) into used from public.customers where barbershop_id=new.barbershop_id;
 elsif tg_table_name='subscription_plans' then
  if public.member_role(new.barbershop_id) is distinct from 'OWNER' or plan='FREE' then return new; end if;
  cap:=case plan when 'PRO' then 3 when 'PLUS' then 8 else 15 end;
  select count(*) into used from public.subscription_plans where barbershop_id=new.barbershop_id and active;
 end if;
 if cap is not null and used>=cap then raise exception 'PLAN_CAPACITY'; end if;
 return new;
end $$;

revoke all on function fio_private.enforce_plan_capacity() from public,anon,authenticated;
