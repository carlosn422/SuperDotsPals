-- Nightly removal of guest (anonymous) accounts that were opened once and never used:
-- older than 30 days, no app use after their first day, nothing saved, no purchases, not a Family device.
-- Every table referencing auth.users cascades or sets null, so deleting the auth user removes their rows.
create or replace function public.purge_abandoned_guests() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
 with doomed as (
  select u.id from auth.users u
  where u.is_anonymous
   and u.created_at < now() - interval '30 days'
   and coalesce(u.last_sign_in_at, u.created_at) < u.created_at + interval '1 day'
   and not exists (select 1 from auth.sessions s where s.user_id = u.id and coalesce(s.refreshed_at, s.updated_at, s.created_at) >= u.created_at + interval '1 day')
   and not exists (select 1 from public.mood_entries x where x.user_id = u.id)
   and not exists (select 1 from public.wellness_journal x where x.user_id = u.id)
   and not exists (select 1 from public.wellness_messages x where x.user_id = u.id)
   and not exists (select 1 from public.wellness_activities x where x.user_id = u.id)
   and not exists (select 1 from public.habit_entries x where x.user_id = u.id)
   and not exists (select 1 from public.voice_calls x where x.user_id = u.id)
   and not exists (select 1 from public.spiritual_sessions x where x.user_id = u.id)
   and not exists (select 1 from public.plus_entitlements x where x.user_id = u.id)
   and not exists (select 1 from public.voice_minute_purchases x where x.user_id = u.id)
   and not exists (select 1 from public.circle_profiles x where x.user_id = u.id)
   and not exists (select 1 from public.connected_devices x where x.user_id = u.id)
   and not exists (select 1 from public.family_devices x where x.auth_user_id = u.id)
 )
 delete from auth.users where id in (select id from doomed);
 get diagnostics n = row_count;
 return n;
end $$;
revoke all on function public.purge_abandoned_guests() from public, anon, authenticated;
-- 09:30 UTC = 03:30 US Central.
create extension if not exists pg_cron;
select cron.schedule('purge-abandoned-guests', '30 9 * * *', 'select public.purge_abandoned_guests()');
