-- FIO experience layer: contact data, public branding and post-service reviews.
alter table public.memberships add column if not exists phone text;
alter table public.customers add column if not exists phone text;

alter table public.barbershops add column if not exists public_title text;
alter table public.barbershops add column if not exists public_description text;
alter table public.barbershops add column if not exists logo_url text;
alter table public.barbershops add column if not exists cover_url text;

alter table public.memberships drop constraint if exists memberships_phone_format;
alter table public.memberships add constraint memberships_phone_format check(phone is null or phone ~ '^\\+?[0-9 ()-]{8,24}$');
alter table public.customers drop constraint if exists customers_phone_format;
alter table public.customers add constraint customers_phone_format check(phone is null or phone ~ '^\\+?[0-9 ()-]{8,24}$');

create table if not exists public.reviews (
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id),
 appointment_id uuid not null,
 client_id uuid not null,
 barber_id uuid not null,
 rating integer not null check(rating between 1 and 5),
 comment text check(comment is null or length(comment) <= 1000),
 created_at timestamptz not null default now(),
 unique(barbershop_id,appointment_id),
 foreign key(barbershop_id,appointment_id) references public.appointments(barbershop_id,id),
 foreign key(barbershop_id,client_id) references public.customers(barbershop_id,id),
 foreign key(barbershop_id,barber_id) references public.memberships(barbershop_id,user_id)
);

create index if not exists reviews_barber_recent on public.reviews(barbershop_id,barber_id,created_at desc);
create index if not exists reviews_client_recent on public.reviews(barbershop_id,client_id,created_at desc);

alter table public.reviews enable row level security;

drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select to authenticated using(
 public.member_role(barbershop_id)='OWNER'
 or (public.member_role(barbershop_id)='BARBER' and barber_id=auth.uid())
 or (public.member_role(barbershop_id)='CLIENT' and public.owns_customer(barbershop_id,client_id))
);

revoke all on public.reviews from anon,authenticated;
grant select on public.reviews to authenticated;

grant update(phone) on public.memberships to authenticated;
grant update(phone) on public.customers to authenticated;
grant insert(barbershop_id,name,phone) on public.customers to authenticated;

create or replace function public.update_own_contact(p_shop uuid,p_phone text) returns void
language plpgsql security definer set search_path='' as $$
declare r text; clean text;
begin
 r := public.member_role(p_shop);
 if r is null then raise exception 'FORBIDDEN'; end if;
 clean := nullif(trim(coalesce(p_phone,'')),'');
 if clean is not null and clean !~ '^\\+?[0-9 ()-]{8,24}$' then raise exception 'INVALID_PHONE'; end if;
 update public.memberships set phone=clean where barbershop_id=p_shop and user_id=auth.uid();
 if r='CLIENT' then
  update public.customers set phone=clean where barbershop_id=p_shop and user_id=auth.uid();
 end if;
end $$;

create or replace function public.update_shop_branding(
 p_shop uuid,
 p_title text,
 p_description text,
 p_logo_url text,
 p_cover_url text
) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 update public.barbershops set
  public_title=nullif(trim(coalesce(p_title,'')),''),
  public_description=nullif(trim(coalesce(p_description,'')),''),
  logo_url=nullif(trim(coalesce(p_logo_url,'')),''),
  cover_url=nullif(trim(coalesce(p_cover_url,'')),'')
 where id=p_shop;
end $$;

create or replace function public.submit_review(
 p_shop uuid,
 p_appointment uuid,
 p_rating integer,
 p_comment text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.appointments; review_id uuid;
begin
 if public.member_role(p_shop) is distinct from 'CLIENT' then raise exception 'FORBIDDEN'; end if;
 if p_rating<1 or p_rating>5 then raise exception 'INVALID_RATING'; end if;
 select * into a from public.appointments where barbershop_id=p_shop and id=p_appointment for update;
 if a.id is null or a.status<>'completed' or not public.owns_customer(p_shop,a.client_id) then raise exception 'INVALID_APPOINTMENT'; end if;
 insert into public.reviews(barbershop_id,appointment_id,client_id,barber_id,rating,comment)
 values(p_shop,a.id,a.client_id,a.barber_id,p_rating,nullif(trim(coalesce(p_comment,'')),''))
 returning id into review_id;
 return review_id;
exception when unique_violation then
 raise exception 'ALREADY_REVIEWED';
end $$;

revoke all on function public.update_own_contact(uuid,text) from public,anon;
grant execute on function public.update_own_contact(uuid,text) to authenticated;
revoke all on function public.update_shop_branding(uuid,text,text,text,text) from public,anon;
grant execute on function public.update_shop_branding(uuid,text,text,text,text) to authenticated;
revoke all on function public.submit_review(uuid,uuid,integer,text) from public,anon;
grant execute on function public.submit_review(uuid,uuid,integer,text) to authenticated;
