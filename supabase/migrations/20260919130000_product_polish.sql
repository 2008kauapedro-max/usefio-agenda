-- FIO product polish: descriptions, avatars, support and server-enforced plan capabilities.

alter table public.services add column if not exists description text;
alter table public.services drop constraint if exists services_description_length;
alter table public.services add constraint services_description_length check(description is null or length(description) <= 500);

alter table public.subscription_plans add column if not exists description text;
alter table public.subscription_plans drop constraint if exists subscription_plans_description_length;
alter table public.subscription_plans add constraint subscription_plans_description_length check(description is null or length(description) <= 700);

alter table public.memberships add column if not exists avatar_url text;
alter table public.memberships add column if not exists avatar_asset_path text;
alter table public.memberships drop constraint if exists memberships_avatar_url_length;
alter table public.memberships add constraint memberships_avatar_url_length check(avatar_url is null or length(avatar_url) <= 700);
alter table public.memberships drop constraint if exists memberships_avatar_path_length;
alter table public.memberships add constraint memberships_avatar_path_length check(avatar_asset_path is null or length(avatar_asset_path) <= 500);

grant insert(barbershop_id,name,description,duration_minutes,price_cents,active), update(name,description,duration_minutes,price_cents,active) on public.services to authenticated;
grant insert(barbershop_id,name,description,cuts,validity_days,price_cents,active), update(name,description,cuts,validity_days,price_cents,active) on public.subscription_plans to authenticated;

create or replace function public.effective_fio_plan(p_shop uuid)
returns text
language sql
stable
security definer
set search_path=''
as $$
 select case
  when s.status in ('active','trialing','past_due') and (s.expires_at is null or s.expires_at > now()) then s.plan
  else 'FREE'
 end
 from public.saas_subscriptions s
 where s.barbershop_id=p_shop
 union all
 select 'FREE'
 where not exists(select 1 from public.saas_subscriptions s where s.barbershop_id=p_shop)
 limit 1
$$;

create or replace function public.fio_feature_allowed(p_shop uuid,p_feature text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
 select case p_feature
  when 'assistant' then public.effective_fio_plan(p_shop) in ('PRO','PREMIUM')
  when 'feed' then public.effective_fio_plan(p_shop) in ('PRO','PREMIUM')
  when 'communication' then public.effective_fio_plan(p_shop) in ('PRO','PREMIUM')
  when 'client_plans' then public.effective_fio_plan(p_shop) in ('PRO','PREMIUM')
  else false
 end
$$;

revoke all on function public.effective_fio_plan(uuid) from public,anon;
revoke all on function public.fio_feature_allowed(uuid,text) from public,anon;
grant execute on function public.effective_fio_plan(uuid) to authenticated,service_role;
grant execute on function public.fio_feature_allowed(uuid,text) to authenticated,service_role;

-- Feed is not merely hidden: it is inaccessible when the shop plan does not include it.
drop policy if exists feed_posts_read on public.feed_posts;
drop policy if exists feed_posts_insert on public.feed_posts;
drop policy if exists feed_posts_delete on public.feed_posts;
create policy feed_posts_read on public.feed_posts for select to authenticated using(
 public.member_role(barbershop_id) is not null and public.fio_feature_allowed(barbershop_id,'feed')
);
create policy feed_posts_insert on public.feed_posts for insert to authenticated with check(
 author_id=auth.uid() and public.member_role(barbershop_id) in ('OWNER','BARBER') and public.fio_feature_allowed(barbershop_id,'feed')
);
create policy feed_posts_delete on public.feed_posts for delete to authenticated using(
 public.fio_feature_allowed(barbershop_id,'feed') and (author_id=auth.uid() or public.member_role(barbershop_id)='OWNER')
);

-- Copilot history follows the same entitlement as the assistant itself.
drop policy if exists conversation_read on public.assistant_conversations;
drop policy if exists conversation_create on public.assistant_conversations;
drop policy if exists message_read on public.assistant_messages;
drop policy if exists usage_read on public.assistant_usage;
create policy conversation_read on public.assistant_conversations for select to authenticated using(
 user_id=auth.uid() and scope_role=public.member_role(barbershop_id) and public.fio_feature_allowed(barbershop_id,'assistant')
);
create policy conversation_create on public.assistant_conversations for insert to authenticated with check(
 user_id=auth.uid() and public.member_role(barbershop_id) is not null and public.fio_feature_allowed(barbershop_id,'assistant')
);
create policy message_read on public.assistant_messages for select to authenticated using(
 user_id=auth.uid() and public.fio_feature_allowed(barbershop_id,'assistant') and exists(
  select 1 from public.assistant_conversations c
  where c.id=conversation_id and c.barbershop_id=assistant_messages.barbershop_id
   and c.user_id=auth.uid() and c.scope_role=public.member_role(c.barbershop_id)
 )
);
create policy usage_read on public.assistant_usage for select to authenticated using(
 user_id=auth.uid() and public.member_role(barbershop_id) is not null and public.fio_feature_allowed(barbershop_id,'assistant')
);

create or replace function public.consume_assistant_quota(p_shop uuid) returns void
language plpgsql security definer set search_path='' as $$
declare f public.plan_features; u public.assistant_usage; today date := (now() at time zone 'UTC')::date;
begin
 if public.member_role(p_shop) is null then raise exception 'FORBIDDEN'; end if;
 select pf.* into f
 from public.saas_subscriptions s join public.plan_features pf on pf.plan=s.plan
 where s.barbershop_id=p_shop
   and s.status in ('active','trialing','past_due')
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

-- Communication is a paid capability as well.
drop policy if exists campaigns_member_read on public.campaigns;
drop policy if exists campaigns_owner_all on public.campaigns;
create policy campaigns_member_read on public.campaigns for select to authenticated using(
 public.member_role(barbershop_id) is not null and status='published' and public.fio_feature_allowed(barbershop_id,'communication')
);
create policy campaigns_owner_all on public.campaigns for all to authenticated using(
 public.member_role(barbershop_id)='OWNER' and public.fio_feature_allowed(barbershop_id,'communication')
) with check(
 public.member_role(barbershop_id)='OWNER' and public.fio_feature_allowed(barbershop_id,'communication')
);

create or replace function public.publish_campaign(p_shop uuid,p_campaign uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.campaigns;
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 if not public.fio_feature_allowed(p_shop,'communication') then raise exception 'PLAN_REQUIRED'; end if;
 select * into c from public.campaigns where id=p_campaign and barbershop_id=p_shop for update;
 if c.id is null or c.status<>'draft' then raise exception 'INVALID_CAMPAIGN'; end if;
 update public.campaigns set status='published',published_at=now() where id=c.id;
 insert into public.notifications(barbershop_id,user_id,title,body)
 select p_shop,m.user_id,c.title,c.body from public.memberships m
 where m.barbershop_id=p_shop and m.active and (c.audience='ALL' or m.role=c.audience) and m.user_id<>auth.uid();
 insert into public.audit_events(barbershop_id,actor_id,action,target_id) values(p_shop,auth.uid(),'campaign.published',c.id);
end $$;

-- Profile avatars. Files are compressed to WebP by the app before upload.
do $do$
begin
 if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('profile-avatars','profile-avatars',true,1572864,array['image/webp'])
   on conflict(id) do update set public=true,file_size_limit=1572864,allowed_mime_types=excluded.allowed_mime_types;

  execute 'drop policy if exists profile_avatars_read on storage.objects';
  execute 'drop policy if exists profile_avatars_insert on storage.objects';
  execute 'drop policy if exists profile_avatars_update on storage.objects';
  execute 'drop policy if exists profile_avatars_delete on storage.objects';
  execute 'create policy profile_avatars_read on storage.objects for select to anon,authenticated using(bucket_id=''profile-avatars'')';
  execute 'create policy profile_avatars_insert on storage.objects for insert to authenticated with check(bucket_id=''profile-avatars'' and (storage.foldername(name))[1] is not null and (storage.foldername(name))[2]=auth.uid()::text and public.member_role(((storage.foldername(name))[1])::uuid) is not null and lower(storage.extension(name))=''webp'')';
  execute 'create policy profile_avatars_update on storage.objects for update to authenticated using(bucket_id=''profile-avatars'' and (storage.foldername(name))[2]=auth.uid()::text) with check(bucket_id=''profile-avatars'' and (storage.foldername(name))[2]=auth.uid()::text and lower(storage.extension(name))=''webp'')';
  execute 'create policy profile_avatars_delete on storage.objects for delete to authenticated using(bucket_id=''profile-avatars'' and (storage.foldername(name))[2]=auth.uid()::text)';

  execute 'drop policy if exists feed_storage_read on storage.objects';
  execute 'drop policy if exists feed_storage_insert on storage.objects';
  execute 'drop policy if exists feed_storage_delete on storage.objects';
  execute 'create policy feed_storage_read on storage.objects for select to authenticated using(bucket_id=''feed-posts'' and public.member_role(((storage.foldername(name))[1])::uuid) is not null and public.fio_feature_allowed(((storage.foldername(name))[1])::uuid,''feed''))';
  execute 'create policy feed_storage_insert on storage.objects for insert to authenticated with check(bucket_id=''feed-posts'' and (storage.foldername(name))[1] is not null and (storage.foldername(name))[2]=auth.uid()::text and public.member_role(((storage.foldername(name))[1])::uuid) in (''OWNER'',''BARBER'') and public.fio_feature_allowed(((storage.foldername(name))[1])::uuid,''feed'') and lower(storage.extension(name))=''webp'')';
  execute 'create policy feed_storage_delete on storage.objects for delete to authenticated using(bucket_id=''feed-posts'' and (storage.foldername(name))[1] is not null and public.fio_feature_allowed(((storage.foldername(name))[1])::uuid,''feed'') and ((storage.foldername(name))[2]=auth.uid()::text or public.member_role(((storage.foldername(name))[1])::uuid)=''OWNER''))';
 end if;
end $do$;

create or replace function public.update_own_avatar(p_shop uuid,p_avatar_url text,p_avatar_path text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if public.member_role(p_shop) is null then raise exception 'FORBIDDEN'; end if;
 if nullif(trim(coalesce(p_avatar_url,'')),'') is not null and length(p_avatar_url)>700 then raise exception 'INVALID_DATA'; end if;
 if nullif(trim(coalesce(p_avatar_path,'')),'') is not null then
  if length(p_avatar_path)>500 or p_avatar_path not like p_shop::text||'/'||auth.uid()::text||'/%' then raise exception 'INVALID_DATA'; end if;
 end if;
 update public.memberships set avatar_url=nullif(trim(coalesce(p_avatar_url,'')),''),avatar_asset_path=nullif(trim(coalesce(p_avatar_path,'')),'')
 where barbershop_id=p_shop and user_id=auth.uid() and active;
 if not found then raise exception 'FORBIDDEN'; end if;
end $$;
revoke all on function public.update_own_avatar(uuid,text,text) from public,anon;
grant execute on function public.update_own_avatar(uuid,text,text) to authenticated;

-- Authenticated users can send product feedback without exposing it to other tenants.
create table if not exists public.support_feedback(
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('OWNER','BARBER','CLIENT')),
 category text not null check(category in ('feedback','problem','question')),
 message text not null check(length(message) between 3 and 1500),
 created_at timestamptz not null default now()
);
alter table public.support_feedback enable row level security;
drop policy if exists support_feedback_insert on public.support_feedback;
create policy support_feedback_insert on public.support_feedback for insert to authenticated with check(
 user_id=auth.uid() and public.member_role(barbershop_id)=role
);
revoke all on public.support_feedback from anon,authenticated;
grant insert(barbershop_id,user_id,role,category,message) on public.support_feedback to authenticated;
grant select on public.support_feedback to service_role;
