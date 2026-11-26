-- Lock and unlock a family device without a timer (Apple Watch Lock page, Family Devices).
alter table public.family_device_commands drop constraint if exists family_device_commands_type_check;
alter table public.family_device_commands add constraint family_device_commands_type_check
  check (type in ('START_SESSION','EXTEND_SESSION','END_SESSION','LOCK_APPS','UNLOCK_APPS','REQUEST_STATUS','UNLINK_DEVICE'));

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
  if v_type not in ('START_SESSION','EXTEND_SESSION','END_SESSION','LOCK_APPS','UNLOCK_APPS','REQUEST_STATUS','UNLINK_DEVICE') then
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
  elsif v_type = 'UNLOCK_APPS' then
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
