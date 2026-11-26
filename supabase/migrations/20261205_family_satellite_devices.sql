-- Family satellite devices: a child's iPad or spare iPhone runs MoodPals in satellite mode, paired to a
-- parent with a 6-digit code. The parent sends persistent commands; the satellite enforces Screen Break
-- locally (DeviceActivity + ManagedSettings) and acknowledges each command. The backend stays authoritative.

-- Pairing reuses watch_pairing_requests: satellite codes are bound to one installation and last 5 minutes.
alter table public.watch_pairing_requests add column if not exists installation_id text;
alter table public.watch_pairing_requests add column if not exists device_type text;
alter table public.watch_pairing_requests drop constraint if exists watch_pairing_requests_kind_check;
alter table public.watch_pairing_requests add constraint watch_pairing_requests_kind_check
  check (kind in ('self','family','satellite'));
create index if not exists watch_pairing_requests_installation_idx
  on public.watch_pairing_requests(installation_id, created_at desc) where installation_id is not null;

create table if not exists public.family_devices(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid references public.family_children(id) on delete set null,
  -- The satellite's own restricted login. It owns no MoodPals data and is deleted on unlink.
  auth_user_id uuid unique references auth.users(id) on delete set null,
  installation_id text unique check (installation_id is null or char_length(installation_id) between 16 and 64),
  name text not null check (char_length(name) between 1 and 60),
  device_type text not null default 'ipad' check (device_type in ('ipad','iphone')),
  status text not null default 'active' check (status in ('active','unlinking','removed')),
  auth_status text not null default 'unknown' check (auth_status in ('unknown','approved','denied')),
  auth_kind text check (auth_kind in ('child','individual')),
  selection_count int not null default 0 check (selection_count >= 0),
  restricted boolean not null default false,
  restriction_changed_at timestamptz,
  -- Shown to the parent; lets a guardian clear this device's restrictions offline if unlinking can't reach it.
  recovery_code text not null check (recovery_code ~ '^[0-9]{6}$'),
  push_token text check (push_token is null or char_length(push_token) <= 200),
  last_seq bigint not null default 0,
  acked_seq bigint not null default 0,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists family_devices_owner_idx on public.family_devices(owner_id, created_at);
create index if not exists family_devices_child_idx on public.family_devices(child_id) where status <> 'removed';
alter table public.family_devices enable row level security;
drop policy if exists "Parents read their devices" on public.family_devices;
create policy "Parents read their devices" on public.family_devices
  for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.family_devices from anon, authenticated;
grant select on public.family_devices to authenticated;

create table if not exists public.family_device_commands(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.family_devices(id) on delete cascade,
  child_id uuid references public.family_children(id) on delete set null,
  session_id uuid,
  seq bigint not null check (seq >= 1),
  type text not null check (type in ('START_SESSION','EXTEND_SESSION','END_SESSION','LOCK_APPS','REQUEST_STATUS','UNLINK_DEVICE')),
  minutes int check (minutes is null or minutes between 1 and 720),
  status text not null default 'pending'
    check (status in ('pending','delivered','acknowledged','rejected','expired','canceled')),
  error text check (error is null or char_length(error) <= 200),
  error_code text check (error_code is null or char_length(error_code) <= 40),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  unique (device_id, seq),
  check (expires_at > created_at)
);
create index if not exists family_device_commands_open_idx
  on public.family_device_commands(device_id, seq) where status in ('pending','delivered');
create index if not exists family_device_commands_owner_idx on public.family_device_commands(owner_id, created_at desc);
alter table public.family_device_commands enable row level security;
drop policy if exists "Parents read their device commands" on public.family_device_commands;
create policy "Parents read their device commands" on public.family_device_commands
  for select to authenticated using (owner_id = (select auth.uid()));
-- Lets the satellite subscribe to its own commands with Realtime while it's open.
drop policy if exists "Satellites read their commands" on public.family_device_commands;
create policy "Satellites read their commands" on public.family_device_commands
  for select to authenticated using (device_id in (
    select d.id from public.family_devices d where d.auth_user_id = (select auth.uid()) and d.status <> 'removed'));
revoke all on public.family_device_commands from anon, authenticated;
grant select on public.family_device_commands to authenticated;

-- Sessions on a satellite reuse the Screen Break history (same ids, versions, analytics).
alter table public.screen_break_sessions add column if not exists family_device_id uuid
  references public.family_devices(id) on delete set null;
alter table public.screen_break_sessions add column if not exists requested_at timestamptz;
alter table public.screen_break_sessions add column if not exists requested_seconds int
  check (requested_seconds is null or requested_seconds between 60 and 86400);
alter table public.screen_break_sessions add column if not exists extra_seconds int not null default 0
  check (extra_seconds >= 0);
alter table public.screen_break_sessions add column if not exists elapsed_seconds int
  check (elapsed_seconds is null or elapsed_seconds >= 0);
alter table public.screen_break_sessions add column if not exists warned_at timestamptz;
create index if not exists screen_break_sessions_device_idx
  on public.screen_break_sessions(family_device_id, started_at desc) where family_device_id is not null;
create index if not exists screen_break_sessions_warn_idx
  on public.screen_break_sessions(deadline_at) where status = 'active' and family_device_id is not null and warned_at is null;

-- Entitlement for any parent (used by satellites, which act under their parent's Plus or trial).
create or replace function public.screen_break_entitlement_of(p_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with t as (select st.started_at from public.screen_break_trials st where st.owner_id = p_uid)
  select jsonb_build_object(
    'has_plus', coalesce(public.has_plus(p_uid), false),
    'trial_started_at', (select started_at from t),
    'trial_ends_at', (select started_at + interval '336 hours' from t),
    'trial_available', not exists(select 1 from t),
    'server_now', now(),
    'allowed', coalesce(public.has_plus(p_uid), false)
      or not exists(select 1 from t)
      or exists(select 1 from t where started_at + interval '336 hours' > now())
  )
$$;
revoke all on function public.screen_break_entitlement_of(uuid) from public, anon, authenticated;
grant execute on function public.screen_break_entitlement_of(uuid) to service_role;

create or replace function public.screen_break_entitlement()
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.screen_break_entitlement_of((select auth.uid()))
$$;
revoke all on function public.screen_break_entitlement() from public, anon;
grant execute on function public.screen_break_entitlement() to authenticated;

create or replace function public.is_satellite(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.family_devices d where d.auth_user_id = uid)
$$;
revoke all on function public.is_satellite(uuid) from public, anon, authenticated;
grant execute on function public.is_satellite(uuid) to service_role;

-- Background push to the satellite. It's only a hint to sync: the satellite also syncs on launch,
-- foreground and Realtime, so a dropped push only delays the command.
create or replace function public.family_device_wake(p_device uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  select push_token into t from public.family_devices where id = p_device and status <> 'removed';
  if t is null then return; end if;
  begin
    perform net.http_post(url := 'https://exp.host/--/api/v2/push/send',
      body := jsonb_build_array(jsonb_build_object('to', t, '_contentAvailable', true, 'priority', 'high',
        'data', jsonb_build_object('action', 'satellite_sync'))),
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);
  exception when others then null;
  end;
end $$;
revoke all on function public.family_device_wake(uuid) from public, anon, authenticated;

create or replace function public.family_device_notify_owner(p_owner uuid, p_title text, p_body text, p_device uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object('to', t.token, 'title', p_title, 'body', p_body, 'sound', 'default',
      'data', jsonb_build_object('action', 'screenBreakDevice', 'deviceId', p_device)))
    into msgs from public.circle_push_tokens t where t.user_id = p_owner;
  if msgs is null then return; end if;
  begin
    perform net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := msgs,
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);
  exception when others then null;
  end;
end $$;
revoke all on function public.family_device_notify_owner(uuid, text, text, uuid) from public, anon, authenticated;

-- Revokes a satellite: open commands and sessions close, its login is deleted, history stays with the device row.
create or replace function public.family_device_finalize_unlink(p_device uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  select auth_user_id into v_uid from public.family_devices where id = p_device for update;
  update public.family_device_commands set status = 'canceled'
    where device_id = p_device and status in ('pending','delivered') and type <> 'UNLINK_DEVICE';
  update public.family_device_commands set status = 'acknowledged', acknowledged_at = now()
    where device_id = p_device and status in ('pending','delivered') and type = 'UNLINK_DEVICE';
  update public.screen_break_sessions set status = 'canceled', end_reason = 'canceled',
      ended_at = coalesce(ended_at, least(now(), deadline_at)), version = version + 1, updated_at = now()
    where family_device_id = p_device and status = 'active';
  update public.family_devices set status = 'removed', auth_user_id = null, installation_id = null,
      push_token = null, restricted = false, updated_at = now()
    where id = p_device;
  if v_uid is not null then delete from auth.users where id = v_uid; end if;
end $$;
revoke all on function public.family_device_finalize_unlink(uuid) from public, anon, authenticated;

-- Parent: queue a command for one of their devices. START/EXTEND/LOCK need Plus or the shared trial;
-- END, status and unlink always work so a device is never stuck restricted.
create or replace function public.family_device_command(p_device uuid, p_type text, p_minutes int default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  d public.family_devices;
  v_type text := upper(coalesce(p_type, ''));
  v_session public.screen_break_sessions;
  v_start public.family_device_commands;
  v_cmd public.family_device_commands;
  v_sid uuid;
  v_ttl interval := interval '10 minutes';
  v_seq bigint;
begin
  if me is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  select * into d from public.family_devices where id = p_device and owner_id = me and status <> 'removed' for update;
  if not found then raise exception 'Device not found' using errcode = 'P0002'; end if;
  if v_type not in ('START_SESSION','EXTEND_SESSION','END_SESSION','LOCK_APPS','REQUEST_STATUS','UNLINK_DEVICE') then
    raise exception 'Unknown command' using errcode = '22023';
  end if;
  if d.status = 'unlinking' and v_type not in ('REQUEST_STATUS','UNLINK_DEVICE') then
    raise exception 'This device is being unlinked.' using errcode = 'P0001';
  end if;
  select * into v_session from public.screen_break_sessions
    where family_device_id = d.id and status = 'active' order by started_at desc limit 1;
  select * into v_start from public.family_device_commands
    where device_id = d.id and type = 'START_SESSION' and status in ('pending','delivered') and expires_at > now()
    order by seq desc limit 1;
  if v_type in ('START_SESSION','EXTEND_SESSION','LOCK_APPS')
     and not coalesce((public.screen_break_entitlement_of(me)->>'allowed')::boolean, false) then
    raise exception 'Your 14-day free trial has ended. MoodPals Plus keeps Screen Break on.' using errcode = 'P0001';
  end if;
  if v_type = 'START_SESSION' then
    if d.child_id is null then raise exception 'Assign this device to a child first.' using errcode = 'P0001'; end if;
    if p_minutes is null or p_minutes not between 1 and 720 then
      raise exception 'Choose between 1 minute and 12 hours.' using errcode = '22023';
    end if;
    if v_session.id is not null or v_start.id is not null then
      raise exception 'Screen time is already running on this device.' using errcode = 'P0001';
    end if;
    v_sid := gen_random_uuid();
  elsif v_type = 'EXTEND_SESSION' then
    if v_session.id is null then raise exception 'There''s no screen time running on this device.' using errcode = 'P0001'; end if;
    if p_minutes is null or p_minutes not between 1 and 120 then
      raise exception 'Choose how much time to add.' using errcode = '22023';
    end if;
    v_sid := v_session.id;
  elsif v_type = 'END_SESSION' then
    -- Ending before the device confirmed the start just cancels the start.
    if v_start.id is not null and v_session.id is null then
      update public.family_device_commands set status = 'canceled' where id = v_start.id returning * into v_cmd;
      perform public.family_device_wake(d.id);
      return to_jsonb(v_cmd);
    end if;
    if v_session.id is null then raise exception 'There''s no screen time running on this device.' using errcode = 'P0001'; end if;
    v_sid := v_session.id;
    v_ttl := interval '24 hours';
  elsif v_type = 'LOCK_APPS' then
    if v_session.id is not null or v_start.id is not null then
      raise exception 'Screen time is running. End it first.' using errcode = 'P0001';
    end if;
    v_ttl := interval '24 hours';
  elsif v_type = 'UNLINK_DEVICE' then
    update public.family_device_commands set status = 'canceled'
      where device_id = d.id and status in ('pending','delivered');
    update public.family_devices set status = 'unlinking', updated_at = now() where id = d.id;
    v_ttl := interval '30 days';
  end if;
  update public.family_devices set last_seq = last_seq + 1, updated_at = now() where id = d.id returning last_seq into v_seq;
  insert into public.family_device_commands(owner_id, device_id, child_id, session_id, seq, type, minutes, expires_at)
    values (me, d.id, d.child_id, v_sid, v_seq, v_type,
      case when v_type in ('START_SESSION','EXTEND_SESSION') then p_minutes end, now() + v_ttl)
    returning * into v_cmd;
  perform public.family_device_wake(d.id);
  return to_jsonb(v_cmd);
end $$;
revoke all on function public.family_device_command(uuid, text, int) from public, anon;
grant execute on function public.family_device_command(uuid, text, int) to authenticated;

-- Parent: cancel a command the device hasn't acknowledged yet (canceling an unlink keeps the device).
create or replace function public.family_device_cancel_command(p_command uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); v_cmd public.family_device_commands;
begin
  update public.family_device_commands set status = 'canceled'
    where id = p_command and owner_id = me and status in ('pending','delivered') returning * into v_cmd;
  if v_cmd.id is null then raise exception 'This request already finished.' using errcode = 'P0001'; end if;
  if v_cmd.type = 'UNLINK_DEVICE' then
    update public.family_devices set status = 'active', updated_at = now() where id = v_cmd.device_id and status = 'unlinking';
  end if;
  return to_jsonb(v_cmd);
end $$;
revoke all on function public.family_device_cancel_command(uuid) from public, anon;
grant execute on function public.family_device_cancel_command(uuid) to authenticated;

-- Parent: rename and/or (re)assign a device. A device belongs to one child at a time.
create or replace function public.family_device_update(p_device uuid, p_name text default null, p_child uuid default null)
returns public.family_devices language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); d public.family_devices; v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  select * into d from public.family_devices where id = p_device and owner_id = me and status = 'active' for update;
  if not found then raise exception 'Device not found' using errcode = 'P0002'; end if;
  if p_child is not null and p_child is distinct from d.child_id then
    if not exists(select 1 from public.family_children c where c.id = p_child and c.owner_id = me and not c.watch_only) then
      raise exception 'Child not found' using errcode = 'P0002';
    end if;
    if exists(select 1 from public.screen_break_sessions s where s.family_device_id = d.id and s.status = 'active')
       or exists(select 1 from public.family_device_commands c where c.device_id = d.id and c.type = 'START_SESSION'
                 and c.status in ('pending','delivered') and c.expires_at > now()) then
      raise exception 'End the screen time on this device before moving it.' using errcode = 'P0001';
    end if;
  end if;
  update public.family_devices set name = coalesce(left(v_name, 60), name), child_id = coalesce(p_child, child_id), updated_at = now()
    where id = d.id returning * into d;
  perform public.family_device_wake(d.id);
  return d;
end $$;
revoke all on function public.family_device_update(uuid, text, uuid) from public, anon;
grant execute on function public.family_device_update(uuid, text, uuid) to authenticated;

-- Parent: remove a device that can't be reached (pending unlink). Its credentials stop working right away;
-- restrictions on the device clear when it next connects, or with the recovery code.
create or replace function public.family_device_remove(p_device uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if not exists(select 1 from public.family_devices where id = p_device and owner_id = me and status <> 'removed') then
    raise exception 'Device not found' using errcode = 'P0002';
  end if;
  perform public.family_device_finalize_unlink(p_device);
end $$;
revoke all on function public.family_device_remove(uuid) from public, anon;
grant execute on function public.family_device_remove(uuid) to authenticated;

-- Saves a session snapshot recorded on a satellite (newest version wins; retries are no-ops).
create or replace function public.satellite_save_session(p_device uuid, s jsonb, p_command public.family_device_commands default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  d public.family_devices;
  v_id uuid; v_child uuid; v_start timestamptz; v_deadline timestamptz; v_ended timestamptz;
  v_status text; v_version int; v_granted int;
begin
  select * into d from public.family_devices where id = p_device;
  if d.id is null or s is null or jsonb_typeof(s) <> 'object' then return null; end if;
  begin
    v_id := (s->>'id')::uuid;
    v_child := (s->>'child_id')::uuid;
    v_start := (s->>'started_at')::timestamptz;
    v_deadline := (s->>'deadline_at')::timestamptz;
    v_ended := nullif(s->>'ended_at', '')::timestamptz;
  exception when others then return null;
  end;
  v_status := s->>'status';
  v_version := greatest(coalesce((s->>'version')::int, 1), 1);
  v_granted := greatest(60, least(86400, coalesce((s->>'granted_seconds')::int, 60)));
  if v_status not in ('active','restricted','released','canceled') or v_start is null or v_deadline is null
     or v_deadline <= v_start or v_start > now() + interval '10 minutes'
     or char_length(coalesce(s->>'device_id', '')) not between 8 and 64
     or not exists(select 1 from public.family_children c where c.id = v_child and c.owner_id = d.owner_id) then
    return null;
  end if;
  if v_status = 'active' then
    update public.screen_break_sessions o set status = 'restricted', end_reason = coalesce(o.end_reason, 'deadline'),
      ended_at = coalesce(o.ended_at, least(o.deadline_at, v_start)), version = o.version + 1, updated_at = now()
    where o.owner_id = d.owner_id and o.device_id = s->>'device_id' and o.status = 'active' and o.id <> v_id;
  end if;
  insert into public.screen_break_sessions as x(id, owner_id, child_id, device_id, family_device_id, started_at, deadline_at,
      ended_at, granted_seconds, status, end_reason, version, requested_at, requested_seconds, elapsed_seconds, updated_at)
    values (v_id, d.owner_id, v_child, s->>'device_id', d.id, v_start, v_deadline, v_ended, v_granted, v_status,
      nullif(s->>'end_reason', ''), v_version,
      case when p_command.type = 'START_SESSION' then p_command.created_at end,
      case when p_command.type = 'START_SESSION' then p_command.minutes * 60 end,
      case when v_ended is not null then greatest(0, extract(epoch from v_ended - v_start))::int end, now())
  on conflict (id) do update set deadline_at = excluded.deadline_at, ended_at = excluded.ended_at,
      granted_seconds = excluded.granted_seconds, status = excluded.status, end_reason = excluded.end_reason,
      version = excluded.version, elapsed_seconds = excluded.elapsed_seconds,
      requested_at = coalesce(x.requested_at, excluded.requested_at),
      requested_seconds = coalesce(x.requested_seconds, excluded.requested_seconds),
      extra_seconds = greatest(0, excluded.granted_seconds - coalesce(x.requested_seconds, excluded.requested_seconds, excluded.granted_seconds)),
      updated_at = now()
    where x.family_device_id = d.id and excluded.version > x.version;
  -- Requested fields arrive with the START acknowledgement even when the snapshot synced first.
  if p_command.type = 'START_SESSION' then
    update public.screen_break_sessions set requested_at = coalesce(requested_at, p_command.created_at),
        requested_seconds = coalesce(requested_seconds, p_command.minutes * 60)
      where id = v_id and family_device_id = d.id;
  end if;
  -- Sessions on satellites start the parent's shared trial exactly like sessions on the parent's iPhone.
  if not public.has_plus(d.owner_id) then
    insert into public.screen_break_trials(owner_id, started_at, first_session_id)
    values (d.owner_id, greatest(least(v_start, now()), now() - interval '336 hours'), v_id)
    on conflict (owner_id) do nothing;
  end if;
  return v_version;
end $$;
revoke all on function public.satellite_save_session(uuid, jsonb, public.family_device_commands) from public, anon, authenticated;

create or replace function public.satellite_state(d public.family_devices)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'linked', true,
    'device', jsonb_build_object('id', d.id, 'name', d.name, 'device_type', d.device_type, 'status', d.status,
      'child_id', d.child_id, 'child_name', (select c.name from public.family_children c where c.id = d.child_id),
      'recovery_hash', encode(extensions.digest(d.id::text || ':' || d.recovery_code, 'sha256'), 'hex'),
      'acked_seq', d.acked_seq),
    'entitlement', public.screen_break_entitlement_of(d.owner_id),
    'commands', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'type', c.type, 'seq', c.seq,
        'session_id', c.session_id, 'child_id', c.child_id, 'minutes', c.minutes, 'created_at', c.created_at,
        'expires_at', c.expires_at, 'status', c.status) order by c.seq)
      from public.family_device_commands c
      where c.device_id = d.id and c.status in ('pending','delivered') and c.expires_at > now()
        and c.seq > d.acked_seq), '[]'::jsonb),
    'server_now', now())
$$;
revoke all on function public.satellite_state(public.family_devices) from public, anon, authenticated;

-- Satellite: report local state and recorded sessions, receive open commands. Returns linked=false once unlinked.
create or replace function public.satellite_sync(p_report jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  d public.family_devices;
  s jsonb;
  v int;
  saved jsonb := '{}'::jsonb;
  v_restricted boolean := (p_report->>'restricted')::boolean;
begin
  if me is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  select * into d from public.family_devices where auth_user_id = me and status in ('active','unlinking') for update;
  if not found then return jsonb_build_object('linked', false); end if;
  update public.family_devices set
      auth_status = case when p_report->>'auth_status' in ('unknown','approved','denied') then p_report->>'auth_status' else auth_status end,
      auth_kind = case when p_report->>'auth_kind' in ('child','individual') then p_report->>'auth_kind' else auth_kind end,
      selection_count = greatest(0, coalesce((p_report->>'selection_count')::int, selection_count)),
      restricted = coalesce(v_restricted, restricted),
      restriction_changed_at = case when v_restricted is distinct from restricted and v_restricted is not null then now() else restriction_changed_at end,
      last_sync_at = now(), updated_at = now()
    where id = d.id returning * into d;
  if jsonb_typeof(p_report->'sessions') = 'array' then
    for s in select * from jsonb_array_elements(p_report->'sessions') limit 100 loop
      v := public.satellite_save_session(d.id, s);
      if v is not null then saved := saved || jsonb_build_object(s->>'id', v); end if;
    end loop;
  end if;
  update public.family_device_commands set status = 'expired'
    where device_id = d.id and status in ('pending','delivered') and expires_at <= now();
  update public.family_device_commands set status = 'delivered', delivered_at = now()
    where device_id = d.id and status = 'pending';
  return public.satellite_state(d) || jsonb_build_object('saved', saved);
end $$;
revoke all on function public.satellite_sync(jsonb) from public, anon;
grant execute on function public.satellite_sync(jsonb) to authenticated;

-- Satellite: acknowledge one command after applying it locally (idempotent). p_session is the local
-- session snapshot after the command, so the parent sees the confirmed start time and deadline.
create or replace function public.satellite_ack(p_command uuid, p_ok boolean, p_error text default null,
  p_code text default null, p_session jsonb default null, p_restricted boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  d public.family_devices;
  c public.family_device_commands;
begin
  if me is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  select * into d from public.family_devices where auth_user_id = me and status in ('active','unlinking') for update;
  if not found then return jsonb_build_object('linked', false); end if;
  select * into c from public.family_device_commands where id = p_command and device_id = d.id for update;
  if not found then raise exception 'Command not found' using errcode = 'P0002'; end if;
  update public.family_devices set acked_seq = greatest(acked_seq, c.seq), last_sync_at = now(),
      restricted = coalesce(p_restricted, restricted),
      restriction_changed_at = case when p_restricted is distinct from restricted and p_restricted is not null then now() else restriction_changed_at end
    where id = d.id;
  if c.status in ('acknowledged','rejected') then
    return jsonb_build_object('linked', true, 'status', c.status, 'duplicate', true);
  end if;
  -- The parent canceled after the device picked the command up: the device undoes a start it applied.
  if c.status in ('canceled','expired') then
    return jsonb_build_object('linked', true, 'status', c.status, 'undo', p_ok and c.type = 'START_SESSION');
  end if;
  update public.family_device_commands set status = case when p_ok then 'acknowledged' else 'rejected' end,
      acknowledged_at = now(), error = left(p_error, 200), error_code = left(p_code, 40)
    where id = c.id;
  if p_ok and p_session is not null then perform public.satellite_save_session(d.id, p_session, c); end if;
  if p_ok and c.type = 'UNLINK_DEVICE' then
    perform public.family_device_finalize_unlink(d.id);
    return jsonb_build_object('linked', false, 'status', 'acknowledged');
  end if;
  if not p_ok and c.type in ('START_SESSION','EXTEND_SESSION','LOCK_APPS') then
    perform public.family_device_notify_owner(d.owner_id, d.name,
      coalesce(left(p_error, 140), 'The device couldn''t apply your request.'), d.id);
  end if;
  return jsonb_build_object('linked', true, 'status', case when p_ok then 'acknowledged' else 'rejected' end);
end $$;
revoke all on function public.satellite_ack(uuid, boolean, text, text, jsonb, boolean) from public, anon;
grant execute on function public.satellite_ack(uuid, boolean, text, text, jsonb, boolean) to authenticated;

create or replace function public.satellite_register_push(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or char_length(p_token) > 200 then raise exception 'Invalid token' using errcode = '22023'; end if;
  update public.family_devices set push_token = p_token, updated_at = now()
    where auth_user_id = (select auth.uid()) and status in ('active','unlinking');
end $$;
revoke all on function public.satellite_register_push(text) from public, anon;
grant execute on function public.satellite_register_push(text) to authenticated;

-- Every minute: the 5-minute warning for sessions on satellites (the parent's apps may be closed),
-- and expiry of commands nobody picked up.
create or replace function public.family_device_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in update public.screen_break_sessions s set warned_at = now()
      where s.status = 'active' and s.family_device_id is not null and s.warned_at is null
        and s.deadline_at between now() + interval '1 minute' and now() + interval '5 minutes 30 seconds'
      returning s.owner_id, s.family_device_id, s.child_id loop
    perform public.family_device_notify_owner(r.owner_id, '5 minutes left',
      coalesce((select c.name from public.family_children c where c.id = r.child_id), 'Screen time') || '''s screen time on '
        || coalesce((select d.name from public.family_devices d where d.id = r.family_device_id), 'their device')
        || ' ends in 5 minutes.', r.family_device_id);
  end loop;
  update public.family_device_commands set status = 'expired'
    where status in ('pending','delivered') and expires_at <= now();
end $$;
revoke all on function public.family_device_tick() from public, anon, authenticated;

do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'family-device-tick';
    perform cron.schedule('family-device-tick', '* * * * *', 'select public.family_device_tick()');
  end if;
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'family_devices') then
      alter publication supabase_realtime add table public.family_devices;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'family_device_commands') then
      alter publication supabase_realtime add table public.family_device_commands;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'screen_break_sessions') then
      alter publication supabase_realtime add table public.screen_break_sessions;
    end if;
  end if;
end $$;
