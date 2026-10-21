-- StressWatch-style dashboard: more Apple Health metrics, derived stress scores and opt-in stress alerts.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.wellness_readings'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%metric%' or pg_get_constraintdef(oid) ilike '%source%')
      and pg_get_constraintdef(oid) not ilike '%source_record_key%'
  loop
    execute format('alter table public.wellness_readings drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.wellness_readings add constraint wellness_readings_metric_check check (metric = any (array[
  'hrv','resting_heart_rate','stress_score','sleep_minutes','steps','daylight_minutes','mindfulness_minutes','noise_db',
  'heart_rate','active_energy_kcal','exercise_minutes','stand_hours',
  'sleep_deep_minutes','sleep_rem_minutes','sleep_core_minutes','sleep_awake_minutes','sleep_heart_rate'
]::text[]));

-- 'computed' rows are derived on-device from the user's own HealthKit readings (e.g. stress_score).
alter table public.wellness_readings add constraint wellness_readings_source_check
  check (source = any (array['manual','healthkit','demo','computed']::text[]));

create index if not exists wellness_readings_user_metric_time
  on public.wellness_readings(user_id, metric, recorded_at desc);

alter table public.user_settings
  add column if not exists stress_alerts_enabled boolean not null default false,
  add column if not exists stress_alert_threshold smallint not null default 75;
alter table public.user_settings drop constraint if exists user_settings_stress_alert_threshold_check;
alter table public.user_settings add constraint user_settings_stress_alert_threshold_check
  check (stress_alert_threshold between 50 and 95);
