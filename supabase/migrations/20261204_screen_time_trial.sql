-- Screen Time & Stress shares the 14-day trial with Family Screen Break: one trial per account,
-- started by whichever is used first.
comment on table public.screen_break_trials is 'One 14-day trial per account, shared by Family Screen Break and Screen Time & Stress.';

-- Starts the shared trial when Screen Time tracking is turned on (no-op with Plus or a trial already started).
create or replace function public.screen_time_trial_start()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if not public.has_plus(me) then
    insert into public.screen_break_trials(owner_id, started_at) values (me, now())
    on conflict (owner_id) do nothing;
  end if;
  return public.screen_break_entitlement();
end $$;
revoke all on function public.screen_time_trial_start() from public, anon;
grant execute on function public.screen_time_trial_start() to authenticated;
