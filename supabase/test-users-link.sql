-- Execute SOMENTE depois que os três usuários já existirem em Authentication > Users.
-- Este SQL não grava nem altera senhas; senhas pertencem ao Supabase Auth.
do $$
declare
  v_owner uuid;
  v_barber uuid;
  v_client uuid;
  v_shop uuid;
begin
  select id into v_owner from auth.users where lower(email)=lower('2008kauapedro@gmail.com') limit 1;
  select id into v_barber from auth.users where lower(email)=lower('barbeiro.fio@example.com') limit 1;
  select id into v_client from auth.users where lower(email)=lower('cliente.fio@example.com') limit 1;

  if v_owner is null then raise exception 'Crie primeiro o usuário 2008kauapedro@gmail.com no Supabase Auth'; end if;
  if v_barber is null then raise exception 'Crie primeiro o usuário barbeiro.fio@example.com no Supabase Auth'; end if;
  if v_client is null then raise exception 'Crie primeiro o usuário cliente.fio@example.com no Supabase Auth'; end if;

  insert into public.barbershops(name,slug,timezone,public_title,public_description,accent_color)
  values('Barbearia FIO Teste','fio-teste','America/Sao_Paulo','Barbearia FIO Teste','Ambiente de testes do FIO.','#f2c94c')
  on conflict(slug) do update set name=excluded.name
  returning id into v_shop;

  insert into public.memberships(barbershop_id,user_id,role,display_name,phone,active)
  values
   (v_shop,v_owner,'OWNER','Pedro Kauã','61999999999',true),
   (v_shop,v_barber,'BARBER','Barbeiro FIO','61988888888',true),
   (v_shop,v_client,'CLIENT','Cliente FIO','61977777777',true)
  on conflict(barbershop_id,user_id) do update set role=excluded.role,display_name=excluded.display_name,phone=excluded.phone,active=true;

  insert into public.customers(barbershop_id,user_id,name,phone)
  values(v_shop,v_client,'Cliente FIO','61977777777')
  on conflict(barbershop_id,user_id) do update set name=excluded.name,phone=excluded.phone;

  insert into public.saas_subscriptions(barbershop_id,plan,status)
  values(v_shop,'PRO','active')
  on conflict(barbershop_id) do update set plan='PRO',status='active';
end $$;
