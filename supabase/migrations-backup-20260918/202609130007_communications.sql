-- Internal communication foundation. External delivery providers remain optional integrations.
create table if not exists public.notifications(
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 user_id uuid not null, title text not null check(length(title) between 1 and 120), body text not null check(length(body) between 1 and 500),
 read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.campaigns(
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 created_by uuid not null, title text not null check(length(title) between 2 and 120), body text not null check(length(body) between 1 and 1000),
 audience text not null default 'CLIENT' check(audience in ('CLIENT','BARBER','ALL')), status text not null default 'draft' check(status in ('draft','published','archived')),
 created_at timestamptz not null default now(), published_at timestamptz
);
alter table public.notifications enable row level security; alter table public.campaigns enable row level security;
create policy notifications_own on public.notifications for select to authenticated using(public.member_role(barbershop_id) is not null and user_id=auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy campaigns_member_read on public.campaigns for select to authenticated using(public.member_role(barbershop_id) is not null and status='published');
create policy campaigns_owner_all on public.campaigns for all to authenticated using(public.member_role(barbershop_id)='OWNER') with check(public.member_role(barbershop_id)='OWNER');
grant select,update(read_at) on public.notifications to authenticated; grant select on public.campaigns to authenticated;
grant insert(barbershop_id,created_by,title,body,audience,status),update(title,body,audience,status,published_at) on public.campaigns to authenticated;

create function public.publish_campaign(p_shop uuid,p_campaign uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.campaigns;
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 select * into c from public.campaigns where id=p_campaign and barbershop_id=p_shop for update;
 if c.id is null or c.status<>'draft' then raise exception 'INVALID_CAMPAIGN'; end if;
 update public.campaigns set status='published',published_at=now() where id=c.id;
 insert into public.notifications(barbershop_id,user_id,title,body)
 select p_shop,m.user_id,c.title,c.body from public.memberships m where m.barbershop_id=p_shop and m.active and (c.audience='ALL' or m.role=c.audience) and m.user_id<>auth.uid();
 insert into public.audit_events(barbershop_id,actor_id,action,target_id) values(p_shop,auth.uid(),'campaign.published',c.id);
end $$;
revoke execute on function public.publish_campaign(uuid,uuid) from public,anon; grant execute on function public.publish_campaign(uuid,uuid) to authenticated;
