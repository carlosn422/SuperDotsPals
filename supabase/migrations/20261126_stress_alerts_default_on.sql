-- HRV stress alerts are on by default (threshold Elevated = 60) and share one 3-hour cooldown across iPhone and Apple Watch.
alter table public.user_settings
  alter column stress_alerts_enabled set default true,
  alter column stress_alert_threshold set default 60,
  add column if not exists stress_alert_last_at timestamptz,
  add column if not exists phone_hrv_at timestamptz;
update public.user_settings set stress_alerts_enabled = true, stress_alert_threshold = 60 where not stress_alerts_enabled;

-- Newest HRV sample the iPhone read from Apple Health; the watch only alerts when this is stale (Health sync stopped).
create or replace function public.note_phone_hrv(at timestamptz) returns void
language sql security definer set search_path = '' as $$
  update public.user_settings set phone_hrv_at = greatest(coalesce(phone_hrv_at, at), at) where user_id = (select auth.uid());
$$;

-- True when this device should show the alert: enabled, at or above the threshold, no alert in the last 3 hours,
-- and (from the watch) the iPhone has not read HRV within 6 hours of this sample.
create or replace function public.claim_stress_alert(score int, from_watch boolean default false, sample_at timestamptz default null) returns boolean
language sql security definer set search_path = '' as $$
  with c as (
    update public.user_settings s set stress_alert_last_at = now()
    where s.user_id = (select auth.uid()) and s.stress_alerts_enabled and score >= s.stress_alert_threshold
      and (s.stress_alert_last_at is null or s.stress_alert_last_at < now() - interval '3 hours')
      and not (from_watch and s.phone_hrv_at is not null and s.phone_hrv_at > coalesce(sample_at, now()) - interval '6 hours')
    returning 1)
  select exists (select 1 from c);
$$;
revoke execute on function public.note_phone_hrv(timestamptz) from public, anon;
revoke execute on function public.claim_stress_alert(int, boolean, timestamptz) from public, anon;
grant execute on function public.note_phone_hrv(timestamptz) to authenticated;
grant execute on function public.claim_stress_alert(int, boolean, timestamptz) to authenticated;
