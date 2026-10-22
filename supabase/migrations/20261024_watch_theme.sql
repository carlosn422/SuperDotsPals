-- Watch theme chosen on the iPhone (Settings → Watch Themes) or on the watch; read by the watch app on sync.
alter table public.user_settings add column if not exists watch_theme text not null default 'bloop' check (watch_theme ~ '^[a-z0-9_-]{1,32}$');
