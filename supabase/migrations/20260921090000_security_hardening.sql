-- Security hardening: make the Storage upload contract match the API/client contract.
-- Public branding and avatars are intentionally public because they are rendered in the client portal.
-- Feed media remains private and is accessed with short-lived signed URLs.
do $do$
begin
 if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then return; end if;

 update storage.buckets
 set file_size_limit=1572864, allowed_mime_types=array['image/webp']
 where id='profile-avatars';
 update storage.buckets
 set file_size_limit=5242880, allowed_mime_types=array['image/webp']
 where id='branding-assets';
 update storage.buckets
 set public=false,file_size_limit=8388608,allowed_mime_types=array['image/webp']
 where id='feed-posts';

 execute 'drop policy if exists profile_avatars_insert on storage.objects';
 execute 'create policy profile_avatars_insert on storage.objects for insert to authenticated with check (bucket_id=''profile-avatars'' and (storage.foldername(name))[1] is not null and (storage.foldername(name))[2]=auth.uid()::text and public.member_role(((storage.foldername(name))[1])::uuid) is not null and name ~ (''^''||(storage.foldername(name))[1]||''/''||auth.uid()::text||''/avatar-[0-9]{13}[.]webp$''))';

 execute 'drop policy if exists branding_assets_insert on storage.objects';
 execute 'create policy branding_assets_insert on storage.objects for insert to authenticated with check (bucket_id=''branding-assets'' and (storage.foldername(name))[1] is not null and (storage.foldername(name))[2]=auth.uid()::text and public.member_role(((storage.foldername(name))[1])::uuid)=''OWNER'' and name ~ (''^''||(storage.foldername(name))[1]||''/''||auth.uid()::text||''/(logo|cover|background|settings-(logo|cover|background))-[0-9]{13}[.]webp$''))';

 execute 'drop policy if exists feed_storage_insert on storage.objects';
 execute 'create policy feed_storage_insert on storage.objects for insert to authenticated with check (bucket_id=''feed-posts'' and (storage.foldername(name))[1] is not null and (storage.foldername(name))[2]=auth.uid()::text and public.member_role(((storage.foldername(name))[1])::uuid) in (''OWNER'',''BARBER'') and public.fio_feature_allowed(((storage.foldername(name))[1])::uuid,''feed'') and name ~ (''^''||(storage.foldername(name))[1]||''/''||auth.uid()::text||''/[0-9a-f-]{36}[.]webp$''))';
end $do$;
