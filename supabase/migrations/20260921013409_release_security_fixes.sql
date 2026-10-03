-- Forward-only corrections; preserves existing accounts, bookings and files.
alter table public.memberships drop constraint if exists memberships_phone_format;
alter table public.memberships add constraint memberships_phone_format check(phone is null or phone ~ '^[+]?[0-9 ()-]{8,24}$') not valid;
alter table public.customers drop constraint if exists customers_phone_format;
alter table public.customers add constraint customers_phone_format check(phone is null or phone ~ '^[+]?[0-9 ()-]{8,24}$') not valid;

create or replace function public.update_own_profile(p_shop uuid,p_display_name text,p_phone text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if public.member_role(p_shop) is null then raise exception 'FORBIDDEN'; end if;
 if length(trim(coalesce(p_display_name,''))) not between 2 and 100 then raise exception 'INVALID_DATA'; end if;
 if nullif(trim(coalesce(p_phone,'')),'') is not null and trim(p_phone) !~ '^[+]?[0-9 ()-]{8,24}$' then raise exception 'INVALID_PHONE'; end if;
 update public.memberships set display_name=trim(p_display_name),phone=nullif(trim(p_phone),'') where barbershop_id=p_shop and user_id=auth.uid() and active;
 update public.customers set name=trim(p_display_name),phone=nullif(trim(p_phone),'') where barbershop_id=p_shop and user_id=auth.uid();
end $$;
create or replace function public.update_own_contact(p_shop uuid,p_phone text)
returns void language plpgsql security definer set search_path='' as $$
declare display text;
begin
 if public.member_role(p_shop) is null then raise exception 'FORBIDDEN'; end if;
 select display_name into display from public.memberships where barbershop_id=p_shop and user_id=auth.uid();
 perform public.update_own_profile(p_shop,display,p_phone);
end $$;
revoke all on function public.update_own_profile(uuid,text,text),public.update_own_contact(uuid,text) from public,anon;
grant execute on function public.update_own_profile(uuid,text,text),public.update_own_contact(uuid,text) to authenticated;

-- A failed insert must not erase the previously configured opening hours.
create or replace function public.replace_business_hours(p_shop uuid,p_days jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 if jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days) not between 1 and 7 then raise exception 'INVALID_DATA'; end if;
 perform pg_advisory_xact_lock(hashtextextended('hours:'||p_shop::text,0));
 delete from public.business_hours where barbershop_id=p_shop;
 insert into public.business_hours(barbershop_id,weekday,opens_at,closes_at)
 select p_shop,weekday,opens_at,closes_at from jsonb_to_recordset(p_days) as x(weekday integer,opens_at time,closes_at time);
end $$;
revoke all on function public.replace_business_hours(uuid,jsonb) from public,anon;
grant execute on function public.replace_business_hours(uuid,jsonb) to authenticated;

-- Direct REST inserts must share the same feedback quota as API traffic.
create or replace function fio_private.guard_feedback_rate() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or new.user_id is distinct from auth.uid() or public.member_role(new.barbershop_id) is distinct from new.role then raise exception 'FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended('feedback:'||auth.uid()::text,0));
 if (select count(*) from public.support_feedback where user_id=auth.uid() and created_at>now()-interval '10 minutes')>=5 then raise exception 'RATE_LIMIT'; end if;
 return new;
end $$;
revoke all on function fio_private.guard_feedback_rate() from public,anon,authenticated;
create trigger feedback_rate_guard before insert on public.support_feedback for each row execute function fio_private.guard_feedback_rate();

-- Existing uploads use immutable names and upsert:false. Disallow UPDATE so that
-- an old broad UPDATE policy cannot bypass the stricter INSERT filename contract.
do $$ begin
 if to_regclass('storage.objects') is null then return; end if;
 execute 'drop policy if exists profile_avatars_update on storage.objects';
 execute 'drop policy if exists branding_assets_update on storage.objects';
end $$;

-- Enforce the quantities advertised by the plan catalog, including direct RPC/REST.
-- Existing rows are retained after a downgrade; only additional active capacity is blocked.
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
  cap:=case plan when 'FREE' then 1 when 'PRO' then 5 else null end;
  select count(*) into used from public.memberships where barbershop_id=new.barbershop_id and role='BARBER' and active;
 elsif tg_table_name='services' then
  cap:=case plan when 'FREE' then 8 when 'PRO' then 40 else null end;
  select count(*) into used from public.services where barbershop_id=new.barbershop_id and active;
 elsif tg_table_name='customers' then
  cap:=case plan when 'FREE' then 100 when 'PRO' then 1500 else null end;
  select count(*) into used from public.customers where barbershop_id=new.barbershop_id;
 elsif tg_table_name='subscription_plans' then
  -- Authorization/entitlement remains the responsibility of the table RLS.
  if public.member_role(new.barbershop_id) is distinct from 'OWNER' or plan='FREE' then return new; end if;
  cap:=case plan when 'PRO' then 3 else 15 end;
  select count(*) into used from public.subscription_plans where barbershop_id=new.barbershop_id and active;
 end if;
 if cap is not null and used>=cap then raise exception 'PLAN_CAPACITY'; end if;
 return new;
end $$;
revoke all on function fio_private.enforce_plan_capacity() from public,anon,authenticated;
create trigger capacity_memberships before insert or update of active on public.memberships for each row execute function fio_private.enforce_plan_capacity();
create trigger capacity_services before insert or update of active on public.services for each row execute function fio_private.enforce_plan_capacity();
create trigger capacity_customers before insert on public.customers for each row execute function fio_private.enforce_plan_capacity();
create trigger capacity_subscription_plans before insert or update of active on public.subscription_plans for each row execute function fio_private.enforce_plan_capacity();
