create table public.feed_posts (
 id uuid primary key default gen_random_uuid(), barbershop_id uuid not null references public.barbershops(id),
 author_id uuid not null references auth.users(id), author_name text not null check(length(author_name) between 2 and 100),
 caption text not null default '' check(length(caption) <= 500), image_path text not null check(length(image_path) between 5 and 500),
 created_at timestamptz not null default now(), unique(barbershop_id,id),
 foreign key(barbershop_id,author_id) references public.memberships(barbershop_id,user_id)
);
create index feed_posts_recent on public.feed_posts(barbershop_id,created_at desc);
alter table public.feed_posts enable row level security;
create policy feed_posts_read on public.feed_posts for select to authenticated using(public.member_role(barbershop_id) is not null);
create policy feed_posts_insert on public.feed_posts for insert to authenticated with check(author_id=auth.uid() and public.member_role(barbershop_id) in ('OWNER','BARBER'));
create policy feed_posts_delete on public.feed_posts for delete to authenticated using(author_id=auth.uid() or public.member_role(barbershop_id)='OWNER');
revoke all on public.feed_posts from anon,authenticated;
grant select on public.feed_posts to authenticated;
grant insert(barbershop_id,author_id,author_name,caption,image_path) on public.feed_posts to authenticated;
grant delete on public.feed_posts to authenticated;
do $do$
begin
 if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
  execute 'insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values (''feed-posts'',''feed-posts'',false,8388608,array[''image/jpeg'',''image/png'',''image/webp'']) on conflict (id) do update set public=false,file_size_limit=8388608,allowed_mime_types=excluded.allowed_mime_types';
  execute 'create policy feed_storage_read on storage.objects for select to authenticated using(bucket_id=''feed-posts'' and public.member_role(((storage.foldername(name))[1])::uuid) is not null)';
  execute 'create policy feed_storage_insert on storage.objects for insert to authenticated with check(bucket_id=''feed-posts'' and (storage.foldername(name))[1] is not null and (storage.foldername(name))[2]=auth.uid()::text and public.member_role(((storage.foldername(name))[1])::uuid) in (''OWNER'',''BARBER''))';
  execute 'create policy feed_storage_delete on storage.objects for delete to authenticated using(bucket_id=''feed-posts'' and (storage.foldername(name))[1] is not null and ((storage.foldername(name))[2]=auth.uid()::text or public.member_role(((storage.foldername(name))[1])::uuid)=''OWNER''))';
 end if;
end $do$;;
