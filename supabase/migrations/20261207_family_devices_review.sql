-- Review fixes for family devices.

-- The prefs cleanup trigger gets its own function so family_device_clear_default() can be the parent's
-- "use This iPhone as default" RPC.
drop trigger if exists family_devices_clear_default on public.family_devices;
drop function if exists public.family_device_clear_default();
create or replace function public.family_device_prefs_on_remove()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.family_device_prefs set default_device_id = null, updated_at = now() where default_device_id = new.id;
  return new;
end $$;
revoke all on function public.family_device_prefs_on_remove() from public, anon, authenticated;
create trigger family_devices_clear_default after update of status on public.family_devices
  for each row when (new.status = 'removed') execute function public.family_device_prefs_on_remove();

create or replace function public.family_device_clear_default()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  insert into public.family_device_prefs(owner_id, default_device_id) values (me, null)
  on conflict (owner_id) do update set default_device_id = null, updated_at = now();
  return jsonb_build_object('default_device_id', null);
end $$;
revoke all on function public.family_device_clear_default() from public, anon;
grant execute on function public.family_device_clear_default() to authenticated;

-- A timer that ran out without the device syncing no longer blocks the next start.
create or replace function public.family_device_command(p_device uuid, p_type text, p_minutes int default null, p_child uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  d public.family_devices;
  v_type text := upper(coalesce(p_type, ''));
  v_session public.screen_break_sessions;
  v_start public.family_device_commands;
  v_cmd public.family_device_commands;
  v_child uuid;
  v_sid uuid;
  v_ttl interval := interval '10 minutes';
  v_seq bigint;
  v_who text;
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
    where family_device_id = d.id and status = 'active' and deadline_at > now() order by started_at desc limit 1;
  select * into v_start from public.family_device_commands
    where device_id = d.id and type = 'START_SESSION' and status in ('pending','delivered') and expires_at > now()
    order by seq desc limit 1;
  if v_type in ('START_SESSION','EXTEND_SESSION','LOCK_APPS')
     and not coalesce((public.screen_break_entitlement_of(me)->>'allowed')::boolean, false) then
    raise exception 'Your 14-day free trial has ended. MoodPals Plus keeps Screen Break on.' using errcode = 'P0001';
  end if;
  if v_type = 'START_SESSION' then
    if p_child is null or not exists(select 1 from public.family_children c where c.id = p_child and c.owner_id = me and not c.watch_only) then
      raise exception 'Choose who is using this device.' using errcode = 'P0001';
    end if;
    if p_minutes is null or p_minutes not between 1 and 720 then
      raise exception 'Choose between 1 minute and 12 hours.' using errcode = '22023';
    end if;
    if v_session.id is not null then
      select c.name into v_who from public.family_children c where c.id = v_session.child_id;
      raise exception '% is using % (% min left). Add time or end that session first.', coalesce(v_who, 'Someone'), d.name,
        greatest(1, ceil(extract(epoch from v_session.deadline_at - now()) / 60)::int) using errcode = 'P0001';
    end if;
    if v_start.id is not null then
      raise exception 'Screen time is already starting on %.', d.name using errcode = 'P0001';
    end if;
    v_child := p_child;
    v_sid := gen_random_uuid();
  elsif v_type = 'EXTEND_SESSION' then
    if v_session.id is null then raise exception 'There''s no screen time running on this device.' using errcode = 'P0001'; end if;
    if p_minutes is null or p_minutes not between 1 and 120 then
      raise exception 'Choose how much time to add.' using errcode = '22023';
    end if;
    v_child := v_session.child_id;
    v_sid := v_session.id;
  elsif v_type = 'END_SESSION' then
    -- Ending before the device confirmed the start just cancels the start.
    if v_start.id is not null and v_session.id is null then
      update public.family_device_commands set status = 'canceled' where id = v_start.id returning * into v_cmd;
      perform public.family_device_wake(d.id);
      return to_jsonb(v_cmd);
    end if;
    if v_session.id is null then raise exception 'There''s no screen time running on this device.' using errcode = 'P0001'; end if;
    v_child := v_session.child_id;
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
    values (me, d.id, v_child, v_sid, v_seq, v_type,
      case when v_type in ('START_SESSION','EXTEND_SESSION') then p_minutes end, now() + v_ttl)
    returning * into v_cmd;
  perform public.family_device_wake(d.id);
  return to_jsonb(v_cmd);
end $$;

-- Devices can only report sessions the parent started on them.
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
     or not exists(select 1 from public.family_children c where c.id = v_child and c.owner_id = d.owner_id)
     -- Only sessions the parent started on this device (and for that child) are recorded.
     or not exists(select 1 from public.family_device_commands c where c.device_id = d.id and c.type = 'START_SESSION'
                   and c.session_id = v_id and c.child_id = v_child) then
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
