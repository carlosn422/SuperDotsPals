-- Family devices: after the parent enters the code, the device itself must approve the link.
alter table public.watch_pairing_requests drop constraint if exists watch_pairing_requests_status_check;
alter table public.watch_pairing_requests add constraint watch_pairing_requests_status_check
  check (status in ('pending','confirm','declined','approved','claimed','expired'));
