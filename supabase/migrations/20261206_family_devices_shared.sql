-- Family devices belong to the parent's family account, not to a child. Any child can use any linked
-- device; the child is chosen per session (START_SESSION carries it) and stored only on the session.
drop index if exists public.family_devices_child_idx;
alter table public.family_devices drop column if exists child_id;
create index if not exists family_devices_active_idx on public.family_devices(owner_id) where status <> 'removed';

-- Default device for new timers. No row (or a null device) means the parent's own iPhone.
create table if not exists public.family_device_prefs(
  owner_id uuid primary key references auth.users(id) on delete cascade,
  default_device_id uuid references public.family_devices(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.family_device_prefs enable row level security;
drop policy if exists "Parents read their device prefs" on public.family_device_prefs;
create policy "Parents read their device prefs" on public.family_device_prefs
  for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.family_device_prefs from anon, authenticated;
grant select on public.family_device_prefs to authenticated;

create or replace function public.family_device_set_default(p_device uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if p_device is not null and not exists(select 1 from public.family_devices d
      where d.id = p_device and d.owner_id = me and d.status = 'active') then
    raise exception 'Device not found' using errcode = 'P0002';
  end if;
  insert into public.family_device_prefs(owner_id, default_device_id, updated_at) values (me, p_device, now())
  on conflict (owner_id) do update set default_device_id = excluded.default_device_id, updated_at = now();
end $$;
revoke all on function public.family_device_set_default(uuid) from public, anon;
grant execute on function public.family_device_set_default(uuid) to authenticated;

-- Removing a device that was the default falls back to the parent's iPhone.
create or replace function public.family_device_clear_default()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'removed' then
    update public.family_device_prefs set default_device_id = null, updated_at = now() where default_device_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists family_devices_clear_default on public.family_devices;
create trigger family_devices_clear_default after update of status on public.family_devices
  for each row when (new.status = 'removed') execute function public.family_device_clear_default();

drop function if exists public.family_device_command(uuid, text, int);
drop function if exists public.family_device_update(uuid, text, uuid);

-- Parent: queue a command for one of their devices. One active session per device: starting on a busy
-- device is refused with who is using it and the time left, so the parent can extend or end it instead.
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
    where family_device_id = d.id and status = 'active' order by started_at desc limit 1;
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
revoke all on function public.family_device_command(uuid, text, int, uuid) from public, anon;
grant execute on function public.family_device_command(uuid, text, int, uuid) to authenticated;

create or replace function public.family_device_rename(p_device uuid, p_name text)
returns public.family_devices language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); d public.family_devices; v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if v_name is null then raise exception 'Enter a name' using errcode = '22023'; end if;
  update public.family_devices set name = left(v_name, 60), updated_at = now()
    where id = p_device and owner_id = me and status = 'active' returning * into d;
  if d.id is null then raise exception 'Device not found' using errcode = 'P0002'; end if;
  perform public.family_device_wake(d.id);
  return d;
end $$;
revoke all on function public.family_device_rename(uuid, text) from public, anon;
grant execute on function public.family_device_rename(uuid, text) to authenticated;

-- The satellite shows a child only while that child's session is running.
create or replace function public.satellite_state(d public.family_devices)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'linked', true,
    'device', jsonb_build_object('id', d.id, 'name', d.name, 'device_type', d.device_type, 'status', d.status,
      'recovery_hash', encode(extensions.digest(d.id::text || ':' || d.recovery_code, 'sha256'), 'hex'),
      'acked_seq', d.acked_seq),
    'entitlement', public.screen_break_entitlement_of(d.owner_id),
    'children', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.created_at)
      from public.family_children c where c.owner_id = d.owner_id and not c.watch_only), '[]'::jsonb),
    'commands', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'type', c.type, 'seq', c.seq,
        'session_id', c.session_id, 'child_id', c.child_id,
        'child_name', (select ch.name from public.family_children ch where ch.id = c.child_id),
        'minutes', c.minutes, 'created_at', c.created_at, 'expires_at', c.expires_at, 'status', c.status) order by c.seq)
      from public.family_device_commands c
      where c.device_id = d.id and c.status in ('pending','delivered') and c.expires_at > now()
        and c.seq > d.acked_seq), '[]'::jsonb),
    'server_now', now())
$$;
revoke all on function public.satellite_state(public.family_devices) from public, anon, authenticated;

grant execute on function public.family_device_finalize_unlink(uuid) to service_role;
grant execute on function public.screen_break_entitlement_of(uuid) to service_role;
grant execute on function public.is_satellite(uuid) to service_role;
