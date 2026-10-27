-- Free includes 1 family watch; Plus includes 4. The owner's own account is not counted.
create or replace function public.enforce_family_profile_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  slots int := 1;
  used int;
begin
  if public.is_family_profile(new.owner_id) then
    raise exception 'A family watch profile cannot add family watches.' using errcode = 'P0001';
  end if;
  if public.has_plus(new.owner_id) then slots := 4; end if;
  select count(*) into used from public.family_profiles f where f.owner_id = new.owner_id;
  if used >= slots then
    raise exception 'Family watch limit reached. MoodPals Free includes 1 family watch and Plus includes 4.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.enforce_family_profile_limit() from public, anon, authenticated;
