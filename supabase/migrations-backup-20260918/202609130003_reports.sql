create function public.weekly_revenue(p_shop uuid) returns bigint language plpgsql stable security definer set search_path='' as $$
declare zone text; total bigint;
begin
 if public.member_role(p_shop) is distinct from 'OWNER' then raise exception 'FORBIDDEN'; end if;
 select timezone into zone from public.barbershops where id=p_shop;
 select coalesce(sum(amount_cents),0) into total from public.payments where barbershop_id=p_shop and created_at >= (date_trunc('week',now() at time zone zone) at time zone zone) and created_at<=now();
 return total;
end $$;
revoke all on function public.weekly_revenue(uuid) from public,anon;
grant execute on function public.weekly_revenue(uuid) to authenticated;
