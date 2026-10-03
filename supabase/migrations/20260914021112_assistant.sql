create table public.assistant_conversations (
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null references public.barbershops(id),
 user_id uuid not null references auth.users(id), title text not null check(length(title) between 1 and 80),
 created_at timestamptz not null default now(), unique(barbershop_id,user_id,id)
);
create table public.assistant_messages (
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null, user_id uuid not null, conversation_id uuid not null,
 role text not null check(role in ('user','assistant')), content text not null check(length(content)<=12000), created_at timestamptz not null default now(),
 foreign key(barbershop_id,user_id,conversation_id) references public.assistant_conversations(barbershop_id,user_id,id) on delete cascade
);
create index assistant_history on public.assistant_messages(conversation_id,created_at);
create table public.assistant_usage (
 barbershop_id uuid not null references public.barbershops(id), user_id uuid not null references auth.users(id), day date not null,
 request_count integer not null default 0, minute_start timestamptz not null default now(), minute_count integer not null default 0,
 primary key(barbershop_id,user_id,day)
);
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_usage enable row level security;
revoke all on public.assistant_conversations,public.assistant_messages,public.assistant_usage from anon,authenticated;
grant select on public.assistant_conversations,public.assistant_messages,public.assistant_usage to authenticated;
grant insert(barbershop_id,user_id,title) on public.assistant_conversations to authenticated;
grant all on public.assistant_messages to service_role;
create policy conversation_read on public.assistant_conversations for select to authenticated using(user_id=auth.uid() and public.member_role(barbershop_id) is not null);
create policy conversation_create on public.assistant_conversations for insert to authenticated with check(user_id=auth.uid() and public.member_role(barbershop_id) is not null);
create policy message_read on public.assistant_messages for select to authenticated using(user_id=auth.uid() and public.member_role(barbershop_id) is not null);
create policy usage_read on public.assistant_usage for select to authenticated using(user_id=auth.uid() and public.member_role(barbershop_id) is not null);
create function public.consume_assistant_quota(p_shop uuid) returns void language plpgsql security definer set search_path='' as $$
declare f public.plan_features; u public.assistant_usage; today date := (now() at time zone 'UTC')::date;
begin
 if public.member_role(p_shop) is null then raise exception 'FORBIDDEN'; end if;
 select pf.* into f from public.saas_subscriptions s join public.plan_features pf on pf.plan=s.plan where s.barbershop_id=p_shop and s.status='active' and (s.expires_at is null or s.expires_at>now());
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
grant execute on function public.consume_assistant_quota(uuid) to authenticated;;
