-- FIO MVP — idioma, região e moeda preferidos por usuário dentro da barbearia.
-- O FIO usa public.memberships (chave composta barbershop_id + user_id).

alter table public.memberships
  add column if not exists preferred_locale text not null default 'pt-BR',
  add column if not exists preferred_region text not null default 'BR',
  add column if not exists preferred_currency text not null default 'BRL',
  add column if not exists locale_preference_set boolean not null default false;

alter table public.memberships drop constraint if exists memberships_preferred_locale_check;
alter table public.memberships add constraint memberships_preferred_locale_check
  check (preferred_locale in ('pt-BR','en','es','fr','de','it'));

alter table public.memberships drop constraint if exists memberships_preferred_region_check;
alter table public.memberships add constraint memberships_preferred_region_check
  check (preferred_region ~ '^[A-Z]{2}$');

alter table public.memberships drop constraint if exists memberships_preferred_currency_check;
alter table public.memberships add constraint memberships_preferred_currency_check
  check (preferred_currency in ('BRL','USD','EUR','GBP','MXN','ARS'));

comment on column public.memberships.preferred_locale is
  'Idioma preferido da interface e da IA: pt-BR, en, es, fr, de ou it.';
comment on column public.memberships.preferred_region is
  'Região ISO 3166-1 alpha-2 usada para preferências e formatação.';
comment on column public.memberships.preferred_currency is
  'Moeda preferida de exibição. O checkout pode continuar limitado à moeda do provedor.';

create or replace function public.set_locale_preferences(
  p_shop uuid,
  p_locale text,
  p_region text,
  p_currency text
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_locale not in ('pt-BR','en','es','fr','de','it')
     or p_region !~ '^[A-Z]{2}$'
     or p_currency not in ('BRL','USD','EUR','GBP','MXN','ARS') then
    raise exception 'INVALID_DATA' using errcode='22023';
  end if;

  update public.memberships
     set preferred_locale=p_locale,
         preferred_region=p_region,
         preferred_currency=p_currency,
         locale_preference_set=true
   where barbershop_id=p_shop
     and user_id=auth.uid()
     and active;

  if not found then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
end $$;

revoke all on function public.set_locale_preferences(uuid,text,text,text) from public,anon;
grant execute on function public.set_locale_preferences(uuid,text,text,text) to authenticated;

-- Localize appointment notifications and push deliveries using each membership preference.
create or replace function fio_private.appointment_notice()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  kind text;
  recipient record;
  stamp timestamptz:=clock_timestamp();
  notice_title text;
  notice_body text;
begin
  if tg_op='INSERT' then kind:='created';
  elsif new.starts_at is distinct from old.starts_at or new.barber_id is distinct from old.barber_id then kind:='rescheduled';
  elsif new.status is distinct from old.status then kind:=new.status;
  else return new;
  end if;

  for recipient in
    select distinct m.user_id,coalesce(m.preferred_locale,'pt-BR') as preferred_locale
    from public.memberships m
    where m.barbershop_id=new.barbershop_id
      and m.active
      and (
        m.role='OWNER'
        or m.user_id=new.barber_id
        or (tg_op='UPDATE' and m.user_id=old.barber_id)
        or exists(
          select 1 from public.customers c
          where c.barbershop_id=new.barbershop_id
            and c.id=new.client_id
            and c.user_id=m.user_id
        )
      )
  loop
    notice_title:=case recipient.preferred_locale
      when 'en' then 'Schedule update'
      when 'es' then 'Actualización de agenda'
      when 'fr' then 'Mise à jour du planning'
      when 'de' then 'Terminplan aktualisiert'
      when 'it' then 'Aggiornamento agenda'
      else 'Atualização na agenda'
    end;

    notice_body:=case recipient.preferred_locale
      when 'en' then case kind when 'created' then 'An appointment was created.' when 'rescheduled' then 'An appointment was rescheduled.' when 'cancelled' then 'An appointment was cancelled.' when 'confirmed' then 'An appointment was confirmed.' else 'An appointment status changed.' end
      when 'es' then case kind when 'created' then 'Se creó una cita.' when 'rescheduled' then 'Se reprogramó una cita.' when 'cancelled' then 'Se canceló una cita.' when 'confirmed' then 'Se confirmó una cita.' else 'Cambió el estado de una cita.' end
      when 'fr' then case kind when 'created' then 'Un rendez-vous a été créé.' when 'rescheduled' then 'Un rendez-vous a été reprogrammé.' when 'cancelled' then 'Un rendez-vous a été annulé.' when 'confirmed' then 'Un rendez-vous a été confirmé.' else 'Le statut d’un rendez-vous a changé.' end
      when 'de' then case kind when 'created' then 'Ein Termin wurde erstellt.' when 'rescheduled' then 'Ein Termin wurde verschoben.' when 'cancelled' then 'Ein Termin wurde storniert.' when 'confirmed' then 'Ein Termin wurde bestätigt.' else 'Der Status eines Termins hat sich geändert.' end
      when 'it' then case kind when 'created' then 'È stato creato un appuntamento.' when 'rescheduled' then 'Un appuntamento è stato riprogrammato.' when 'cancelled' then 'Un appuntamento è stato annullato.' when 'confirmed' then 'Un appuntamento è stato confermato.' else 'Lo stato di un appuntamento è cambiato.' end
      else case kind when 'created' then 'Um agendamento foi criado.' when 'rescheduled' then 'Um agendamento foi remarcado.' when 'cancelled' then 'Um agendamento foi cancelado.' when 'confirmed' then 'Um agendamento foi confirmado.' else 'O status de um atendimento mudou.' end
    end;

    insert into public.notifications(barbershop_id,user_id,title,body,appointment_id)
    values(new.barbershop_id,recipient.user_id,notice_title,notice_body,new.id);

    insert into fio_private.appointment_push_queue(barbershop_id,appointment_id,user_id,kind,version)
    values(new.barbershop_id,new.id,recipient.user_id,kind,stamp)
    on conflict do nothing;
  end loop;
  return new;
end $$;

revoke all on function fio_private.appointment_notice() from public,anon,authenticated;

create or replace function public.claim_appointment_push()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare result jsonb;
begin
  delete from fio_private.appointment_push_deliveries
   where queue_id in(select id from fio_private.appointment_push_queue where due_at<now()-interval '7 days');
  delete from fio_private.appointment_push_queue where due_at<now()-interval '7 days';

  with added as (
    insert into fio_private.appointment_push_queue(barbershop_id,appointment_id,user_id,kind,version)
    select a.barbershop_id,a.id,m.user_id,'reminder',a.starts_at
    from public.appointments a
    join public.memberships m on m.barbershop_id=a.barbershop_id and m.active
    where a.status in ('scheduled','confirmed')
      and a.starts_at>now()
      and a.starts_at<=now()+interval '24 hours'
      and (
        m.user_id=a.barber_id
        or exists(
          select 1 from public.customers c
          where c.barbershop_id=a.barbershop_id
            and c.id=a.client_id
            and c.user_id=m.user_id
        )
      )
    on conflict do nothing
    returning *
  )
  insert into public.notifications(barbershop_id,user_id,title,body,appointment_id)
  select x.barbershop_id,x.user_id,
    case coalesce(m.preferred_locale,'pt-BR')
      when 'en' then 'Appointment reminder'
      when 'es' then 'Recordatorio de cita'
      when 'fr' then 'Rappel de rendez-vous'
      when 'de' then 'Terminerinnerung'
      when 'it' then 'Promemoria appuntamento'
      else 'Lembrete de agendamento'
    end,
    case coalesce(m.preferred_locale,'pt-BR')
      when 'en' then 'You have an appointment in the next 24 hours. Check your schedule.'
      when 'es' then 'Tienes una cita en las próximas 24 horas. Consulta tu agenda.'
      when 'fr' then 'Vous avez un rendez-vous dans les prochaines 24 heures. Consultez votre planning.'
      when 'de' then 'Du hast in den nächsten 24 Stunden einen Termin. Prüfe deinen Terminplan.'
      when 'it' then 'Hai un appuntamento nelle prossime 24 ore. Controlla la tua agenda.'
      else 'Você tem um horário nas próximas 24 horas. Consulte a agenda.'
    end,
    x.appointment_id
  from added x
  join public.memberships m on m.barbershop_id=x.barbershop_id and m.user_id=x.user_id;

  insert into fio_private.appointment_push_deliveries(queue_id,device_id)
  select q.id,d.id
  from fio_private.appointment_push_queue q
  join public.appointment_push_devices d on d.barbershop_id=q.barbershop_id and d.user_id=q.user_id and d.enabled
  join public.memberships m on m.barbershop_id=d.barbershop_id and m.user_id=d.user_id and m.active
  join public.appointments a on a.id=q.appointment_id and a.barbershop_id=q.barbershop_id
  where q.due_at<=now() and q.due_at>now()-interval '1 day'
    and ((q.kind='reminder' and d.reminders and a.starts_at=q.version and a.starts_at>now() and a.status in ('scheduled','confirmed')) or (q.kind<>'reminder' and d.changes))
  on conflict do nothing;

  with candidates as (
    select d.queue_id,d.device_id
    from fio_private.appointment_push_deliveries d
    join fio_private.appointment_push_queue q on q.id=d.queue_id
    join public.appointment_push_devices v on v.id=d.device_id and v.enabled
    join public.memberships m on m.barbershop_id=v.barbershop_id and m.user_id=v.user_id and m.active
    join public.appointments a on a.id=q.appointment_id
    where d.attempts<3
      and (d.status in ('pending','failed') or (d.status='sending' and d.claimed_at<now()-interval '5 minutes'))
      and (d.claimed_at is null or d.claimed_at<now()-interval '1 minute')
      and q.due_at>now()-interval '1 day'
      and ((q.kind='reminder' and v.reminders and a.starts_at=q.version and a.starts_at>now() and a.status in ('scheduled','confirmed')) or (q.kind<>'reminder' and v.changes))
    order by q.due_at
    limit 100
    for update of d skip locked
  ), claimed as (
    update fio_private.appointment_push_deliveries d
       set status='sending',attempts=attempts+1,claimed_at=clock_timestamp()
      from candidates c
     where d.queue_id=c.queue_id and d.device_id=c.device_id
    returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'queueId',c.queue_id,
    'deviceId',c.device_id,
    'endpoint',v.endpoint,
    'keys',v.keys,
    'tag','fio-appointment-'||q.appointment_id::text,
    'url','/'||lower(m.role)||'/agenda?appointment='||q.appointment_id::text||'&shopId='||q.barbershop_id::text,
    'kind',q.kind,
    'locale',coalesce(m.preferred_locale,'pt-BR')
  )),'[]'::jsonb) into result
  from claimed c
  join fio_private.appointment_push_queue q on q.id=c.queue_id
  join public.appointment_push_devices v on v.id=c.device_id
  join public.memberships m on m.user_id=v.user_id and m.barbershop_id=v.barbershop_id;

  return result;
end $$;

revoke all on function public.claim_appointment_push() from public,anon,authenticated;
grant execute on function public.claim_appointment_push() to service_role;
