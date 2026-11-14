-- Turn on daily deletion of health readings past the retention limit (accounts created from 2026-11-10: Free 7 days, Plus 30).
-- 09:15 UTC = 03:15 US Central. cron.schedule with an existing job name updates it.
create extension if not exists pg_cron;
select cron.schedule('purge-old-health-readings', '15 9 * * *', 'select public.purge_old_health_readings()');
