-- Keep repeated Apple Health syncs idempotent while preserving owner-only access.
alter table public.wellness_readings add column if not exists source_record_key text;
create unique index if not exists wellness_readings_origin_unique
  on public.wellness_readings(user_id,source,metric,source_record_key);
drop policy if exists "own readings update" on public.wellness_readings;
create policy "own readings update" on public.wellness_readings
  for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
