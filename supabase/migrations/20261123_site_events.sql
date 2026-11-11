-- Cookie-free website analytics written by website/server.js with the service role. No IPs or personal data.
create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event text not null check (event in ('pageview','appstore_click','waitlist_signup')),
  path text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  placement text,
  device text check (device in ('mobile','desktop'))
);
create index if not exists site_events_created_at on public.site_events(created_at desc);
alter table public.site_events enable row level security;
revoke all on public.site_events from anon, authenticated;
