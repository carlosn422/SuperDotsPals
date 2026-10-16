-- Persist user-configurable Apple text-to-speech preferences.
alter table public.user_settings
  add column if not exists voice_gender text not null default 'female'
    check (voice_gender in ('female','male')),
  add column if not exists voice_style text not null default 'gentle'
    check (voice_style in ('gentle','natural')),
  add column if not exists voice_speed numeric(3,2) not null default 0.90
    check (voice_speed between 0.75 and 1.10),
  add column if not exists voice_identifier text;
