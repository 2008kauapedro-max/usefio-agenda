-- Additive release hardening. Do not edit/reapply historical migrations.
-- Explicit NULL-safe authorization: an unrelated user must never start a trial.
create or replace function public.start_saas_pro_trial(p_shop uuid) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare sub public.saas_subscriptions; trial_end timestamptz;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 select * into sub from public.saas_subscriptions where barbershop_id=p_shop for update;
 if not found then raise exception 'TRIAL_NOT_AVAILABLE'; end if;
 if sub.trial_ends_at is not null then raise exception 'TRIAL_ALREADY_USED'; end if;
 if sub.plan <> 'FREE' then raise exception 'TRIAL_NOT_AVAILABLE'; end if;
 trial_end:=now()+interval '14 days';
 update public.saas_subscriptions set plan='PRO',status='trialing',starts_at=now(),expires_at=trial_end,
  current_period_end=trial_end,trial_ends_at=trial_end,cancelled_at=null where barbershop_id=p_shop;
 insert into public.audit_events(barbershop_id,actor_id,action,target_id)
  values(p_shop,auth.uid(),'saas_pro_trial_started',p_shop);
 return trial_end;
end $$;
revoke all on function public.start_saas_pro_trial(uuid) from public,anon;
grant execute on function public.start_saas_pro_trial(uuid) to authenticated;

-- Existing client subscriptions remain readable/usable after downgrade.
-- Only new offers and new subscriptions require paid capabilities.
drop policy if exists subscription_plans_owner on public.subscription_plans;
create policy subscription_plans_owner on public.subscription_plans for all to authenticated
 using(public.member_role(barbershop_id)='OWNER' and public.fio_feature_allowed(barbershop_id,'client_plans'))
 with check(public.member_role(barbershop_id)='OWNER' and public.fio_feature_allowed(barbershop_id,'client_plans'));

-- Both legacy issue_subscription and issue_subscription_from_plan use this
-- table. Enforce the gate here so privileged RPCs cannot bypass the plan.
create or replace function fio_private.guard_new_client_subscription() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then
  if public.member_role(new.barbershop_id) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
  if not public.fio_feature_allowed(new.barbershop_id,'client_plans') then raise exception 'PLAN_REQUIRED'; end if;
 end if;
 return new;
end $$;
revoke all on function fio_private.guard_new_client_subscription() from public,anon,authenticated;
drop trigger if exists guard_new_client_subscription on public.client_subscriptions;
create trigger guard_new_client_subscription before insert on public.client_subscriptions
 for each row execute function fio_private.guard_new_client_subscription();
