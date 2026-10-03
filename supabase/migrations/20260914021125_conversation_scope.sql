alter table public.assistant_conversations add column scope_role text not null default 'LEGACY'
 check(scope_role in ('OWNER','BARBER','CLIENT','LEGACY'));
create function public.assign_conversation_scope() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'FORBIDDEN'; end if;
 new.scope_role := public.member_role(new.barbershop_id);
 if new.scope_role is null then raise exception 'FORBIDDEN'; end if;
 return new;
end $$;
revoke all on function public.assign_conversation_scope() from public,anon,authenticated;
create trigger conversation_scope before insert on public.assistant_conversations
 for each row execute function public.assign_conversation_scope();
drop policy conversation_read on public.assistant_conversations;
create policy conversation_read on public.assistant_conversations for select to authenticated
 using(user_id=auth.uid() and scope_role=public.member_role(barbershop_id));
drop policy message_read on public.assistant_messages;
create policy message_read on public.assistant_messages for select to authenticated
 using(user_id=auth.uid() and exists(
  select 1 from public.assistant_conversations c
  where c.id=conversation_id and c.barbershop_id=assistant_messages.barbershop_id
  and c.user_id=auth.uid() and c.scope_role=public.member_role(c.barbershop_id)
 ));;
