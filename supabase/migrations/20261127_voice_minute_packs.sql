-- Extra voice minutes bought as consumable in-app purchases (credited by the RevenueCat webhook).
create table if not exists public.voice_minute_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  minutes integer not null check (minutes > 0),
  transaction_id text not null unique,
  store text,
  environment text,
  purchased_at timestamptz not null default now(),
  refunded_at timestamptz
);
create index if not exists voice_minute_purchases_user_idx on public.voice_minute_purchases (user_id);
alter table public.voice_minute_purchases enable row level security;
drop policy if exists "Users read own minute purchases" on public.voice_minute_purchases;
create policy "Users read own minute purchases" on public.voice_minute_purchases for select to authenticated using (user_id = auth.uid());

-- Monthly minutes are used first; bought minutes cover anything over the cap and never expire.
-- Calls that never reported an end count as their elapsed time, up to one 5-minute call.
create or replace function public.voice_minutes_status(p_user uuid)
returns table (cap integer, used_this_month numeric, extra_minutes numeric, minutes_left numeric)
language sql stable security definer set search_path = public as $$
  with s as (select coalesce((select monthly_minutes_cap from public.voice_settings where id limit 1), 60) as cap),
  m as (
    select date_trunc('month', started_at, 'UTC') as mo,
           sum(coalesce(duration_seconds, least(300, extract(epoch from now() - started_at)))) / 60.0 as used
    from public.voice_calls where user_id = p_user group by 1
  ),
  b as (select coalesce(sum(minutes), 0) as bought from public.voice_minute_purchases where user_id = p_user and refunded_at is null),
  t as (
    select s.cap,
           coalesce((select used from m where mo = date_trunc('month', now(), 'UTC')), 0) as used_now,
           greatest(0, b.bought - coalesce((select sum(greatest(0, m.used - s.cap)) from m), 0)) as extra
    from s, b
  )
  select t.cap, round(t.used_now, 1), round(t.extra, 1), round(greatest(0, t.cap - t.used_now) + t.extra, 1) from t;
$$;
revoke all on function public.voice_minutes_status(uuid) from public, anon, authenticated;
grant execute on function public.voice_minutes_status(uuid) to service_role;

create or replace function public.my_voice_minutes()
returns table (cap integer, used_this_month numeric, extra_minutes numeric, minutes_left numeric)
language sql stable security definer set search_path = public as $$
  select * from public.voice_minutes_status(auth.uid());
$$;
revoke all on function public.my_voice_minutes() from public, anon;
grant execute on function public.my_voice_minutes() to authenticated;
