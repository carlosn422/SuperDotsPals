alter table public.wellness_journal
  add column if not exists energy_level text check (energy_level in ('energized','tired','neutral')),
  add column if not exists stress_factors text[] not null default '{}'::text[];
