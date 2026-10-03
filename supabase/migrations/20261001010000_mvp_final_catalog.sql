-- Catálogo comercial final do MVP.

update public.saas_plans
set
 name='FIO FREE',
 price_cents=0,
 active=true,
 limits=coalesce(limits,'{}'::jsonb)||
 '{"customers":85,"barbers":1,"services":8,"client_plans":0,"ai_daily_limit":0,"ai_per_minute":5}'::jsonb,
 updated_at=now()
where code='FREE';

update public.saas_plans
set
 name='FIO PRO',
 price_cents=14990,
 active=true,
 limits=coalesce(limits,'{}'::jsonb)||
 '{"customers":450,"barbers":5,"services":40,"client_plans":3,"ai_daily_limit":100,"ai_per_minute":10}'::jsonb,
 updated_at=now()
where code='PRO';

update public.saas_plans
set
 name='FIO PREMIUM',
 price_cents=24990,
 active=true,
 limits=coalesce(limits,'{}'::jsonb)||
 '{"customers":2000,"barbers":10,"services":80,"client_plans":15,"ai_daily_limit":500,"ai_per_minute":20}'::jsonb,
 updated_at=now()
where code='PREMIUM';

update public.saas_plans
set active=false,updated_at=now()
where code='PLUS';

update public.syncpay_plan_mappings
set active=false,updated_at=now()
where
 billing_cycle='weekly'
 or plan_code='PLUS'
 or (
  plan_code='PRO'
  and amount_cents not in (14990,149900)
 )
 or (
  plan_code='PREMIUM'
  and amount_cents not in (24990,249900)
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
   when 'PRO' then 40
   when 'PLUS' then 80
   when 'PREMIUM' then 80
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
   when 'PRO' then 450
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
   when 'PRO' then 3
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
