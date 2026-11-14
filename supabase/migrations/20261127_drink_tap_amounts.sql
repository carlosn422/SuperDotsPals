-- Amount logged per tap of the Apple Watch water / caffeine buttons and watch-face widgets.
alter table public.user_settings
  add column if not exists water_tap_oz numeric not null default 8 check (water_tap_oz > 0 and water_tap_oz <= 64),
  add column if not exists caffeine_tap_mg numeric not null default 95 check (caffeine_tap_mg > 0 and caffeine_tap_mg <= 500);
