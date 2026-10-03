-- Atualizações de agenda em tempo real para clientes, barbeiros e responsáveis.
-- As policies RLS existentes continuam definindo quais linhas cada usuário pode receber.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'appointments'
     ) then
    execute 'alter publication supabase_realtime add table public.appointments';
  end if;
end
$$;
