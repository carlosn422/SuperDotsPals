-- MoodPals Plus entitlement mirrored from RevenueCat webhooks. Written only by the
-- revenuecat-webhook Edge Function (service role); users can read their own row.
create table if not exists public.plus_entitlements(
 user_id uuid primary key references auth.users(id) on delete cascade,
 is_active boolean not null default false,
 product_id text,
 store text,
 environment text,
 expires_at timestamptz,
 last_event_type text,
 last_event_id text,
 last_event_at timestamptz,
 updated_at timestamptz not null default now()
);

alter table public.plus_entitlements enable row level security;

drop policy if exists "Users read own Plus entitlement" on public.plus_entitlements;
create policy "Users read own Plus entitlement" on public.plus_entitlements
 for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.has_plus(uid uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $$
 select exists(
  select 1 from public.plus_entitlements e
  where e.user_id = uid and e.is_active and (e.expires_at is null or e.expires_at > now())
 );
$$;

revoke all on function public.has_plus(uuid) from public, anon, authenticated;

-- Server-only configuration (no policies: readable by the service role only).
create table if not exists public.server_secrets(
 name text primary key,
 value text not null,
 updated_at timestamptz not null default now()
);
alter table public.server_secrets enable row level security;
revoke all on table public.server_secrets from anon, authenticated;
