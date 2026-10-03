begin;

create table if not exists public.account_phone_registry (
 user_id uuid primary key references auth.users(id) on delete cascade,
 phone_e164 text not null unique check(phone_e164 ~ '^55[0-9]{10,11}$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

alter table public.account_phone_registry enable row level security;
revoke all on public.account_phone_registry from anon,authenticated;

create or replace function fio_private.normalize_account_phone(p_phone text)
returns text
language plpgsql
immutable
security definer
set search_path=''
as $$
declare digits text;
begin
 digits:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 if length(digits) in (10,11) then digits:='55'||digits; end if;
 if digits !~ '^55[0-9]{10,11}$' then raise exception 'INVALID_PHONE'; end if;
 return digits;
end $$;

revoke all on function fio_private.normalize_account_phone(text) from public,anon,authenticated;

create or replace function public.claim_account_phone(p_phone text)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare normalized text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 normalized:=fio_private.normalize_account_phone(p_phone);
 begin
  insert into public.account_phone_registry(user_id,phone_e164)
  values(auth.uid(),normalized)
  on conflict(user_id) do update set phone_e164=excluded.phone_e164,updated_at=now();
 exception when unique_violation then
  raise exception 'PHONE_ALREADY_IN_USE';
 end;
 return normalized;
end $$;

revoke all on function public.claim_account_phone(text) from public,anon;
grant execute on function public.claim_account_phone(text) to authenticated;

-- Preserve existing accounts when possible without making this migration fail
-- on old duplicated/invalid contact data. Only unambiguous valid numbers are
-- backfilled; all future profile/onboarding writes go through the registry.
with raw as (
 select m.user_id,regexp_replace(coalesce(m.phone,''),'[^0-9]','','g') digits
 from public.memberships m
 where nullif(trim(coalesce(m.phone,'')),'') is not null
), normalized as (
 select user_id,
  case when length(digits) in (10,11) then '55'||digits else digits end phone_e164
 from raw
), valid as (
 select distinct user_id,phone_e164
 from normalized
 where phone_e164 ~ '^55[0-9]{10,11}$'
), one_per_user as (
 select user_id,min(phone_e164) phone_e164
 from valid
 group by user_id
 having count(distinct phone_e164)=1
), unambiguous as (
 select p.user_id,p.phone_e164
 from one_per_user p
 join (
  select phone_e164
  from one_per_user
  group by phone_e164
  having count(*)=1
 ) u using(phone_e164)
)
insert into public.account_phone_registry(user_id,phone_e164)
select user_id,phone_e164 from unambiguous
on conflict(user_id) do nothing;

create or replace function public.update_own_profile(p_shop uuid,p_display_name text,p_phone text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if public.member_role(p_shop) is null then raise exception 'FORBIDDEN'; end if;
 if length(trim(coalesce(p_display_name,''))) not between 2 and 100 then raise exception 'INVALID_DATA'; end if;
 if nullif(trim(coalesce(p_phone,'')),'') is not null then
  perform public.claim_account_phone(p_phone);
 end if;
 update public.memberships
 set display_name=trim(p_display_name),phone=nullif(trim(p_phone),'')
 where barbershop_id=p_shop and user_id=auth.uid() and active;
 update public.customers
 set name=trim(p_display_name),phone=nullif(trim(p_phone),'')
 where barbershop_id=p_shop and user_id=auth.uid();
end $$;

revoke all on function public.update_own_profile(uuid,text,text) from public,anon;
grant execute on function public.update_own_profile(uuid,text,text) to authenticated;

commit;
