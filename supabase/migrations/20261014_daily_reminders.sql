alter table public.user_settings
  add column if not exists daily_reminders_enabled boolean not null default false,
  add column if not exists daily_reminder_hour smallint not null default 9 check (daily_reminder_hour between 0 and 23),
  add column if not exists daily_reminder_minute smallint not null default 0 check (daily_reminder_minute between 0 and 59);
