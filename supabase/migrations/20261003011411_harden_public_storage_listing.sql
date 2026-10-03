-- FIO: prevent bucket enumeration on public asset buckets.
-- Public object delivery remains available because the buckets themselves are public.
-- Some local PGlite test databases do not emulate Supabase Storage.

do $fio$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists branding_assets_read on storage.objects';
    execute 'drop policy if exists profile_avatars_read on storage.objects';
  end if;
end
$fio$;