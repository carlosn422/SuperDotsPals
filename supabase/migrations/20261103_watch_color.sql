-- Illustration colour chosen for each linked watch. Written only by the watch-pairing and family-profiles functions.
alter table public.connected_devices add column if not exists watch_color text;
alter table public.connected_devices drop constraint if exists connected_devices_watch_color_check;
alter table public.connected_devices add constraint connected_devices_watch_color_check
  check (watch_color is null or watch_color in ('charcoal','ivory','navy','rose','mint','lavender'));
