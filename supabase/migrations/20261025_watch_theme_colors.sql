-- Watch themes are colours only (no character names).
update public.user_settings set watch_theme = case watch_theme when 'bloop' then 'purple' when 'poppy' then 'pink' when 'mochi' then 'blue' when 'zuzu' then 'gold' when 'nori' then 'green' else watch_theme end;
alter table public.user_settings alter column watch_theme set default 'purple';
