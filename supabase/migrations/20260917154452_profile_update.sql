create or replace function public.update_own_profile(p_shop uuid,p_display_name text,p_phone text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if length(trim(coalesce(p_display_name,''))) not between 2 and 100 then raise exception 'INVALID_DATA'; end if;
 if nullif(trim(coalesce(p_phone,'')),'') is not null and trim(p_phone) !~ '^[+]?[0-9 ()-]{8,24}$' then raise exception 'INVALID_DATA'; end if;
 update public.memberships set display_name=trim(p_display_name),phone=nullif(trim(p_phone),'') where barbershop_id=p_shop and user_id=auth.uid() and active;
 if not found then raise exception 'FORBIDDEN'; end if;
end $$;
revoke all on function public.update_own_profile(uuid,text,text) from public,anon;
grant execute on function public.update_own_profile(uuid,text,text) to authenticated;;
