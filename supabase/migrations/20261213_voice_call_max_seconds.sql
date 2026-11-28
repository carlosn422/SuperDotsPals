-- A call that never reports its end counts for at most the length it was allowed, not a flat 5 minutes.
alter table public.voice_calls add column if not exists max_seconds integer check (max_seconds between 0 and 3600);

create or replace function public.voice_minutes_status(p_user uuid)
returns table (cap integer, used_this_month numeric, extra_minutes numeric, minutes_left numeric)
language sql stable security definer set search_path = public as $$
  with s as (select coalesce((select monthly_minutes_cap from public.voice_settings where id limit 1), 60) as cap),
  m as (
    select date_trunc('month', started_at, 'UTC') as mo,
           sum(coalesce(duration_seconds, least(coalesce(max_seconds, 300), extract(epoch from now() - started_at)))) / 60.0 as used
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
