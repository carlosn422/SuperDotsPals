-- Six-digit watch link codes replace QR codes. A code is unique among pending requests and expires with the request.
alter table public.watch_pairing_requests add column if not exists pair_code text;
alter table public.watch_pairing_requests drop constraint if exists watch_pairing_requests_pair_code_check;
alter table public.watch_pairing_requests add constraint watch_pairing_requests_pair_code_check check (pair_code is null or pair_code ~ '^[0-9]{6}$');
create unique index if not exists watch_pairing_requests_pending_code on public.watch_pairing_requests (pair_code) where status = 'pending' and pair_code is not null;

-- Failed code attempts per account, for rate limiting guesses. Only the service role reads or writes it.
create table if not exists public.watch_pairing_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists watch_pairing_code_attempts_user on public.watch_pairing_code_attempts (user_id, created_at desc);
alter table public.watch_pairing_code_attempts enable row level security;
revoke all on public.watch_pairing_code_attempts from anon, authenticated;
