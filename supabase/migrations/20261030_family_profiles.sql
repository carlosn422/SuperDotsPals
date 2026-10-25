-- Family Watches: mood-only sub-profiles owned by a primary account.
-- Each sub-profile is its own auth user, so all profile-owned rows cascade on delete.
create table if not exists public.family_profiles(
  profile_user_id uuid primary key references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null default 'Apple Watch' check (char_length(device_name) between 1 and 80),
  created_at timestamptz not null default now(),
  check (profile_user_id <> owner_id)
);
create index if not exists family_profiles_owner_idx on public.family_profiles(owner_id);
alter table public.family_profiles enable row level security;
drop policy if exists "Owners read their family profiles" on public.family_profiles;
create policy "Owners read their family profiles" on public.family_profiles
  for select to authenticated using ((select auth.uid()) = owner_id or (select auth.uid()) = profile_user_id);

-- Removed profile ids (no personal data) so removal stays idempotent and stale watches stay revoked.
create table if not exists public.family_profile_removals(
  profile_user_id uuid primary key,
  owner_id uuid not null,
  removed_at timestamptz not null default now()
);
alter table public.family_profile_removals enable row level security;

create or replace function public.is_family_profile(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.family_profiles f where f.profile_user_id = uid)
$$;
revoke all on function public.is_family_profile(uuid) from public, anon;
grant execute on function public.is_family_profile(uuid) to authenticated;

-- Free includes 1 family watch; Plus includes 5. Sub-profiles cannot own family watches.
create or replace function public.enforce_family_profile_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  slots int := 1;
  used int;
begin
  if public.is_family_profile(new.owner_id) then
    raise exception 'A family watch profile cannot add family watches.' using errcode = 'P0001';
  end if;
  if public.has_plus(new.owner_id) then slots := 5; end if;
  select count(*) into used from public.family_profiles f where f.owner_id = new.owner_id;
  if used >= slots then
    raise exception 'Family watch limit reached. MoodPals Free includes 1 family watch and Plus includes 5.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.enforce_family_profile_limit() from public, anon, authenticated;
drop trigger if exists family_profiles_limit on public.family_profiles;
create trigger family_profiles_limit before insert on public.family_profiles
  for each row execute function public.enforce_family_profile_limit();

-- Family profiles are mood-only: no health readings are stored for them.
create or replace function public.block_family_health_readings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_family_profile(new.user_id) then
    raise exception 'Family watch profiles are mood-only.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.block_family_health_readings() from public, anon, authenticated;
drop trigger if exists wellness_readings_family_block on public.wellness_readings;
create trigger wellness_readings_family_block before insert or update on public.wellness_readings
  for each row execute function public.block_family_health_readings();

-- Read-only mood history of an owned family profile (mood + time only, no journal text).
create or replace function public.family_profile_moods(p_profile uuid, p_limit int default 30)
returns table(mood text, occurred_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select j.mood, j.occurred_at from public.wellness_journal j
  where j.user_id = p_profile and j.mood is not null
    and exists(select 1 from public.family_profiles f where f.profile_user_id = p_profile and f.owner_id = (select auth.uid()))
  order by j.occurred_at desc limit least(greatest(coalesce(p_limit,30),1),200)
$$;
revoke all on function public.family_profile_moods(uuid, int) from public, anon;
grant execute on function public.family_profile_moods(uuid, int) to authenticated;

-- A watch without its own paired iPhone (Family Setup) asks to link as a family watch.
alter table public.watch_pairing_requests add column if not exists kind text not null default 'self';
alter table public.watch_pairing_requests drop constraint if exists watch_pairing_requests_kind_check;
alter table public.watch_pairing_requests add constraint watch_pairing_requests_kind_check check (kind in ('self','family'));
