-- MoodPals Founding Members Giveaway, plus subscription and email history.
-- Promotion and entries are switched on only by the website's GIVEAWAY_* environment variables;
-- nothing in this migration makes the giveaway public. All tables are service-role only (RLS on, no policies).

-- 1. Richer RevenueCat state so only verified paying members are counted.
alter table public.plus_entitlements
  add column if not exists period_type text,
  add column if not exists original_transaction_id text,
  add column if not exists will_renew boolean,
  add column if not exists refunded_at timestamptz,
  add column if not exists first_paid_at timestamptz;

create table if not exists public.subscription_events (
  id text primary key, -- RevenueCat event id: repeats of the same webhook are ignored
  user_id uuid,
  event_type text not null,
  product_id text,
  store text,
  environment text,
  period_type text,
  transaction_id text,
  original_transaction_id text,
  cancel_reason text,
  price_usd numeric(10,2),
  purchased_at timestamptz,
  expires_at timestamptz,
  event_at timestamptz not null,
  stale boolean not null default false,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists subscription_events_user_idx on public.subscription_events (user_id, event_at desc);
create index if not exists subscription_events_type_idx on public.subscription_events (event_type, event_at desc);
alter table public.subscription_events enable row level security;

-- 2. Campaign, entries, drawings and winners.
create table if not exists public.giveaway_campaigns (
  id text primary key check (id ~ '^[a-z0-9-]{1,64}$'),
  name text not null,
  prize_description text not null,
  prize_count int not null default 2 check (prize_count between 1 and 10),
  prize_value_usd numeric(10,2),
  target_members int not null default 1000 check (target_members > 0),
  start_date timestamptz,
  end_date timestamptz,
  drawing_date timestamptz,
  status text not null default 'draft' check (status in ('draft','active','closed','completed','cancelled')),
  official_rules_url text,
  approved_at timestamptz,
  approved_by text,
  min_age int not null default 18,
  eligible_countries text[] not null default '{US}',
  excluded_regions text[] not null default '{}',
  sponsor_name text,
  sponsor_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date > start_date),
  check (status = 'draft' or (approved_at is not null and start_date is not null and end_date is not null))
);
alter table public.giveaway_campaigns enable row level security;

insert into public.giveaway_campaigns (id, name, prize_description, prize_count, target_members)
values ('founding-members-2026', 'MoodPals Founding Members Giveaway', 'Apple Watch SE 3', 2, 1000)
on conflict (id) do nothing;

create table if not exists public.giveaway_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.giveaway_campaigns(id),
  entrant_id uuid references auth.users(id) on delete cascade,
  email text not null check (email = lower(email) and length(email) <= 254),
  first_name text check (first_name is null or length(first_name) between 1 and 80),
  last_name text check (last_name is null or length(last_name) between 1 and 80),
  region text,
  country text,
  entry_method text not null default 'app_account' check (entry_method in ('app_account','mail_in')),
  eligibility_status text not null default 'eligible' check (eligibility_status in ('eligible','ineligible','disqualified')),
  eligibility_note text,
  entered_at timestamptz not null default now(),
  unique (campaign_id, email),
  unique (campaign_id, entrant_id)
);
create index if not exists giveaway_entries_campaign_idx on public.giveaway_entries (campaign_id, eligibility_status);
alter table public.giveaway_entries enable row level security;

create table if not exists public.giveaway_drawings (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.giveaway_campaigns(id),
  drawn_at timestamptz not null default now(),
  drawn_by text not null,
  seed text not null,               -- random seed; order = sha256(seed || entry id), so the draw can be re-checked
  pool_size int not null,
  pool_sha256 text not null,        -- hash of the sorted eligible entry ids at draw time
  winners_requested int not null,
  alternates_requested int not null,
  notes text
);
alter table public.giveaway_drawings enable row level security;

create table if not exists public.giveaway_winners (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.giveaway_campaigns(id),
  drawing_id uuid not null references public.giveaway_drawings(id),
  entry_id uuid references public.giveaway_entries(id) on delete set null, -- null if the entrant later deleted their account
  role text not null check (role in ('winner','alternate')),
  draw_order int not null,
  status text not null default 'selected' check (status in ('selected','notified','verified','declined','forfeited','awarded')),
  notes text,
  updated_by text,
  updated_at timestamptz not null default now(),
  unique (campaign_id, entry_id)
);
alter table public.giveaway_winners enable row level security;

-- 3. Email outbox and history (sent by the email-outbox Edge Function through Resend).
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  to_email text,
  email_type text not null check (email_type in ('purchase_welcome','membership_30_days','membership_expired','giveaway_entry','giveaway_winner')),
  idempotency_key text not null unique,
  payload jsonb not null default '{}',
  delivery_status text not null default 'queued' check (delivery_status in ('queued','sending','sent','failed','suppressed')),
  attempts int not null default 0,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  check (user_id is not null or to_email is not null)
);
create index if not exists email_events_status_idx on public.email_events (delivery_status, created_at);
alter table public.email_events enable row level security;

revoke all on public.subscription_events, public.giveaway_campaigns, public.giveaway_entries,
  public.giveaway_drawings, public.giveaway_winners, public.email_events from anon, authenticated;

-- 4. Verified paying members: production App Store / Play / Stripe purchases with a paid period that has not
-- ended, excluding trials, promotional grants, sandbox, refunds and expired memberships. One row per account.
create or replace function public.giveaway_paid_member_count()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from plus_entitlements
  where is_active
    and environment = 'PRODUCTION'
    and store in ('APP_STORE','MAC_APP_STORE','PLAY_STORE','STRIPE')
    and coalesce(period_type, 'NORMAL') not in ('TRIAL','PROMOTIONAL')
    and refunded_at is null
    and expires_at > now();
$$;

create or replace function public.giveaway_entries_open(c public.giveaway_campaigns)
returns boolean language sql stable as $$
  select c.status = 'active' and c.approved_at is not null
     and c.start_date <= now() and now() < c.end_date;
$$;

-- Aggregate numbers only: no emails, transaction ids or individual records.
create or replace function public.giveaway_public_stats(p_campaign text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', c.id, 'name', c.name, 'status', c.status,
    'approved', c.approved_at is not null,
    'entries_open', giveaway_entries_open(c),
    'target_members', c.target_members,
    'current_paid_members', giveaway_paid_member_count(),
    'prize_count', c.prize_count,
    'prize_description', c.prize_description,
    'prize_value_usd', c.prize_value_usd,
    'start_date', c.start_date, 'end_date', c.end_date, 'drawing_date', c.drawing_date,
    'min_age', c.min_age, 'eligible_countries', c.eligible_countries, 'excluded_regions', c.excluded_regions,
    'sponsor_name', c.sponsor_name, 'sponsor_address', c.sponsor_address,
    'official_rules_url', c.official_rules_url)
  from giveaway_campaigns c where c.id = p_campaign;
$$;

-- Entry = a registered MoodPals app account (not a guest) with a confirmed email, created before the entry period
-- ends. One entry per account; accounts are free, so no purchase is needed. The website calls this only while
-- GIVEAWAY_ENTRIES_ENABLED=true on Hostinger. A birth year from onboarding under the minimum age marks the entry ineligible.
create or replace function public.giveaway_sync_entries(p_campaign text)
returns int language plpgsql security definer set search_path = public, auth as $$
declare c giveaway_campaigns; n int;
begin
  select * into c from giveaway_campaigns where id = p_campaign;
  if not found or c.approved_at is null or c.status not in ('active','closed') or now() < c.start_date then return 0; end if;
  insert into giveaway_entries (campaign_id, entrant_id, email, first_name, entry_method, eligibility_status, eligibility_note, entered_at)
  select c.id, u.id, lower(u.email), nullif(left(trim(p.display_name), 80), ''), 'app_account',
         case when p.birth_year is not null and extract(year from c.end_date)::int - p.birth_year < c.min_age then 'ineligible' else 'eligible' end,
         case when p.birth_year is not null and extract(year from c.end_date)::int - p.birth_year < c.min_age then 'Under the minimum age (birth year from onboarding)' end,
         greatest(u.email_confirmed_at, c.start_date)
  from auth.users u left join profiles p on p.id = u.id
  where not coalesce(u.is_anonymous, false) and u.email is not null and u.email_confirmed_at is not null
    and u.created_at < c.end_date and u.email_confirmed_at < c.end_date
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.giveaway_admin_stats(p_campaign text)
returns json language sql stable security definer set search_path = public, auth as $$
  with paid as (
    select * from plus_entitlements
    where is_active and environment = 'PRODUCTION' and store in ('APP_STORE','MAC_APP_STORE','PLAY_STORE','STRIPE')
      and coalesce(period_type, 'NORMAL') not in ('TRIAL','PROMOTIONAL') and refunded_at is null and expires_at > now()
  ), ev as (
    select * from subscription_events where environment = 'PRODUCTION' and event_at > now() - interval '30 days' and not stale
  )
  select json_build_object(
    'registered_accounts', (select count(*) from auth.users where not coalesce(is_anonymous, false)),
    'guest_accounts', (select count(*) from auth.users where coalesce(is_anonymous, false)),
    'active_paid_members', (select count(*) from paid),
    'monthly_members', (select count(*) from paid where product_id ilike '%month%'),
    'annual_members', (select count(*) from paid where product_id ilike '%annual%' or product_id ilike '%year%'),
    'cancelled_still_paid', (select count(*) from paid where will_renew is false),
    'new_purchases_30d', (select count(*) from ev where event_type = 'INITIAL_PURCHASE' and coalesce(period_type,'NORMAL') <> 'TRIAL'),
    'trial_starts_30d', (select count(*) from ev where event_type = 'INITIAL_PURCHASE' and period_type = 'TRIAL'),
    'renewals_30d', (select count(*) from ev where event_type = 'RENEWAL'),
    'cancellations_30d', (select count(*) from ev where event_type = 'CANCELLATION' and coalesce(cancel_reason,'') <> 'CUSTOMER_SUPPORT'),
    'refunds_30d', (select count(*) from ev where event_type = 'CANCELLATION' and cancel_reason = 'CUSTOMER_SUPPORT'),
    'expirations_30d', (select count(*) from ev where event_type = 'EXPIRATION'),
    'estimated_mrr_usd', round((select coalesce(sum(case when product_id ilike '%annual%' or product_id ilike '%year%' then 19.99 / 12 else 1.99 end), 0) from paid), 2),
    'entries_total', (select count(*) from giveaway_entries where campaign_id = p_campaign),
    'entries_valid', (select count(*) from giveaway_entries where campaign_id = p_campaign and eligibility_status = 'eligible'),
    'winners', (select count(*) from giveaway_winners where campaign_id = p_campaign and role = 'winner'),
    'winners_verified', (select count(*) from giveaway_winners where campaign_id = p_campaign and role = 'winner' and status in ('verified','awarded')),
    'alternates', (select count(*) from giveaway_winners where campaign_id = p_campaign and role = 'alternate'),
    'emails_failed', (select count(*) from email_events where delivery_status = 'failed'),
    'emails_queued', (select count(*) from email_events where delivery_status = 'queued'));
$$;

-- Random drawing among eligible entries. Never runs on its own: an admin triggers it after the entry period ends.
-- Every eligible entry has exactly one chance; paid status plays no part.
create or replace function public.giveaway_draw(p_campaign text, p_winners int, p_alternates int, p_by text, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare c giveaway_campaigns; v_seed text := encode(gen_random_bytes(32), 'hex'); v_drawing uuid;
  v_have int; v_pool int; v_hash text;
begin
  select * into c from giveaway_campaigns where id = p_campaign for update;
  if not found then raise exception 'Unknown campaign'; end if;
  if c.approved_at is null or c.status in ('draft','cancelled') then raise exception 'Campaign rules are not approved'; end if;
  if now() < c.end_date then raise exception 'The entry period has not ended'; end if;
  if p_winners < 0 or p_alternates < 0 or p_winners + p_alternates = 0 then raise exception 'Nothing to draw'; end if;
  select count(*) into v_have from giveaway_winners where campaign_id = p_campaign and role = 'winner';
  if v_have + p_winners > c.prize_count then raise exception 'Only % winners allowed (% already drawn)', c.prize_count, v_have; end if;
  select count(*), encode(digest(coalesce(string_agg(id::text, ',' order by id), ''), 'sha256'), 'hex')
    into v_pool, v_hash
    from giveaway_entries e
   where e.campaign_id = p_campaign and e.eligibility_status = 'eligible'
     and not exists (select 1 from giveaway_winners w where w.entry_id = e.id);
  if v_pool < p_winners + p_alternates then raise exception 'Not enough eligible entries (%)', v_pool; end if;
  insert into giveaway_drawings (campaign_id, drawn_by, seed, pool_size, pool_sha256, winners_requested, alternates_requested, notes)
  values (p_campaign, p_by, v_seed, v_pool, v_hash, p_winners, p_alternates, p_notes) returning id into v_drawing;
  insert into giveaway_winners (campaign_id, drawing_id, entry_id, role, draw_order, updated_by)
  select p_campaign, v_drawing, id, case when rn <= p_winners then 'winner' else 'alternate' end, rn, p_by
  from (select e.id, row_number() over (order by digest(v_seed || e.id::text, 'sha256')) rn
          from giveaway_entries e
         where e.campaign_id = p_campaign and e.eligibility_status = 'eligible'
           and not exists (select 1 from giveaway_winners w where w.entry_id = e.id)) s
  where rn <= p_winners + p_alternates;
  return v_drawing;
end $$;

-- 30 days of continuous paid membership: a thank-you email (not a giveaway requirement).
create or replace function public.queue_membership_milestones()
returns int language sql security definer set search_path = public as $$
  with ins as (
    insert into email_events (user_id, email_type, idempotency_key, payload)
    select user_id, 'membership_30_days', 'membership_30_days:' || user_id, json_build_object('product_id', product_id)
    from plus_entitlements
    where is_active and environment = 'PRODUCTION' and refunded_at is null and expires_at > now()
      and first_paid_at <= now() - interval '30 days'
    on conflict (idempotency_key) do nothing
    returning 1)
  select count(*)::int from ins;
$$;

-- Picks queued emails for the outbox worker; a row stuck in 'sending' for 10 minutes is retried.
create or replace function public.claim_email_events(p_limit int default 20)
returns setof public.email_events language sql security definer set search_path = public as $$
  update email_events set delivery_status = 'sending', attempts = attempts + 1, updated_at = now()
  where id in (
    select id from email_events
    where (delivery_status = 'queued' or (delivery_status = 'sending' and updated_at < now() - interval '10 minutes'))
      and attempts < 5
    order by created_at limit p_limit for update skip locked)
  returning *;
$$;

-- Shared key for the cron → email-outbox call, kept in Vault.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'email_outbox_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'email_outbox_key');
  end if;
end $$;

create or replace function public.email_outbox_key_ok(p_key text)
returns boolean language sql stable security definer set search_path = public, vault as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'email_outbox_key' and decrypted_secret = p_key);
$$;

revoke all on function public.giveaway_paid_member_count(), public.giveaway_public_stats(text),
  public.giveaway_sync_entries(text), public.giveaway_admin_stats(text),
  public.giveaway_draw(text,int,int,text,text), public.queue_membership_milestones(), public.claim_email_events(int),
  public.email_outbox_key_ok(text) from public, anon, authenticated;
grant execute on function public.giveaway_paid_member_count(), public.giveaway_public_stats(text),
  public.giveaway_sync_entries(text), public.giveaway_admin_stats(text),
  public.giveaway_draw(text,int,int,text,text), public.queue_membership_milestones(), public.claim_email_events(int),
  public.email_outbox_key_ok(text) to service_role;

-- 5. Schedules: milestone emails daily, outbox every minute while anything is queued.
create extension if not exists pg_cron;
select cron.unschedule(jobname) from cron.job where jobname in ('membership-milestones', 'email-outbox');
select cron.schedule('membership-milestones', '15 15 * * *', $$select public.queue_membership_milestones()$$);
select cron.schedule('email-outbox', '* * * * *', $$
  select net.http_post(
    url := 'https://hzoauxxpvrgahlavxmvp.supabase.co/functions/v1/email-outbox',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-outbox-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'email_outbox_key')),
    body := '{}'::jsonb)
  where exists (select 1 from public.email_events where delivery_status = 'queued'
                or (delivery_status = 'sending' and updated_at < now() - interval '10 minutes'))
$$);
