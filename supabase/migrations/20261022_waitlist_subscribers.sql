-- Early-subscriber waitlist for the MoodPals landing page (website/).
-- Written only by the website server with the service-role key; RLS with no policies keeps it private.
create table if not exists public.waitlist_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) between 5 and 254),
  first_name text check (char_length(first_name) <= 80),
  interests text[] not null default '{}',
  source text not null default 'website',
  created_at timestamptz not null default now()
);
alter table public.waitlist_subscribers enable row level security;
