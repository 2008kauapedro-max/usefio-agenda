-- FIO now manages appointments and cut packages, not shop payment collection.
-- Retain historical receipts for the database owner; remove every app access path.
-- SaaS billing tables, SyncPay webhooks and subscription permissions are unchanged.
begin;
revoke all privileges on table public.payments from public, anon, authenticated, service_role;
revoke all privileges on function public.record_payment(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all privileges on function public.weekly_revenue(uuid) from public, anon, authenticated, service_role;
drop function if exists public.record_payment(uuid,uuid,text);
drop function if exists public.weekly_revenue(uuid);
drop policy if exists payments_read on public.payments;
drop policy if exists platform_read on public.payments;
comment on table public.payments is 'Archived shop receipts. Retired from FIO; database-owner access only. Not SaaS billing.';
commit;
