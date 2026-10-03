-- FIO: publicação exige logo para garantir identidade própria no PWA do cliente.
-- Migration aditiva. Não edite a migration antiga já aplicada.

create or replace function public.activate_owner_onboarding(p_shop uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  p public.onboarding_progress;
  shop public.barbershops;
begin
  if public.member_role(p_shop) is distinct from 'OWNER' then
    raise exception 'FORBIDDEN';
  end if;

  select *
    into shop
    from public.barbershops
   where id=p_shop
   for update;

  select *
    into p
    from public.onboarding_progress
   where barbershop_id=p_shop;

  if shop.name is null
     or coalesce(shop.whatsapp,'')=''
     or not exists(
       select 1
         from public.services
        where barbershop_id=p_shop
          and active
     )
     or not exists(
       select 1
         from public.business_hours
        where barbershop_id=p_shop
     ) then
    raise exception 'ONBOARDING_INCOMPLETE';
  end if;

  if coalesce(shop.logo_asset_path,'')='' and coalesce(shop.logo_url,'')='' then
    raise exception 'SHOP_LOGO_REQUIRED';
  end if;

  update public.barbershops
     set onboarding_completed=true,
         onboarding_step=5
   where id=p_shop;

  insert into public.audit_events(
    barbershop_id,
    actor_id,
    action,
    target_id,
    description
  )
  values(
    p_shop,
    auth.uid(),
    'onboarding.activated',
    p_shop,
    'Barbearia ativada pelo responsável com identidade pronta para PWA'
  );
end
$$;

revoke all on function public.activate_owner_onboarding(uuid)
from public,anon,authenticated;

grant execute on function public.activate_owner_onboarding(uuid)
to authenticated;
