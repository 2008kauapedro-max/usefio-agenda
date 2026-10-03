-- FIO: architecture for safe auth.users deletion
-- Prepared from live schema inspection on 2026-10-03.
-- This migration is NOT the test-account cleanup. It fixes future account deletions.

begin;

-- ---------------------------------------------------------------------------
-- 1) Historical rows that must survive user deletion become nullable.
-- ---------------------------------------------------------------------------

alter table public.appointments
  alter column created_by drop not null,
  alter column barber_id drop not null;

alter table public.reviews
  alter column barber_id drop not null;

alter table public.audit_events
  alter column actor_id drop not null;

alter table public.saas_provider_subscriptions
  alter column terms_accepted_by drop not null;

alter table public.syncpay_enrollment_intents
  alter column actor_user_id drop not null;

alter table public.syncpay_plan_changes
  alter column actor drop not null;

alter table public.syncpay_refund_requests
  alter column created_by drop not null;

alter table public.campaigns
  alter column created_by drop not null;

-- ---------------------------------------------------------------------------
-- 2) Dependencies of memberships.
--    Deleting a user can delete their membership without erasing important
--    appointment/review history.
-- ---------------------------------------------------------------------------

alter table public.appointments
  drop constraint if exists appointments_barbershop_id_barber_id_fkey,
  add constraint appointments_barbershop_id_barber_id_fkey
    foreign key (barbershop_id, barber_id)
    references public.memberships(barbershop_id, user_id)
    on delete set null (barber_id);

alter table public.reviews
  drop constraint if exists reviews_barbershop_id_barber_id_fkey,
  add constraint reviews_barbershop_id_barber_id_fkey
    foreign key (barbershop_id, barber_id)
    references public.memberships(barbershop_id, user_id)
    on delete set null (barber_id);

alter table public.feed_posts
  drop constraint if exists feed_posts_barbershop_id_author_id_fkey,
  add constraint feed_posts_barbershop_id_author_id_fkey
    foreign key (barbershop_id, author_id)
    references public.memberships(barbershop_id, user_id)
    on delete cascade;

alter table public.staff_blocks
  drop constraint if exists staff_blocks_barbershop_id_barber_id_fkey,
  add constraint staff_blocks_barbershop_id_barber_id_fkey
    foreign key (barbershop_id, barber_id)
    references public.memberships(barbershop_id, user_id)
    on delete cascade;

alter table public.staff_hours
  drop constraint if exists staff_hours_barbershop_id_barber_id_fkey,
  add constraint staff_hours_barbershop_id_barber_id_fkey
    foreign key (barbershop_id, barber_id)
    references public.memberships(barbershop_id, user_id)
    on delete cascade;

alter table public.staff_service_rules
  drop constraint if exists staff_service_rules_barbershop_id_barber_id_fkey,
  add constraint staff_service_rules_barbershop_id_barber_id_fkey
    foreign key (barbershop_id, barber_id)
    references public.memberships(barbershop_id, user_id)
    on delete cascade;

alter table public.appointment_push_devices
  drop constraint if exists appointment_push_devices_barbershop_id_user_id_fkey,
  add constraint appointment_push_devices_barbershop_id_user_id_fkey
    foreign key (barbershop_id, user_id)
    references public.memberships(barbershop_id, user_id)
    on delete cascade;

alter table fio_private.appointment_push_deliveries
  drop constraint if exists appointment_push_deliveries_device_id_fkey,
  add constraint appointment_push_deliveries_device_id_fkey
    foreign key (device_id)
    references public.appointment_push_devices(id)
    on delete cascade,
  drop constraint if exists appointment_push_deliveries_queue_id_fkey,
  add constraint appointment_push_deliveries_queue_id_fkey
    foreign key (queue_id)
    references fio_private.appointment_push_queue(id)
    on delete cascade;

-- ---------------------------------------------------------------------------
-- 3) auth.users relations.
--
-- CASCADE = identity-bound/ephemeral data.
-- SET NULL = keep business/audit/financial history without blocking deletion.
-- ---------------------------------------------------------------------------

alter table public.memberships
  drop constraint if exists memberships_user_id_fkey,
  add constraint memberships_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.appointments
  drop constraint if exists appointments_created_by_fkey,
  add constraint appointments_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.assistant_conversations
  drop constraint if exists assistant_conversations_user_id_fkey,
  add constraint assistant_conversations_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.assistant_usage
  drop constraint if exists assistant_usage_user_id_fkey,
  add constraint assistant_usage_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.audit_events
  drop constraint if exists audit_events_actor_id_fkey,
  add constraint audit_events_actor_id_fkey
    foreign key (actor_id) references auth.users(id) on delete set null,
  drop constraint if exists audit_events_actor_user_id_fkey,
  add constraint audit_events_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete set null;

alter table public.customers
  drop constraint if exists customers_user_id_fkey,
  add constraint customers_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

alter table public.feed_posts
  drop constraint if exists feed_posts_author_id_fkey,
  add constraint feed_posts_author_id_fkey
    foreign key (author_id) references auth.users(id) on delete cascade;

alter table public.invitations
  drop constraint if exists invitations_created_by_fkey,
  add constraint invitations_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete cascade;

alter table public.onboarding_progress
  drop constraint if exists onboarding_progress_owner_id_fkey,
  add constraint onboarding_progress_owner_id_fkey
    foreign key (owner_id) references auth.users(id) on delete cascade;

alter table public.platform_admins
  drop constraint if exists platform_admins_user_id_fkey,
  add constraint platform_admins_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.platform_ai_usage
  drop constraint if exists platform_ai_usage_actor_fkey,
  add constraint platform_ai_usage_actor_fkey
    foreign key (actor) references auth.users(id) on delete cascade;

alter table public.platform_alerts
  drop constraint if exists platform_alerts_resolved_by_fkey,
  add constraint platform_alerts_resolved_by_fkey
    foreign key (resolved_by) references auth.users(id) on delete set null;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_user_id_fkey,
  add constraint push_subscriptions_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.saas_provider_subscriptions
  drop constraint if exists saas_provider_subscriptions_terms_accepted_by_fkey,
  add constraint saas_provider_subscriptions_terms_accepted_by_fkey
    foreign key (terms_accepted_by) references auth.users(id) on delete set null;

alter table public.syncpay_enrollment_intents
  drop constraint if exists syncpay_enrollment_intents_actor_user_id_fkey,
  add constraint syncpay_enrollment_intents_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete set null;

alter table public.syncpay_plan_changes
  drop constraint if exists syncpay_plan_changes_actor_fkey,
  add constraint syncpay_plan_changes_actor_fkey
    foreign key (actor) references auth.users(id) on delete set null;

alter table public.syncpay_refund_requests
  drop constraint if exists syncpay_refund_requests_created_by_fkey,
  add constraint syncpay_refund_requests_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table fio_private.ai_proposals
  drop constraint if exists ai_proposals_actor_fkey,
  add constraint ai_proposals_actor_fkey
    foreign key (actor) references auth.users(id) on delete cascade;

-- Already CASCADE in the live schema and intentionally left as-is:
-- public.account_phone_registry.user_id
-- public.support_feedback.user_id

-- ---------------------------------------------------------------------------
-- 4) User-id columns discovered without a direct auth.users FK.
-- ---------------------------------------------------------------------------

alter table public.campaigns
  add constraint campaigns_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.notifications
  add constraint notifications_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table fio_private.appointment_push_queue
  add constraint appointment_push_queue_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

-- assistant_messages.user_id is intentionally not given a second direct FK:
-- its composite FK to assistant_conversations already guarantees identity
-- consistency, and assistant_messages cascades when a conversation is deleted.

-- ---------------------------------------------------------------------------
-- 5) Safety net: if the last OWNER membership disappears (including via an
--    auth.users CASCADE), do not leave an ownerless shop active.
-- ---------------------------------------------------------------------------

create or replace function public.fio_suspend_shop_without_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'OWNER'
     and not exists (
       select 1
       from public.memberships m
       where m.barbershop_id = old.barbershop_id
         and m.role = 'OWNER'
         and m.active = true
     )
  then
    update public.barbershops
       set platform_status = 'suspended'
     where id = old.barbershop_id
       and platform_status <> 'suspended';
  end if;

  return old;
end;
$$;

revoke all on function public.fio_suspend_shop_without_owner() from public;
revoke all on function public.fio_suspend_shop_without_owner() from anon;
revoke all on function public.fio_suspend_shop_without_owner() from authenticated;

drop trigger if exists trg_fio_suspend_shop_without_owner on public.memberships;

create trigger trg_fio_suspend_shop_without_owner
after delete on public.memberships
for each row
execute function public.fio_suspend_shop_without_owner();

-- ---------------------------------------------------------------------------
-- 6) Migration assertions.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_class rc on rc.oid = con.confrelid
    join pg_namespace rn on rn.oid = rc.relnamespace
    where con.contype = 'f'
      and n.nspname in ('public','fio_private')
      and rn.nspname = 'auth'
      and rc.relname = 'users'
      and con.confdeltype in ('a','r')
  ) then
    raise exception 'FIO migration aborted: restrictive auth.users FK remains';
  end if;
end
$$;

commit;
