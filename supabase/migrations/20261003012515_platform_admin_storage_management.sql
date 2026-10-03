-- Allow authenticated active FIO platform administrators to inspect and
-- remove objects from the three application-managed buckets.
-- Public anonymous bucket enumeration remains disabled.
-- Some local PGlite test databases do not emulate Supabase Storage.

do $fio$
begin
  if to_regclass('storage.objects') is not null then

    execute 'drop policy if exists platform_admin_storage_read on storage.objects';

    execute $policy$
      create policy platform_admin_storage_read
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id in ('branding-assets','feed-posts','profile-avatars')
        and exists (
          select 1
          from public.platform_admins pa
          where pa.user_id = (select auth.uid())
            and pa.active = true
        )
      )
    $policy$;

    execute 'drop policy if exists platform_admin_storage_delete on storage.objects';

    execute $policy$
      create policy platform_admin_storage_delete
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id in ('branding-assets','feed-posts','profile-avatars')
        and exists (
          select 1
          from public.platform_admins pa
          where pa.user_id = (select auth.uid())
            and pa.active = true
        )
      )
    $policy$;

  end if;
end
$fio$;