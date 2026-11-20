-- Family Screen Break: child profiles that don't need a watch, session history and a 14-day trial.
-- No Apple Screen Time tokens, app names or usage reports are stored here; only Screen Break session times.

-- Child profiles owned by a parent account. A child can exist without a watch; a family watch profile
-- (family_profiles) can be linked to it later. Children never sign in and have no health data.
create table if not exists public.family_children(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  profile_user_id uuid unique references public.family_profiles(profile_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists family_children_owner_idx on public.family_children(owner_id);
alter table public.family_children enable row level security;
drop policy if exists "Parents read their children" on public.family_children;
create policy "Parents read their children" on public.family_children
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "Parents rename their children" on public.family_children;
create policy "Parents rename their children" on public.family_children
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "Parents remove their children" on public.family_children;
create policy "Parents remove their children" on public.family_children
  for delete to authenticated using ((select auth.uid()) = owner_id);
-- profile_user_id is only set by the link function and the family watch trigger.
revoke update on public.family_children from authenticated;
grant update (name, updated_at) on public.family_children to authenticated;
grant select, delete on public.family_children to authenticated;

create or replace function public.family_child_name(p_device text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(nullif(btrim(regexp_replace(coalesce(p_device,''), '([''’]s)?\s*Apple\s+Watch$', '', 'i')), ''), left(coalesce(p_device,'Child'), 40), 'Child')
$$;

-- Every family watch profile is also a child, so Screen Break can pick it. Existing profiles are backfilled.
insert into public.family_children(owner_id, name, profile_user_id, created_at)
select f.owner_id, left(public.family_child_name(f.device_name), 40), f.profile_user_id, f.created_at
from public.family_profiles f
where not exists(select 1 from public.family_children c where c.profile_user_id = f.profile_user_id);

create or replace function public.family_profile_child_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.family_children(owner_id, name, profile_user_id)
    values (new.owner_id, left(public.family_child_name(new.device_name), 40), new.profile_user_id)
    on conflict (profile_user_id) do nothing;
  elsif new.device_name is distinct from old.device_name then
    update public.family_children set name = left(public.family_child_name(new.device_name), 40), updated_at = now()
    where profile_user_id = new.profile_user_id;
  end if;
  return new;
end $$;
revoke all on function public.family_profile_child_sync() from public, anon, authenticated;
drop trigger if exists family_profiles_child_sync on public.family_profiles;
create trigger family_profiles_child_sync after insert or update of device_name on public.family_profiles
  for each row execute function public.family_profile_child_sync();

-- Adds a child without a watch. Parents can have up to 10 children.
create or replace function public.family_add_child(p_name text)
returns public.family_children language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  clean text := btrim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g'));
  row public.family_children;
begin
  if me is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if public.is_family_profile(me) then raise exception 'A family watch profile cannot add children.' using errcode = 'P0001'; end if;
  if char_length(clean) not between 1 and 40 then raise exception 'Use 1 to 40 characters.' using errcode = 'P0001'; end if;
  if (select count(*) from public.family_children c where c.owner_id = me) >= 10 then
    raise exception 'You can add up to 10 children.' using errcode = 'P0001';
  end if;
  insert into public.family_children(owner_id, name) values (me, clean) returning * into row;
  return row;
end $$;
revoke all on function public.family_add_child(text) from public, anon;
grant execute on function public.family_add_child(text) to authenticated;

-- Links a watch-less child to one of the parent's family watch profiles (linked later through the normal
-- watch code flow). The child row created for that watch is merged into this child, sessions included.
create or replace function public.family_link_child_watch(p_child uuid, p_profile uuid)
returns public.family_children language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  target public.family_children;
  other public.family_children;
begin
  select * into target from public.family_children where id = p_child and owner_id = me for update;
  if target.id is null then raise exception 'Child not found' using errcode = 'P0002'; end if;
  if not exists(select 1 from public.family_profiles f where f.profile_user_id = p_profile and f.owner_id = me) then
    raise exception 'Family watch not found' using errcode = 'P0002';
  end if;
  if target.profile_user_id = p_profile then return target; end if;
  if target.profile_user_id is not null then raise exception 'This child already has a watch.' using errcode = 'P0001'; end if;
  select * into other from public.family_children where profile_user_id = p_profile for update;
  if other.id is not null then
    update public.screen_break_sessions set child_id = target.id where child_id = other.id;
    delete from public.family_children where id = other.id;
  end if;
  update public.family_children set profile_user_id = p_profile, updated_at = now() where id = target.id returning * into target;
  return target;
end $$;

-- One trial per parent account, started by the first Screen Break session that was activated.
create table if not exists public.screen_break_trials(
  owner_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  first_session_id uuid
);
alter table public.screen_break_trials enable row level security;
drop policy if exists "Parents read their trial" on public.screen_break_trials;
create policy "Parents read their trial" on public.screen_break_trials
  for select to authenticated using ((select auth.uid()) = owner_id);

-- Session times only. Durations are derived: least(deadline_at, ended_at) - started_at.
create table if not exists public.screen_break_sessions(
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.family_children(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 8 and 64),
  started_at timestamptz not null,
  deadline_at timestamptz not null check (deadline_at > started_at),
  ended_at timestamptz,
  granted_seconds int not null check (granted_seconds between 60 and 86400),
  status text not null check (status in ('active','restricted','released','canceled')),
  end_reason text check (end_reason in ('deadline','end_now','canceled','released')),
  version int not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists screen_break_sessions_child_idx on public.screen_break_sessions(child_id, started_at desc);
create index if not exists screen_break_sessions_owner_idx on public.screen_break_sessions(owner_id, started_at desc);
-- A controlling iPhone runs at most one active session.
create unique index if not exists screen_break_one_active_per_device on public.screen_break_sessions(owner_id, device_id) where status = 'active';
alter table public.screen_break_sessions enable row level security;
drop policy if exists "Parents read their sessions" on public.screen_break_sessions;
create policy "Parents read their sessions" on public.screen_break_sessions
  for select to authenticated using ((select auth.uid()) = owner_id);

revoke all on function public.family_link_child_watch(uuid, uuid) from public, anon;
grant execute on function public.family_link_child_watch(uuid, uuid) to authenticated;

create or replace function public.screen_break_entitlement()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id),
  t as (select st.started_at from public.screen_break_trials st, me where st.owner_id = me.id)
  select jsonb_build_object(
    'has_plus', coalesce(public.has_plus(me.id), false),
    'trial_started_at', (select started_at from t),
    'trial_ends_at', (select started_at + interval '336 hours' from t),
    'trial_available', not exists(select 1 from t),
    'server_now', now(),
    'allowed', coalesce(public.has_plus(me.id), false)
      or not exists(select 1 from t)
      or exists(select 1 from t where started_at + interval '336 hours' > now())
  ) from me
$$;
revoke all on function public.screen_break_entitlement() from public, anon;
grant execute on function public.screen_break_entitlement() to authenticated;

-- Saves session snapshots recorded on the controlling iPhone (newest version wins; retries are no-ops)
-- and starts the trial with the first activated session. Returns the entitlement.
create or replace function public.screen_break_sync(p_sessions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  s jsonb;
  v_child uuid;
  v_start timestamptz;
  v_deadline timestamptz;
  v_ended timestamptz;
  v_status text;
  v_version int;
begin
  if me is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if jsonb_typeof(p_sessions) <> 'array' or jsonb_array_length(p_sessions) > 100 then
    raise exception 'Invalid sessions' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(p_sessions) loop
    v_child := (s->>'child_id')::uuid;
    -- Sessions for a child that was removed are dropped.
    continue when not exists(select 1 from public.family_children c where c.id = v_child and c.owner_id = me);
    v_start := (s->>'started_at')::timestamptz;
    v_deadline := (s->>'deadline_at')::timestamptz;
    v_ended := nullif(s->>'ended_at','')::timestamptz;
    v_status := s->>'status';
    v_version := greatest(coalesce((s->>'version')::int, 1), 1);
    continue when v_start is null or v_deadline is null or v_deadline <= v_start or v_start > now() + interval '10 minutes';
    -- A newer session on the same iPhone means an older 'active' row was never closed (lost sync): close it at its deadline.
    if v_status = 'active' then
      update public.screen_break_sessions o set status = 'restricted', end_reason = coalesce(o.end_reason, 'deadline'),
        ended_at = coalesce(o.ended_at, least(o.deadline_at, v_start)), version = o.version + 1, updated_at = now()
      where o.device_id = s->>'device_id' and o.status = 'active' and o.id <> (s->>'id')::uuid and o.owner_id = me;
    end if;
    insert into public.screen_break_sessions as x(id, owner_id, child_id, device_id, started_at, deadline_at, ended_at,
      granted_seconds, status, end_reason, version, updated_at)
    values ((s->>'id')::uuid, me, v_child, s->>'device_id', v_start, v_deadline, v_ended,
      greatest(60, least(86400, coalesce((s->>'granted_seconds')::int, 60))), v_status, nullif(s->>'end_reason',''), v_version, now())
    on conflict (id) do update set deadline_at = excluded.deadline_at, ended_at = excluded.ended_at,
      granted_seconds = excluded.granted_seconds, status = excluded.status, end_reason = excluded.end_reason,
      version = excluded.version, updated_at = now()
    where x.owner_id = me and excluded.version > x.version;
    -- Trial starts with the first activated session (server clock, never before the session or 14 days ago).
    if not public.has_plus(me) then
      insert into public.screen_break_trials(owner_id, started_at, first_session_id)
      values (me, greatest(least(v_start, now()), now() - interval '336 hours'), (s->>'id')::uuid)
      on conflict (owner_id) do nothing;
    end if;
  end loop;
  return public.screen_break_entitlement();
end $$;
revoke all on function public.screen_break_sync(jsonb) from public, anon;
grant execute on function public.screen_break_sync(jsonb) to authenticated;
