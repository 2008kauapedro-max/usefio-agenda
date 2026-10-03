-- One-time 14 day FIO PRO trial for the barbershop owner.
-- Paid plan activation remains reserved for the payment integration.
create or replace function public.start_saas_pro_trial(p_shop uuid) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare
 sub public.saas_subscriptions;
 trial_end timestamptz;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if public.member_role(p_shop) <> 'OWNER' then raise exception 'FORBIDDEN'; end if;

 select * into sub from public.saas_subscriptions where barbershop_id=p_shop for update;
 if not found then raise exception 'TRIAL_NOT_AVAILABLE'; end if;
 if sub.trial_ends_at is not null then raise exception 'TRIAL_ALREADY_USED'; end if;
 if sub.plan <> 'FREE' then raise exception 'TRIAL_NOT_AVAILABLE'; end if;

 trial_end:=now()+interval '14 days';
 update public.saas_subscriptions
 set plan='PRO',status='trialing',starts_at=now(),expires_at=trial_end,trial_ends_at=trial_end,cancelled_at=null
 where barbershop_id=p_shop;

 insert into public.audit_events(barbershop_id,actor_id,action,target_id)
 values(p_shop,auth.uid(),'saas_pro_trial_started',p_shop);
 return trial_end;
end $$;
revoke all on function public.start_saas_pro_trial(uuid) from public,anon;
grant execute on function public.start_saas_pro_trial(uuid) to authenticated;

-- Trials receive the same PRO AI entitlement while the trial period is valid.
create or replace function public.consume_assistant_quota(p_shop uuid) returns void
language plpgsql security definer set search_path='' as $$
declare f public.plan_features; u public.assistant_usage; today date := (now() at time zone 'UTC')::date;
begin
 if public.member_role(p_shop) is null then raise exception 'FORBIDDEN'; end if;
 select pf.* into f
 from public.saas_subscriptions s
 join public.plan_features pf on pf.plan=s.plan
 where s.barbershop_id=p_shop
   and s.status in ('active','trialing')
   and (s.expires_at is null or s.expires_at>now());
 if f.plan is null or not f.ai_enabled then raise exception 'PLAN_REQUIRED'; end if;
 insert into public.assistant_usage(barbershop_id,user_id,day) values(p_shop,auth.uid(),today) on conflict do nothing;
 select * into u from public.assistant_usage where barbershop_id=p_shop and user_id=auth.uid() and day=today for update;
 if u.request_count>=f.ai_daily_limit then raise exception 'DAILY_LIMIT'; end if;
 if u.minute_start>now()-interval '1 minute' and u.minute_count>=f.ai_per_minute then raise exception 'RATE_LIMIT'; end if;
 update public.assistant_usage set request_count=request_count+1,
 minute_count=case when minute_start<=now()-interval '1 minute' then 1 else minute_count+1 end,
 minute_start=case when minute_start<=now()-interval '1 minute' then now() else minute_start end
 where barbershop_id=p_shop and user_id=auth.uid() and day=today;
end $$;
revoke all on function public.consume_assistant_quota(uuid) from public,anon;
grant execute on function public.consume_assistant_quota(uuid) to authenticated;
