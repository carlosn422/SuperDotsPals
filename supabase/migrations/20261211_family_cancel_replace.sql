-- Canceling a replacement start (20261210, p_replace) also cancels the END_SESSION queued just before it
-- for the other member's timer, so that timer keeps running.
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
  if v_cmd.type = 'START_SESSION' then
    update public.family_device_commands set status = 'canceled'
      where device_id = v_cmd.device_id and owner_id = me and seq = v_cmd.seq - 1 and type = 'END_SESSION'
        and status in ('pending','delivered') and session_id is distinct from v_cmd.session_id;
  end if;
  return to_jsonb(v_cmd);
end $$;
revoke all on function public.family_device_cancel_command(uuid) from public, anon;
grant execute on function public.family_device_cancel_command(uuid) to authenticated;
