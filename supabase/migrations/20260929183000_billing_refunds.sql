-- Tracks refund requests for FIO SaaS subscriptions so the same paid transaction
-- cannot be refunded twice if the owner repeats the action.
create table if not exists public.syncpay_refund_requests (
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 subscription_token text not null check(length(subscription_token) between 8 and 200),
 transaction_reference_id text not null check(length(transaction_reference_id) between 8 and 200),
 refund_code text not null check(length(refund_code) between 4 and 100),
 status text not null check(length(status) between 1 and 80),
 requested_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(barbershop_id,subscription_token),
 unique(transaction_reference_id),
 unique(refund_code)
);

alter table public.syncpay_refund_requests enable row level security;
revoke all on public.syncpay_refund_requests from public,anon,authenticated;
grant all on public.syncpay_refund_requests to service_role;
