begin;

create or replace function public.transition_appointment(
 p_shop uuid,
 p_id uuid,
 p_status text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
 a public.appointments;
 r text;
 sub public.client_subscriptions;
begin

 r:=public.member_role(p_shop);

 select *
 into a
 from public.appointments
 where
  barbershop_id=p_shop
  and id=p_id
 for update;

 if
  a.id is null
  or r is null
  or (
   r='BARBER'
   and a.barber_id<>auth.uid()
  )
  or (
   r='CLIENT'
   and (
    not public.owns_customer(
     p_shop,
     a.client_id
    )
    or p_status<>'cancelled'
   )
  )
 then
  raise exception 'FORBIDDEN';
 end if;

 if
  r='CLIENT'
  and a.starts_at<
   now()+interval '2 hours'
 then
  raise exception 'CANCELLATION_WINDOW';
 end if;

 if
  p_status='cancelled'
  and a.status in (
   'scheduled',
   'confirmed'
  )
 then

  update public.appointments
  set
   status='cancelled',
   cancelled_at=now()
  where id=p_id;

 elsif
  p_status='confirmed'
  and a.status='scheduled'
  and r in ('OWNER','BARBER')
 then

  update public.appointments
  set status='confirmed'
  where id=p_id;

 elsif
  p_status='in_service'
  and a.status in (
   'scheduled',
   'confirmed'
  )
  and r in ('OWNER','BARBER')
 then

  if
   a.starts_at>
   now()+interval '30 minutes'
  then
   raise exception 'TOO_EARLY';
  end if;

  update public.appointments
  set status='in_service'
  where id=p_id;

 elsif
  p_status='completed'
  and a.status in (
   'scheduled',
   'confirmed',
   'in_service'
  )
  and r in ('OWNER','BARBER')
 then

  if a.starts_at>now() then
   raise exception 'TOO_EARLY';
  end if;

  if a.subscription_id is not null then

   select *
   into sub
   from public.client_subscriptions
   where
    id=a.subscription_id
    and barbershop_id=p_shop
   for update;

   if
    sub.id is null
    or sub.status<>'active'
    or sub.expires_at<a.starts_at
    or sub.remaining_cuts<=0
   then
    raise exception 'SUBSCRIPTION_UNAVAILABLE';
   end if;

   insert into public.subscription_usage(
    barbershop_id,
    subscription_id,
    appointment_id
   )
   values(
    p_shop,
    sub.id,
    p_id
   )
   on conflict(appointment_id)
   do nothing;

   if found then

    update public.client_subscriptions
    set
     remaining_cuts=
      remaining_cuts-1
    where id=sub.id;

   end if;

  end if;

  update public.appointments
  set
   status='completed',
   completed_at=now()
  where id=p_id;

 elsif
  p_status='no_show'
  and a.status in (
   'scheduled',
   'confirmed'
  )
  and r in ('OWNER','BARBER')
 then

  if a.starts_at>now() then
   raise exception 'TOO_EARLY';
  end if;

  update public.appointments
  set status='no_show'
  where id=p_id;

 else

  raise exception 'INVALID_TRANSITION';

 end if;

 insert into public.audit_events(
  barbershop_id,
  actor_id,
  action,
  target_id
 )
 values(
  p_shop,
  auth.uid(),
  'appointment.'||p_status,
  p_id
 );

end $$;

revoke all
on function public.transition_appointment(
 uuid,
 uuid,
 text
)
from public,anon;

grant execute
on function public.transition_appointment(
 uuid,
 uuid,
 text
)
to authenticated;

commit;