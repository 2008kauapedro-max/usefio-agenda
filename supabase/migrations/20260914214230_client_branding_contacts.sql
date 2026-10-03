-- FIO: contatos entre participantes e personalização visual do app do cliente.
alter table public.barbershops add column if not exists background_url text;
alter table public.barbershops add column if not exists accent_color text not null default '#ffffff';
alter table public.barbershops drop constraint if exists barbershops_accent_color_format;
alter table public.barbershops add constraint barbershops_accent_color_format check(accent_color ~ '^#[0-9A-Fa-f]{6}$');

-- Clientes autenticados podem visualizar o contato da equipe (dono + barbeiros) da própria barbearia.
drop policy if exists memberships_read on public.memberships;
create policy memberships_read on public.memberships for select to authenticated using(
 public.member_role(barbershop_id) is not null
 and (user_id=auth.uid() or role in ('OWNER','BARBER') or public.member_role(barbershop_id)='OWNER')
);

drop function if exists public.update_shop_branding(uuid,text,text,text,text);
create or replace function public.update_shop_branding(
 p_shop uuid, p_title text, p_description text, p_logo_url text, p_cover_url text, p_background_url text, p_accent_color text
) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 if coalesce(p_accent_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_ACCENT_COLOR'; end if;
 update public.barbershops set
  public_title=nullif(trim(coalesce(p_title,'')),''),
  public_description=nullif(trim(coalesce(p_description,'')),''),
  logo_url=nullif(trim(coalesce(p_logo_url,'')),''),
  cover_url=nullif(trim(coalesce(p_cover_url,'')),''),
  background_url=nullif(trim(coalesce(p_background_url,'')),''),
  accent_color=lower(p_accent_color)
 where id=p_shop;
end $$;
revoke all on function public.update_shop_branding(uuid,text,text,text,text,text,text) from public,anon;
grant execute on function public.update_shop_branding(uuid,text,text,text,text,text,text) to authenticated;;
