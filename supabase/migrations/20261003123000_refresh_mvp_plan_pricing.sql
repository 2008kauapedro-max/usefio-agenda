-- FIO MVP: final commercial pricing and capacity refresh.
-- Monthly and annual billing have the same entitlements.
-- Annual billing costs the equivalent of 10 monthly payments (about 2 months of savings).

update public.saas_plans
set
  price_cents=14990,
  limits=coalesce(limits,'{}'::jsonb)||
    '{"customers":500,"barbers":5,"services":20,"client_plans":5,"ai_daily_limit":150,"ai_per_minute":10}'::jsonb,
  updated_at=now()
where code='PRO';

update public.saas_plans
set
  price_cents=29990,
  limits=coalesce(limits,'{}'::jsonb)||
    '{"customers":2000,"barbers":10,"services":50,"client_plans":15,"ai_daily_limit":500,"ai_per_minute":20}'::jsonb,
  updated_at=now()
where code='PREMIUM';

update public.plan_features
set ai_daily_limit=150, ai_per_minute=10
where plan='PRO';

update public.plan_features
set ai_daily_limit=500, ai_per_minute=20
where plan='PREMIUM';

update public.syncpay_plan_mappings
set active=false, updated_at=now()
where
  plan_code in ('PRO','PREMIUM')
  and (
    (plan_code='PRO' and amount_cents not in (14990,149900))
    or
    (plan_code='PREMIUM' and amount_cents not in (29990,299900))
  );

create or replace function fio_private.enforce_plan_capacity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
 plan text;
 cap integer;
 used integer;
begin

 if tg_table_name='memberships' then
  if new.role<>'BARBER' or not new.active then
   return new;
  end if;
 end if;

 if tg_table_name in ('services','subscription_plans') then
  if not new.active then
   return new;
  end if;
 end if;

 if tg_op='UPDATE' then
  if old.active and new.active then
   return new;
  end if;
 end if;

 perform pg_advisory_xact_lock(
  hashtextextended(
   'capacity:'||new.barbershop_id::text,
   0
  )
 );

 plan:=public.effective_fio_plan(new.barbershop_id);

 if tg_table_name='memberships' then

  cap:=case plan
   when 'FREE' then 1
   when 'PRO' then 5
   when 'PLUS' then 10
   when 'PREMIUM' then 10
   else null
  end;

  select count(*) into used
  from public.memberships
  where
   barbershop_id=new.barbershop_id
   and role='BARBER'
   and active;

 elsif tg_table_name='services' then

  cap:=case plan
   when 'FREE' then 8
   when 'PRO' then 20
   when 'PLUS' then 80
   when 'PREMIUM' then 50
   else null
  end;

  select count(*) into used
  from public.services
  where
   barbershop_id=new.barbershop_id
   and active;

 elsif tg_table_name='customers' then

  cap:=case plan
   when 'FREE' then 85
   when 'PRO' then 500
   when 'PLUS' then 3000
   when 'PREMIUM' then 2000
   else null
  end;

  select count(*) into used
  from public.customers
  where barbershop_id=new.barbershop_id;

 elsif tg_table_name='subscription_plans' then

  if public.member_role(new.barbershop_id)
   is distinct from 'OWNER'
   or plan='FREE'
  then
   return new;
  end if;

  cap:=case plan
   when 'PRO' then 5
   when 'PLUS' then 8
   when 'PREMIUM' then 15
   else 0
  end;

  select count(*) into used
  from public.subscription_plans
  where
   barbershop_id=new.barbershop_id
   and active;

 end if;

 if cap is not null and used>=cap then
  raise exception 'PLAN_CAPACITY';
 end if;

 return new;
end
$$;

revoke all
on function fio_private.enforce_plan_capacity()
from public,anon,authenticated;
