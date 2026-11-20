-- Screen Break session history is kept for 13 months (Year view + comparison with last year), then deleted daily.
create or replace function public.purge_old_screen_break_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  delete from public.screen_break_sessions
  where status <> 'active' and coalesce(ended_at, deadline_at) < now() - interval '13 months';
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke all on function public.purge_old_screen_break_sessions() from public, anon, authenticated;

-- 06:00 UTC = midnight US Central (CST; 1:00 during daylight saving). Re-running updates the job.
create extension if not exists pg_cron;
select cron.schedule('purge-old-screen-break-sessions', '0 6 * * *', 'select public.purge_old_screen_break_sessions()');
