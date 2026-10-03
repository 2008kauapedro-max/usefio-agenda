begin;

-- Novos agendamentos entram confirmados automaticamente.
-- Registros antigos permanecem com o status atual.
alter table public.appointments
alter column status set default 'confirmed';

commit;