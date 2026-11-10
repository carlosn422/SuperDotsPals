-- Health readings retention for accounts created from 2026-11-10: Plus keeps 30 days, Free keeps 7 (the app shows 3).
-- Older accounts are not affected. Readings older than the limit are skipped on insert; nothing existing is deleted.
create or replace function public.health_keep_days(uid uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from auth.users u where u.id = uid and u.created_at >= '2026-11-10T00:00:00Z') then null
    when public.has_plus(uid) then 30
    else 7 end;
$$;
revoke execute on function public.health_keep_days(uuid) from public, anon, authenticated;

create or replace function public.wellness_readings_retention() returns trigger
language plpgsql security definer set search_path = '' as $$
declare keep int := public.health_keep_days(new.user_id);
begin
  if keep is not null and new.recorded_at < now() - make_interval(days => keep) then return null; end if;
  return new;
end $$;
revoke execute on function public.wellness_readings_retention() from public, anon, authenticated;

drop trigger if exists wellness_readings_retention on public.wellness_readings;
create trigger wellness_readings_retention before insert on public.wellness_readings
  for each row execute function public.wellness_readings_retention();

-- Deletes readings past the limit for those accounts. Not scheduled yet; to turn on:
--   select cron.schedule('purge-old-health-readings', '15 9 * * *', 'select public.purge_old_health_readings()');
create or replace function public.purge_old_health_readings() returns bigint
language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  delete from public.wellness_readings r
  where public.health_keep_days(r.user_id) is not null
    and r.recorded_at < now() - make_interval(days => public.health_keep_days(r.user_id));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_old_health_readings() from public, anon, authenticated;
