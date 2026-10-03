-- Additive platform administration. No Auth users or credentials are created.
-- Correct the legacy escaped phone regex exposed by the staff/audit regression test.
-- NOT VALID preserves historical rows; all new/changed rows are validated immediately.
alter table public.memberships drop constraint memberships_phone_format;
alter table public.memberships add constraint memberships_phone_format check(phone is null or phone ~ '^[+]?[0-9 ()-]{8,24}$') not valid;
alter table public.customers drop constraint customers_phone_format;
alter table public.customers add constraint customers_phone_format check(phone is null or phone ~ '^[+]?[0-9 ()-]{8,24}$') not valid;
create schema if not exists fio_private;
revoke all on schema fio_private from public;
grant usage on schema fio_private to authenticated;

create table public.platform_admins (
 user_id uuid primary key references auth.users(id),
 display_name text not null check(length(trim(display_name)) between 2 and 100),
 active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public,anon,authenticated;
grant select on public.platform_admins to authenticated;
create policy platform_self on public.platform_admins for select to authenticated
 using(user_id=(select auth.uid()) and active);

create function fio_private.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.platform_admins where user_id=auth.uid() and active);
$$;
revoke all on function fio_private.is_platform_admin() from public,anon;
grant execute on function fio_private.is_platform_admin() to authenticated;

alter table public.barbershops add column platform_status text not null default 'active'
 check(platform_status in ('active','trial','suspended'));
create index barbershops_platform_status on public.barbershops(platform_status,created_at desc);

create table public.saas_plans (
 id uuid primary key default gen_random_uuid(), code text not null unique references public.plan_features(plan),
 name text not null check(length(trim(name)) between 2 and 100),
 price_cents integer check(price_cents between 0 and 10000000),
 active boolean not null default true, features jsonb not null default '{}', limits jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Paid prices are unknown; catalog prices are never treated as received revenue.
insert into public.saas_plans(code,name,price_cents,features,limits)
 select plan,'FIO '||plan,case when plan='FREE' then 0 end,
 jsonb_build_object('ai_enabled',ai_enabled),jsonb_build_object('ai_daily_limit',ai_daily_limit,'ai_per_minute',ai_per_minute) from public.plan_features;
alter table public.saas_plans enable row level security;
revoke all on public.saas_plans from public,anon,authenticated;
grant select on public.saas_plans to authenticated;
create policy platform_plans_read on public.saas_plans for select to authenticated using((select fio_private.is_platform_admin()));

alter table public.saas_subscriptions
 add column id uuid not null default gen_random_uuid() unique,
 add column plan_id uuid references public.saas_plans(id),
 add column starts_at timestamptz,
 add column current_period_end timestamptz,
 add column trial_ends_at timestamptz,
 add column cancelled_at timestamptz,
 add column created_at timestamptz not null default now(),
 add column updated_at timestamptz not null default now();
alter table public.saas_subscriptions drop constraint saas_subscriptions_status_check;
alter table public.saas_subscriptions add constraint saas_subscriptions_status_check check(status in ('active','inactive','trialing','past_due','cancelled'));
update public.saas_subscriptions s set plan_id=p.id,current_period_end=s.expires_at from public.saas_plans p where p.code=s.plan;
alter table public.saas_subscriptions alter column plan_id set not null;
create index saas_subscription_plan on public.saas_subscriptions(plan_id);
create index saas_subscription_status on public.saas_subscriptions(status,current_period_end);
-- Existing onboarding/operations continue writing the legacy plan/expires_at fields.
create function fio_private.sync_saas() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select id into new.plan_id from public.saas_plans where code=new.plan;
 new.current_period_end:=new.expires_at; new.updated_at:=now();
 if tg_op='INSERT' then new.starts_at:=coalesce(new.starts_at,now()); end if;
 return new;
end $$;
create trigger platform_saas_sync before insert or update on public.saas_subscriptions for each row execute function fio_private.sync_saas();

create function fio_private.reject_suspended_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.barbershops where id=new.barbershop_id and platform_status='suspended') then raise exception 'FORBIDDEN'; end if;
 return new;
end $$;
create trigger platform_suspended_join before insert on public.memberships for each row execute function fio_private.reject_suspended_membership();

-- Suspended shops lose operational access through all existing role-based policies/RPCs.
create or replace function public.member_role(shop uuid) returns text language sql stable security definer set search_path='' as $$
 select m.role from public.memberships m join public.barbershops b on b.id=m.barbershop_id
 where m.barbershop_id=shop and m.user_id=auth.uid() and m.active and b.platform_status<>'suspended';
$$;

-- Explicit global read scope: no invitations, Auth credentials or private AI conversations.
do $$ declare t text; begin
 foreach t in array array['barbershops','memberships','customers','services','appointments','payments','client_subscriptions','reviews','saas_subscriptions','audit_events'] loop
 execute format('create policy platform_read on public.%I for select to authenticated using ((select fio_private.is_platform_admin()))',t);
 end loop;
end $$;

alter table public.audit_events alter column barbershop_id drop not null;
alter table public.audit_events add column actor_user_id uuid references auth.users(id),
 add column actor_role text not null default 'UNKNOWN', add column actor_name text,
 add column event_type text, add column entity_type text, add column entity_id uuid,
 add column description text, add column metadata jsonb not null default '{}';
-- Do not infer historical roles from present-day memberships.
update public.audit_events set actor_user_id=actor_id,event_type=action,entity_type=split_part(action,'.',1),entity_id=target_id,description=action;
create index audit_platform_time on public.audit_events(created_at desc,id desc);
create index audit_platform_actor on public.audit_events(actor_user_id,created_at desc);
create index audit_platform_shop on public.audit_events(barbershop_id,created_at desc);
create index audit_platform_type on public.audit_events(event_type,created_at desc);
create function fio_private.enrich_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.actor_user_id:=new.actor_id; new.event_type:=new.action;
 new.entity_type:=coalesce(new.entity_type,split_part(new.action,'.',1)); new.entity_id:=coalesce(new.entity_id,new.target_id);
 if exists(select 1 from public.platform_admins where user_id=new.actor_id and active) then
  new.actor_role:='PLATFORM_ADMIN'; select display_name into new.actor_name from public.platform_admins where user_id=new.actor_id;
 else
  select role,display_name into new.actor_role,new.actor_name from public.memberships where user_id=new.actor_id and barbershop_id=new.barbershop_id;
  new.actor_role:=coalesce(new.actor_role,'UNKNOWN');
 end if;
 new.description:=coalesce(new.description,case new.action
 when 'appointment.completed' then 'Atendimento concluído'
 when 'appointment.cancelled' then 'Agendamento cancelado'
 when 'appointment.created' then 'Agendamento criado'
 when 'appointment.in_service' then 'Atendimento iniciado'
 when 'payment.recorded' then 'Pagamento registrado'
 when 'subscription.issued' then 'Assinatura de cortes emitida'
 when 'invitation.created' then 'Convite criado' else new.action end);
 -- Metadata is generated by trusted functions only; never copy request bodies/rows.
 return new;
end $$;
create trigger platform_audit_enrich before insert on public.audit_events for each row execute function fio_private.enrich_audit();

-- Cover ordinary CRUD not already logged by transactional appointment/payment RPCs.
create function fio_private.audit_crud() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new); shop uuid; target uuid;
begin
 if auth.uid() is null then return new; end if;
 if tg_table_name='barbershops' and fio_private.is_platform_admin() then return new; end if;
 shop:=case when tg_table_name='barbershops' then (j->>'id')::uuid else (j->>'barbershop_id')::uuid end;
 target:=coalesce((j->>'id')::uuid,(j->>'user_id')::uuid);
 if tg_op='UPDATE' and new is not distinct from old then return new; end if;
 insert into public.audit_events(barbershop_id,actor_id,action,target_id,description)
 values(shop,auth.uid(),tg_table_name||'.'||lower(tg_op),target,
 case tg_table_name when 'memberships' then 'Vínculo de equipe/cliente' when 'barbershops' then 'Informações da barbearia' when 'services' then 'Serviço' when 'customers' then 'Cadastro de cliente' when 'reviews' then 'Avaliação' end||case when tg_op='INSERT' then ' criado' else ' atualizado' end);
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['memberships','services','customers','reviews'] loop
 execute format('create trigger platform_crud_audit after insert or update on public.%I for each row execute function fio_private.audit_crud()',t);
 end loop;
end $$;

create trigger platform_branding_audit after update on public.barbershops for each row execute function fio_private.audit_crud();

create function fio_private.update_platform_shop(p_shop uuid,p_name text,p_status text,p_plan uuid,p_billing_status text,p_end timestamptz,p_confirmed boolean)
returns void language plpgsql security definer set search_path='' as $$
declare old_shop public.barbershops; old_sub public.saas_subscriptions; code text;
begin
 if not fio_private.is_platform_admin() then raise exception 'FORBIDDEN'; end if;
 if p_confirmed is distinct from true then raise exception 'CONFIRMATION_REQUIRED' using errcode='22023'; end if;
 select * into old_shop from public.barbershops where id=p_shop for update;
 if not found then raise exception 'SHOP_NOT_FOUND'; end if;
 select * into old_sub from public.saas_subscriptions where barbershop_id=p_shop for update;
 select p.code into code from public.saas_plans p where id=p_plan and (active or id=old_sub.plan_id);
 if code is null or p_name is null or p_status is null or p_billing_status is null then raise exception 'INVALID_DATA' using errcode='22023'; end if;
 update public.barbershops set name=trim(p_name),platform_status=p_status where id=p_shop;
 update public.saas_subscriptions set plan=code,status=p_billing_status,expires_at=p_end,
 trial_ends_at=case when p_billing_status='trialing' then p_end else null end,
 cancelled_at=case when p_billing_status='cancelled' then coalesce(cancelled_at,now()) else null end where barbershop_id=p_shop;
 insert into public.audit_events(barbershop_id,actor_id,action,target_id,description,metadata)
 values(p_shop,auth.uid(),'platform.shop.updated',p_shop,'Configuração administrativa / plano SaaS atualizado',
 jsonb_build_object('previous_status',old_shop.platform_status,'status',p_status,'previous_plan',old_sub.plan,'plan',code,'billing_status',p_billing_status,'current_period_end',p_end));
end $$;
create function public.platform_update_shop(p_shop uuid,p_name text,p_status text,p_plan uuid,p_billing_status text,p_end timestamptz,p_confirmed boolean)
returns void language sql security invoker set search_path='' as $$select fio_private.update_platform_shop(p_shop,p_name,p_status,p_plan,p_billing_status,p_end,p_confirmed)$$;

create function fio_private.update_platform_plan(p_id uuid,p_name text,p_price integer,p_active boolean,p_confirmed boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not fio_private.is_platform_admin() then raise exception 'FORBIDDEN'; end if;
 if p_confirmed is distinct from true then raise exception 'CONFIRMATION_REQUIRED' using errcode='22023'; end if;
 update public.saas_plans set name=trim(p_name),price_cents=p_price,active=p_active,updated_at=now() where id=p_id;
 if not found then raise exception 'INVALID_DATA' using errcode='22023'; end if;
 insert into public.audit_events(actor_id,action,target_id,description,metadata)
 values(auth.uid(),'platform.plan.updated',p_id,'Catálogo de planos SaaS atualizado',jsonb_build_object('price_cents',p_price,'active',p_active));
end $$;
create function public.platform_update_plan(p_id uuid,p_name text,p_price integer,p_active boolean,p_confirmed boolean)
returns void language sql security invoker set search_path='' as $$select fio_private.update_platform_plan(p_id,p_name,p_price,p_active,p_confirmed)$$;

-- Staff provisioning is already performed server-side. Finalize membership + audit atomically
-- under the requesting OWNER JWT, rather than an unattributed service-role insert.
create function fio_private.attach_staff(p_shop uuid,p_user uuid,p_name text,p_phone text) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 insert into public.memberships(barbershop_id,user_id,role,display_name,phone,active) values(p_shop,p_user,'BARBER',p_name,p_phone,true);
end $$;
-- Callable only by service_role, with actor attribution supplied by the authenticated server.
-- No authenticated caller can attach arbitrary existing Auth users.
create function public.platform_attach_provisioned_staff(p_shop uuid,p_user uuid,p_name text,p_phone text,p_actor uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform fio_private.attach_staff(p_shop,p_user,p_name,p_phone);
end $$;

-- Timestamp maintenance for out-of-band trusted administrator registration/deactivation.
create function fio_private.touch_platform_admin() returns trigger language plpgsql set search_path='' as $$begin new.updated_at:=now(); return new; end$$;
create trigger platform_admin_updated before update on public.platform_admins for each row execute function fio_private.touch_platform_admin();

revoke all on all functions in schema fio_private from public,anon,authenticated;
grant execute on function fio_private.is_platform_admin(),fio_private.update_platform_shop(uuid,text,text,uuid,text,timestamptz,boolean),fio_private.update_platform_plan(uuid,text,integer,boolean,boolean) to authenticated;
revoke all on function public.platform_update_shop(uuid,text,text,uuid,text,timestamptz,boolean),public.platform_update_plan(uuid,text,integer,boolean,boolean),public.platform_attach_provisioned_staff(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.platform_update_shop(uuid,text,text,uuid,text,timestamptz,boolean),public.platform_update_plan(uuid,text,integer,boolean,boolean) to authenticated;
grant usage on schema fio_private to service_role;
grant execute on function fio_private.attach_staff(uuid,uuid,text,text),public.platform_attach_provisioned_staff(uuid,uuid,text,text,uuid) to service_role;

create view public.platform_shop_directory with (security_invoker=true) as
 select b.id,b.name,b.slug,b.logo_url,b.platform_status,b.created_at,
 (select m.display_name from public.memberships m where m.barbershop_id=b.id and m.role='OWNER' order by m.user_id limit 1) as owner_name,
 s.plan,s.plan_id,s.status as billing_status,s.current_period_end,
 case when b.platform_status='suspended' then 'suspended' when s.status='past_due' then 'past_due'
 when b.platform_status='trial' or s.status='trialing' then 'trial' else b.platform_status end as status,
 (select max(a.created_at) from public.audit_events a where a.barbershop_id=b.id) as last_activity
 from public.barbershops b left join public.saas_subscriptions s on s.barbershop_id=b.id
 where (select fio_private.is_platform_admin());
revoke all on public.platform_shop_directory from public,anon;
grant select on public.platform_shop_directory to authenticated;

create view public.platform_actor_directory with (security_invoker=true) as
 select distinct on (id) id,name from (
 select user_id as id,display_name as name from public.memberships
 union all select user_id,display_name from public.platform_admins
 union all select actor_user_id,actor_name from public.audit_events where actor_name is not null
 ) actors where (select fio_private.is_platform_admin()) order by id,name;
revoke all on public.platform_actor_directory from public,anon;
grant select on public.platform_actor_directory to authenticated;
