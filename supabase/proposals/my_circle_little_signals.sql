-- PROPOSAL ONLY — My Circle & Little Signals schema + RLS.
-- Not in supabase/migrations on purpose: do not apply until the prototype and this design are approved.
-- When approved, copy to supabase/migrations/<timestamp>_my_circle_little_signals.sql.

-- Circle-visible profile (only display name/avatar; never email).
create table public.circle_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_color text not null default '#7BC6A4',
  created_at timestamptz not null default now()
);

-- Invitation codes. Only the hash is stored; the plaintext code is shown once to the owner.
create table public.circle_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,              -- sha256(upper(code) || server pepper)
  code_hint text not null,                     -- last 2 chars, for the owner's UI
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index circle_invites_one_active on public.circle_invites(owner_id) where revoked_at is null;

-- Requests + connections. One row per unordered pair (user_low < user_high) prevents duplicates.
create type public.circle_link_status as enum ('pending','accepted','declined','blocked');
create table public.circle_links (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status public.circle_link_status not null default 'pending',
  blocked_by uuid references auth.users(id) on delete cascade,
  via_invite uuid references public.circle_invites(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (user_low < user_high),
  check (requested_by in (user_low,user_high)),
  unique (user_low,user_high)
);

-- Per-viewer friend settings (mute, hide my moods). Private to the owner.
create table public.circle_friend_settings (
  owner_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  muted boolean not null default false,
  hide_my_moods boolean not null default false,
  primary key (owner_id,friend_id)
);

-- Groups are private to their owner; members never see group names.
create table public.circle_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  icon text not null default 'star',
  color text not null default '#7139E9',
  allowed_moods text[] not null default '{}' check (allowed_moods <@ array['Joyful','Calm','Sad','Angry','Anxious','Tired']),
  created_at timestamptz not null default now()
);
create table public.circle_group_members (
  group_id uuid not null references public.circle_groups(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  primary key (group_id,member_id)
);

-- Shared moods: only the mood label. Never a journal row, HealthKit value, HRV or stress score.
create table public.circle_shared_moods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  mood text not null check (mood in ('Joyful','Calm','Sad','Angry','Anxious','Tired')),
  group_ids uuid[] not null,                 -- owner-only audit of the chosen groups
  shared_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  stopped_at timestamptz
);
-- Recipients are resolved server-side at share time (dedup across groups, honours hide_my_moods + mood permissions).
create table public.circle_mood_recipients (
  shared_mood_id uuid not null references public.circle_shared_moods(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  primary key (shared_mood_id,recipient_id)
);
create table public.circle_reactions (
  shared_mood_id uuid not null references public.circle_shared_moods(id) on delete cascade,
  reactor_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  updated_at timestamptz not null default now(),
  primary key (shared_mood_id,reactor_id)    -- one changeable reaction per person per mood
);
create table public.circle_signals (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  signal text not null check (signal in ('thinking','hug','here','sunshine','gotthis','cheer')),
  sent_at timestamptz not null default now(),
  seen_at timestamptz
);
create index circle_signals_recipient on public.circle_signals(recipient_id,sent_at desc);
create table public.circle_notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invites boolean not null default true, approvals boolean not null default true,
  signals boolean not null default true, reactions boolean not null default true,
  daily_summary boolean not null default true, quiet_hours boolean not null default true,
  show_names_in_preview boolean not null default true, show_mood_on_lock_screen boolean not null default false
);
create table public.circle_notification_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('invite','approval','signal','reaction','summary')),
  actor_id uuid references auth.users(id) on delete set null,
  ref_id uuid,
  created_at timestamptz not null default now()
);
-- Rate limiting for code attempts / signals (written only by security-definer functions).
create table public.circle_rate_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('code_attempt','signal')),
  created_at timestamptz not null default now()
);
create index circle_rate_events_idx on public.circle_rate_events(user_id,kind,created_at desc);

-- Helpers ---------------------------------------------------------------
create or replace function public.circle_are_friends(a uuid,b uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from circle_links where user_low=least(a,b) and user_high=greatest(a,b) and status='accepted');
$$;

-- RLS -------------------------------------------------------------------
alter table public.circle_profiles enable row level security;
alter table public.circle_invites enable row level security;
alter table public.circle_links enable row level security;
alter table public.circle_friend_settings enable row level security;
alter table public.circle_groups enable row level security;
alter table public.circle_group_members enable row level security;
alter table public.circle_shared_moods enable row level security;
alter table public.circle_mood_recipients enable row level security;
alter table public.circle_reactions enable row level security;
alter table public.circle_signals enable row level security;
alter table public.circle_notification_prefs enable row level security;
alter table public.circle_notification_log enable row level security;
alter table public.circle_rate_events enable row level security;  -- no policies: functions only

-- Profiles: self, and accepted friends / people with a pending link to you. No directory search.
create policy cp_select on public.circle_profiles for select to authenticated using (
  user_id=auth.uid() or exists(select 1 from circle_links l where l.status in ('accepted','pending')
    and auth.uid() in (l.user_low,l.user_high) and user_id in (l.user_low,l.user_high)));
create policy cp_upsert on public.circle_profiles for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

-- Invites: owner only. Redemption goes through circle_redeem_invite() (security definer, rate-limited).
create policy ci_owner on public.circle_invites for select to authenticated using (owner_id=auth.uid());
-- (insert/revoke via circle_regenerate_invite() so the plaintext code is generated server-side)

-- Links: both parties can read; all writes via functions (request, accept, decline, remove, block).
create policy cl_select on public.circle_links for select to authenticated using (
  auth.uid() in (user_low,user_high) and (status<>'blocked' or blocked_by=auth.uid()));

create policy cfs_owner on public.circle_friend_settings for all to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid() and public.circle_are_friends(owner_id,friend_id));
create policy cg_owner on public.circle_groups for all to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy cgm_owner on public.circle_group_members for all to authenticated
  using (exists(select 1 from circle_groups g where g.id=group_id and g.owner_id=auth.uid()))
  with check (exists(select 1 from circle_groups g where g.id=group_id and g.owner_id=auth.uid()) and public.circle_are_friends(auth.uid(),member_id));

-- Shared moods: owner always; recipient only while unexpired, not stopped, and still friends.
create policy csm_owner on public.circle_shared_moods for select to authenticated using (owner_id=auth.uid());
create policy csm_recipient on public.circle_shared_moods for select to authenticated using (
  stopped_at is null and expires_at>now() and public.circle_are_friends(owner_id,auth.uid())
  and exists(select 1 from circle_mood_recipients r where r.shared_mood_id=id and r.recipient_id=auth.uid()));
create policy csm_stop on public.circle_shared_moods for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
-- inserts via circle_share_mood(mood, group_ids) which resolves recipients server-side.
create policy cmr_select on public.circle_mood_recipients for select to authenticated using (
  recipient_id=auth.uid() or exists(select 1 from circle_shared_moods m where m.id=shared_mood_id and m.owner_id=auth.uid()));

-- Reactions: owner of the mood reads all; reactor writes only their own, only from the mood's emoji set, only while visible.
create policy cr_select on public.circle_reactions for select to authenticated using (
  reactor_id=auth.uid() or exists(select 1 from circle_shared_moods m where m.id=shared_mood_id and m.owner_id=auth.uid()));
create policy cr_write on public.circle_reactions for all to authenticated using (reactor_id=auth.uid()) with check (
  reactor_id=auth.uid() and exists(select 1 from circle_shared_moods m join circle_mood_recipients r on r.shared_mood_id=m.id
    where m.id=shared_mood_id and r.recipient_id=auth.uid() and m.stopped_at is null and m.expires_at>now()
      and public.circle_are_friends(m.owner_id,auth.uid())
      and emoji = any(case m.mood when 'Joyful' then array['🎉','🥳','🙌','✨','❤️'] when 'Calm' then array['🌿','💚','☀️','🧘','✨']
        when 'Sad' then array['❤️','🫂','🫶','🌷','💙'] when 'Angry' then array['🫂','❤️','💪','🌿','🫶']
        when 'Anxious' then array['🫶','🤗','🌿','💛','☀️'] else array['🌙','💤','🫂','☕','💜'] end)));

-- Signals: sender + recipient read; sends via circle_send_signal() (friend check + rate limit); recipient may mark seen.
create policy cs_select on public.circle_signals for select to authenticated using (auth.uid() in (sender_id,recipient_id));
create policy cs_seen on public.circle_signals for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());

create policy cnp_owner on public.circle_notification_prefs for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy cnl_owner on public.circle_notification_log for select to authenticated using (user_id=auth.uid());

-- Security-definer RPCs to implement after approval (signatures):
--   circle_regenerate_invite() returns text                 -- revokes old code, returns new plaintext once
--   circle_preview_invite(code text) returns (display_name, avatar_color, state)  -- max 5 attempts / 10 min / user; never returns user ids
--   circle_redeem_invite(code text) returns uuid              -- creates a pending link; no auto-connect
--   circle_respond(link_id uuid, accept boolean, group_ids uuid[])
--   circle_remove_friend(friend uuid, block boolean)          -- deletes recipients rows + reactions both ways
--   circle_share_mood(mood text, group_ids uuid[]) returns uuid
--   circle_send_signal(recipients uuid[], signal text)        -- max 20 recipients-per-day, 3 per friend per hour
-- Push delivery: an Edge Function triggered by inserts on circle_signals / circle_reactions / circle_links,
-- applying prefs, mutes, quiet hours, daily bundling, and lock-screen privacy before sending via Expo push.
