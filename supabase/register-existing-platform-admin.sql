-- Execute no SQL Editor do Supabase APÓS aplicar a nova migration.
-- Copie o User UID do usuário JÁ EXISTENTE em Authentication > Users.
-- Substitua os dois valores abaixo. Não cria usuário, senha ou membership.
insert into public.platform_admins (user_id, display_name, active)
values ('UUID_DO_USUARIO_AUTH_EXISTENTE'::uuid, 'Seu nome', true)
on conflict (user_id) do update
set display_name = excluded.display_name, active = true, updated_at = now();
