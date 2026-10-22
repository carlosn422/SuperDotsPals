-- My Circle & Little Signals: friend invites, private groups, optional mood sharing,
-- emoji reactions, Little Signals and one-at-a-time push notifications.
-- Only mood labels are ever shared: never journal text, HealthKit values, HRV or stress scores.

create extension if not exists pg_net with schema extensions;

-- Tables ----------------------------------------------------------------
create table public.circle_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_color text not null default '#7BC6A4',
  created_at timestamptz not null default now()
);

-- Invite codes last 2 days and can be used by many people; each use only creates a pending request.
create table public.circle_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^MP-[A-Z0-9]{5}$'),
  expires_at timestamptz not null default now() + interval '2 days',
  revoked_at timestamptz,
  use_count int not null default 0,
  created_at timestamptz not null default now()
);
create unique index circle_invites_one_active on public.circle_invites(owner_id) where revoked_at is null;

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
create index circle_links_high on public.circle_links(user_high);

create table public.circle_friend_settings (
  owner_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  muted boolean not null default false,
  hide_my_moods boolean not null default false,
  primary key (owner_id,friend_id)
);

create table public.circle_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  icon text not null default 'heart' check (char_length(icon) <= 30),
  color text not null default '#E76B8A' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  allowed_moods text[] not null default array['Joyful','Calm','Sad','Angry','Anxious','Tired']
    check (allowed_moods <@ array['Joyful','Calm','Sad','Angry','Anxious','Tired']),
  created_at timestamptz not null default now()
);
create index circle_groups_owner on public.circle_groups(owner_id);
create table public.circle_group_members (
  group_id uuid not null references public.circle_groups(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  primary key (group_id,member_id)
);
create index circle_group_members_member on public.circle_group_members(member_id);

create table public.circle_shared_moods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  mood text not null check (mood in ('Joyful','Calm','Sad','Angry','Anxious','Tired')),
  group_ids uuid[] not null,
  shared_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  stopped_at timestamptz
);
create index circle_shared_moods_owner on public.circle_shared_moods(owner_id,shared_at desc);
create table public.circle_mood_recipients (
  shared_mood_id uuid not null references public.circle_shared_moods(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  primary key (shared_mood_id,recipient_id)
);
create index circle_mood_recipients_recipient on public.circle_mood_recipients(recipient_id);
create table public.circle_reactions (
  shared_mood_id uuid not null references public.circle_shared_moods(id) on delete cascade,
  reactor_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  updated_at timestamptz not null default now(),
  primary key (shared_mood_id,reactor_id)
);
create index circle_reactions_reactor on public.circle_reactions(reactor_id);

create table public.circle_signals (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  signal text not null check (signal in ('thinking','hug','here','sunshine','gotthis','cheer')),
  sent_at timestamptz not null default now(),
  seen_at timestamptz
);
create index circle_signals_recipient on public.circle_signals(recipient_id,sent_at desc);
create index circle_signals_sender on public.circle_signals(sender_id,sent_at desc);

create table public.circle_notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invites boolean not null default true,
  approvals boolean not null default true,
  signals boolean not null default true,
  reactions boolean not null default true,
  quiet_hours boolean not null default true,
  show_names_in_preview boolean not null default true,
  show_mood_on_lock_screen boolean not null default false,
  timezone text not null default 'UTC'
);
create table public.circle_push_tokens (
  token text primary key check (token like 'ExponentPushToken[%' or token like 'ExpoPushToken[%'),
  user_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index circle_push_tokens_user on public.circle_push_tokens(user_id);
create table public.circle_notification_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('invite','approval','signal','reaction')),
  actor_id uuid references auth.users(id) on delete set null,
  ref_id uuid,
  delivered boolean not null default false,
  created_at timestamptz not null default now()
);
create index circle_notification_log_user on public.circle_notification_log(user_id,created_at desc);
create table public.circle_rate_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('code_attempt','signal')),
  created_at timestamptz not null default now()
);
create index circle_rate_events_idx on public.circle_rate_events(user_id,kind,created_at desc);

-- Helpers (always scoped to the caller, so they can't be used to probe other users) ---------
create function public.circle_are_friends(a uuid,b uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select auth.uid() in (a,b) and exists(select 1 from circle_links
    where user_low=least(a,b) and user_high=greatest(a,b) and status='accepted');
$$;
create function public.circle_owns_mood(p_mood uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from circle_shared_moods where id=p_mood and owner_id=auth.uid());
$$;
create function public.circle_can_see_mood(p_mood uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from circle_shared_moods m join circle_mood_recipients r on r.shared_mood_id=m.id
    where m.id=p_mood and r.recipient_id=auth.uid() and m.stopped_at is null and m.expires_at>now()
      and exists(select 1 from circle_links l where l.user_low=least(m.owner_id,auth.uid())
        and l.user_high=greatest(m.owner_id,auth.uid()) and l.status='accepted'));
$$;
create function public.circle_reaction_allowed(p_mood uuid,p_emoji text) returns boolean
language sql stable security definer set search_path=public as $$
  select public.circle_can_see_mood(p_mood) and exists(select 1 from circle_shared_moods m where m.id=p_mood
    and p_emoji = any(case m.mood
      when 'Joyful' then array['🎉','🥳','🙌','✨','❤️'] when 'Calm' then array['🌿','💚','☀️','🧘','✨']
      when 'Sad' then array['❤️','🫂','🫶','🌷','💙'] when 'Angry' then array['🫂','❤️','💪','🌿','🫶']
      when 'Anxious' then array['🫶','🤗','🌿','💛','☀️'] else array['🌙','💤','🫂','☕','💜'] end));
$$;
create function public.circle_uid() returns uuid language plpgsql stable set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode='28000'; end if;
  return auth.uid();
end $$;

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
alter table public.circle_push_tokens enable row level security;
alter table public.circle_notification_log enable row level security;
alter table public.circle_rate_events enable row level security; -- no policies: functions only

-- Profiles: yourself plus people you're linked with (pending or accepted). No directory search.
create policy cp_select on public.circle_profiles for select to authenticated using (
  user_id=(select auth.uid()) or exists(select 1 from circle_links l where l.status in ('accepted','pending')
    and (select auth.uid()) in (l.user_low,l.user_high) and circle_profiles.user_id in (l.user_low,l.user_high)));
create policy cp_update on public.circle_profiles for update to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create policy ci_owner on public.circle_invites for select to authenticated using (owner_id=(select auth.uid()));

create policy cl_select on public.circle_links for select to authenticated using (
  (select auth.uid()) in (user_low,user_high) and (status<>'blocked' or blocked_by=(select auth.uid())));

create policy cfs_select on public.circle_friend_settings for select to authenticated using (owner_id=(select auth.uid()));
create policy cfs_insert on public.circle_friend_settings for insert to authenticated
  with check (owner_id=(select auth.uid()) and public.circle_are_friends(owner_id,friend_id));
create policy cfs_update on public.circle_friend_settings for update to authenticated
  using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()) and public.circle_are_friends(owner_id,friend_id));

create policy cg_owner on public.circle_groups for all to authenticated
  using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
create policy cgm_select on public.circle_group_members for select to authenticated
  using (exists(select 1 from circle_groups g where g.id=group_id and g.owner_id=(select auth.uid())));
create policy cgm_insert on public.circle_group_members for insert to authenticated
  with check (exists(select 1 from circle_groups g where g.id=group_id and g.owner_id=(select auth.uid()))
    and public.circle_are_friends((select auth.uid()),member_id));
create policy cgm_delete on public.circle_group_members for delete to authenticated
  using (exists(select 1 from circle_groups g where g.id=group_id and g.owner_id=(select auth.uid())));

create policy csm_select on public.circle_shared_moods for select to authenticated
  using (owner_id=(select auth.uid()) or public.circle_can_see_mood(id));
create policy cmr_select on public.circle_mood_recipients for select to authenticated
  using (recipient_id=(select auth.uid()) or public.circle_owns_mood(shared_mood_id));

create policy cr_select on public.circle_reactions for select to authenticated
  using (reactor_id=(select auth.uid()) or public.circle_owns_mood(shared_mood_id));
create policy cr_insert on public.circle_reactions for insert to authenticated
  with check (reactor_id=(select auth.uid()) and public.circle_reaction_allowed(shared_mood_id,emoji));
create policy cr_update on public.circle_reactions for update to authenticated
  using (reactor_id=(select auth.uid())) with check (reactor_id=(select auth.uid()) and public.circle_reaction_allowed(shared_mood_id,emoji));
create policy cr_delete on public.circle_reactions for delete to authenticated using (reactor_id=(select auth.uid()));

create policy cs_select on public.circle_signals for select to authenticated
  using ((select auth.uid()) in (sender_id,recipient_id));

create policy cnp_owner on public.circle_notification_prefs for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy cpt_select on public.circle_push_tokens for select to authenticated using (user_id=(select auth.uid()));
create policy cpt_delete on public.circle_push_tokens for delete to authenticated using (user_id=(select auth.uid()));
create policy cnl_owner on public.circle_notification_log for select to authenticated using (user_id=(select auth.uid()));

-- RPCs ------------------------------------------------------------------
create function public.circle_ensure_profile() returns public.circle_profiles
language plpgsql security definer set search_path=public as $$
declare me uuid:=circle_uid(); p circle_profiles; nm text;
  palette text[]:=array['#7BC6A4','#F2A65A','#8FA7F5','#E58BB0','#B79CEB','#6CB7D9','#F0B95B','#9BD08A'];
begin
  select * into p from circle_profiles where user_id=me;
  if found then return p; end if;
  select coalesce(nullif(trim(pr.display_name),''),nullif(trim(u.raw_user_meta_data->>'display_name'),''),'Friend')
    into nm from auth.users u left join profiles pr on pr.id=u.id where u.id=me;
  insert into circle_profiles(user_id,display_name,avatar_color)
    values(me,left(coalesce(nm,'Friend'),40),palette[1+abs(hashtext(me::text))%array_length(palette,1)])
    on conflict (user_id) do nothing;
  insert into circle_notification_prefs(user_id) values(me) on conflict do nothing;
  select * into p from circle_profiles where user_id=me;
  return p;
end $$;

create function public.circle_new_code() returns text language plpgsql volatile set search_path=public as $$
declare alphabet text:='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; b bytea;
begin
  loop
    b:=decode(replace(gen_random_uuid()::text,'-',''),'hex'); c:='MP-';
    for i in 0..4 loop c:=c||substr(alphabet,1+(get_byte(b,i)%length(alphabet)),1); end loop;
    exit when not exists(select 1 from circle_invites where code=c);
  end loop;
  return c;
end $$;

create function public.circle_regenerate_invite() returns table(code text,expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare me uuid:=circle_uid();
begin
  perform circle_ensure_profile();
  update circle_invites set revoked_at=now() where owner_id=me and revoked_at is null;
  return query insert into circle_invites(owner_id,code) values(me,circle_new_code())
    returning circle_invites.code,circle_invites.expires_at;
end $$;

create function public.circle_my_invite() returns table(code text,expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare me uuid:=circle_uid();
begin
  return query select i.code,i.expires_at from circle_invites i
    where i.owner_id=me and i.revoked_at is null and i.expires_at>now();
  if not found then return query select * from circle_regenerate_invite(); end if;
end $$;

create function public.circle_rate_limited(p_kind text,p_max int,p_window interval) returns boolean
language sql stable set search_path=public as $$
  select count(*)>=p_max from circle_rate_events where user_id=auth.uid() and kind=p_kind and created_at>now()-p_window;
$$;

-- Never returns user ids. Expired/revoked/invalid codes reveal no name.
create function public.circle_preview_invite(p_code text) returns table(state text,display_name text,avatar_color text)
language plpgsql security definer set search_path=public as $$
declare me uuid:=circle_uid(); i circle_invites; l circle_links; c text:=upper(trim(coalesce(p_code,'')));
begin
  if circle_rate_limited('code_attempt',10,interval '10 minutes') then
    return query select 'rate_limited'::text,null::text,null::text; return; end if;
  insert into circle_rate_events(user_id,kind) values(me,'code_attempt');
  if c !~ '^MP-[A-Z0-9]{5}$' then c:='MP-'||regexp_replace(c,'[^A-Z0-9]','','g'); end if;
  select * into i from circle_invites where code=c;
  if not found then return query select 'invalid'::text,null::text,null::text; return; end if;
  if i.owner_id=me then return query select 'own'::text,null::text,null::text; return; end if;
  if i.revoked_at is not null then return query select 'revoked'::text,null::text,null::text; return; end if;
  if i.expires_at<=now() then return query select 'expired'::text,null::text,null::text; return; end if;
  select * into l from circle_links where user_low=least(me,i.owner_id) and user_high=greatest(me,i.owner_id);
  if found and l.status='blocked' then return query select 'invalid'::text,null::text,null::text; return; end if;
  return query select case when l.status='accepted' then 'already_friends' when l.status='pending' then 'pending' else 'valid' end,
    p.display_name,p.avatar_color from circle_profiles p where p.user_id=i.owner_id;
  if not found then return query select 'valid'::text,'MoodPals friend'::text,'#7BC6A4'::text; end if;
end $$;

create function public.circle_redeem_invite(p_code text) returns text
language plpgsql security definer set search_path=public as $$
declare me uuid:=circle_uid(); i circle_invites; l circle_links; c text:=upper(trim(coalesce(p_code,'')));
begin
  if c !~ '^MP-[A-Z0-9]{5}$' then c:='MP-'||regexp_replace(c,'[^A-Z0-9]','','g'); end if;
  select * into i from circle_invites where code=c and revoked_at is null and expires_at>now();
  if not found or i.owner_id=me then return 'invalid'; end if;
  perform circle_ensure_profile();
  select * into l from circle_links where user_low=least(me,i.owner_id) and user_high=greatest(me,i.owner_id) for update;
  if found then
    if l.status='blocked' then return 'invalid'; end if;
    if l.status='accepted' then return 'already_friends'; end if;
    if l.status='pending' then return 'pending'; end if;
    update circle_links set status='pending',requested_by=me,via_invite=i.id,responded_at=null,created_at=now() where id=l.id;
  else
    insert into circle_links(user_low,user_high,requested_by,via_invite)
      values(least(me,i.owner_id),greatest(me,i.owner_id),me,i.id);
  end if;
  update circle_invites set use_count=use_count+1 where id=i.id;
  return 'sent';
end $$;

create function public.circle_requests() returns table(link_id uuid,direction text,status text,display_name text,avatar_color text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select l.id, case when l.requested_by=auth.uid() then 'outgoing' else 'incoming' end, l.status::text,
    coalesce(p.display_name,'MoodPals friend'), coalesce(p.avatar_color,'#7BC6A4'), l.created_at
  from circle_links l
  left join circle_profiles p on p.user_id=case when l.user_low=auth.uid() then l.user_high else l.user_low end
  where auth.uid() in (l.user_low,l.user_high)
    and (l.status='pending' or (l.status='declined' and l.requested_by=auth.uid() and l.responded_at>now()-interval '14 days'))
  order by l.created_at desc;
$$;

create function public.circle_respond(p_link uuid,p_accept boolean,p_group_ids uuid[] default '{}') returns void
language plpgsql security definer set search_path=public as $$
declare me uuid:=circle_uid(); l circle_links; other uuid;
begin
  select * into l from circle_links where id=p_link and me in (user_low,user_high) and requested_by<>me and status='pending' for update;
  if not found then raise exception 'Request not found'; end if;
  other:=case when l.user_low=me then l.user_high else l.user_low end;
  perform circle_ensure_profile();
  update circle_links set status=case when p_accept then 'accepted'::circle_link_status else 'declined'::circle_link_status end,
    responded_at=now() where id=l.id;
  if p_accept then
    insert into circle_group_members(group_id,member_id)
      select g.id,other from circle_groups g where g.owner_id=me and g.id=any(coalesce(p_group_ids,'{}'))
      on conflict do nothing;
  end if;
end $$;

create function public.circle_cancel_request(p_link uuid) returns void
language plpgsql security definer set search_path=public as $$
declare me uuid:=circle_uid();
begin
  delete from circle_links where id=p_link and requested_by=me and status in ('pending','declined');
end $$;

create function public.circle_friends() returns table(friend_id uuid,display_name text,avatar_color text,since timestamptz,muted boolean,hide_my_moods boolean)
language sql stable security definer set search_path=public as $$
  select f.fid, coalesce(p.display_name,'MoodPals friend'), coalesce(p.avatar_color,'#7BC6A4'), f.since,
    coalesce(s.muted,false), coalesce(s.hide_my_moods,false)
  from (select case when l.user_low=auth.uid() then l.user_high else l.user_low end fid, coalesce(l.responded_at,l.created_at) since
        from circle_links l where auth.uid() in (l.user_low,l.user_high) and l.status='accepted') f
  left join circle_profiles p on p.user_id=f.fid
  left join circle_friend_settings s on s.owner_id=auth.uid() and s.friend_id=f.fid
  order by p.display_name;
$$;

-- Removing or blocking revokes everything shared in both directions.
create function public.circle_remove_friend(p_friend uuid,p_block boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare me uuid:=circle_uid();
begin
  if p_friend=me then raise exception 'Invalid friend'; end if;
  delete from circle_group_members gm using circle_groups g where gm.group_id=g.id
    and ((g.owner_id=me and gm.member_id=p_friend) or (g.owner_id=p_friend and gm.member_id=me));
  delete from circle_reactions r using circle_shared_moods m where r.shared_mood_id=m.id
    and ((m.owner_id=me and r.reactor_id=p_friend) or (m.owner_id=p_friend and r.reactor_id=me));
  delete from circle_mood_recipients r using circle_shared_moods m where r.shared_mood_id=m.id
    and ((m.owner_id=me and r.recipient_id=p_friend) or (m.owner_id=p_friend and r.recipient_id=me));
  delete from circle_friend_settings where (owner_id=me and friend_id=p_friend) or (owner_id=p_friend and friend_id=me);
  if p_block then
    insert into circle_links(user_low,user_high,requested_by,status,blocked_by,responded_at)
      values(least(me,p_friend),greatest(me,p_friend),me,'blocked',me,now())
      on conflict (user_low,user_high) do update set status='blocked',blocked_by=me,responded_at=now();
  else
    delete from circle_links where user_low=least(me,p_friend) and user_high=greatest(me,p_friend) and status<>'blocked';
  end if;
end $$;

-- Recipients are resolved here: deduplicated across groups, honouring each group's mood permissions and hide-my-moods.
create function public.circle_share_mood(p_mood text,p_group_ids uuid[]) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid:=circle_uid(); mid uuid;
begin
  if p_mood not in ('Joyful','Calm','Sad','Angry','Anxious','Tired') then raise exception 'Invalid mood'; end if;
  insert into circle_shared_moods(owner_id,mood,group_ids)
    values(me,p_mood,array(select g.id from circle_groups g where g.owner_id=me and g.id=any(coalesce(p_group_ids,'{}'))))
    returning id into mid;
  insert into circle_mood_recipients(shared_mood_id,recipient_id)
    select distinct mid,gm.member_id from circle_groups g join circle_group_members gm on gm.group_id=g.id
    where g.owner_id=me and g.id=any(coalesce(p_group_ids,'{}')) and p_mood=any(g.allowed_moods)
      and circle_are_friends(me,gm.member_id)
      and not exists(select 1 from circle_friend_settings s where s.owner_id=me and s.friend_id=gm.member_id and s.hide_my_moods);
  return mid;
end $$;

create function public.circle_stop_share(p_mood uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update circle_shared_moods set stopped_at=now() where id=p_mood and owner_id=circle_uid() and stopped_at is null;
end $$;

-- Max 3 signals per friend per hour and 30 per day.
create function public.circle_send_signal(p_recipients uuid[],p_signal text) returns int
language plpgsql security definer set search_path=public as $$
declare me uuid:=circle_uid(); r uuid; n int:=0;
begin
  if p_signal not in ('thinking','hug','here','sunshine','gotthis','cheer') then raise exception 'Invalid signal'; end if;
  foreach r in array (select array(select distinct unnest(coalesce(p_recipients,'{}')))) loop
    continue when not circle_are_friends(me,r);
    continue when (select count(*) from circle_signals where sender_id=me and recipient_id=r and sent_at>now()-interval '1 hour')>=3;
    exit when circle_rate_limited('signal',30,interval '1 day');
    insert into circle_signals(sender_id,recipient_id,signal) values(me,r,p_signal);
    insert into circle_rate_events(user_id,kind) values(me,'signal');
    n:=n+1;
  end loop;
  return n;
end $$;

create function public.circle_mark_signals_seen() returns void
language plpgsql security definer set search_path=public as $$
begin
  update circle_signals set seen_at=now() where recipient_id=circle_uid() and seen_at is null;
end $$;

create function public.circle_register_push_token(p_token text) returns void
language plpgsql security definer set search_path=public as $$
declare me uuid:=circle_uid();
begin
  insert into circle_push_tokens(token,user_id) values(p_token,me)
    on conflict (token) do update set user_id=me,updated_at=now();
end $$;

-- Push notifications: one at a time, via Expo's push service ----------------
create function public.circle_notify(p_user uuid,p_kind text,p_actor uuid,p_ref uuid,p_named text,p_private text,p_route text)
returns void language plpgsql security definer set search_path=public as $$
declare pr circle_notification_prefs; enabled boolean; hr int; msgs jsonb; actor_name text; body text;
begin
  select * into pr from circle_notification_prefs where user_id=p_user;
  if not found then pr:=row(p_user,true,true,true,true,true,true,false,'UTC')::circle_notification_prefs; end if;
  enabled:=case p_kind when 'invite' then pr.invites when 'approval' then pr.approvals
    when 'signal' then pr.signals else pr.reactions end;
  if enabled and p_kind in ('signal','reaction') and exists(select 1 from circle_friend_settings
     where owner_id=p_user and friend_id=p_actor and muted) then enabled:=false; end if;
  if enabled and pr.quiet_hours then
    begin hr:=extract(hour from now() at time zone pr.timezone);
    exception when others then hr:=extract(hour from now()); end;
    if hr>=22 or hr<7 then enabled:=false; end if;
  end if;
  select display_name into actor_name from circle_profiles where user_id=p_actor;
  body:=case when pr.show_names_in_preview then replace(p_named,'{name}',coalesce(actor_name,'Someone')) else p_private end;
  select jsonb_agg(jsonb_build_object('to',t.token,'title','MoodPals','body',body,'sound','default',
           'data',jsonb_build_object('action','circle','route',p_route,'ref',p_ref)))
    into msgs from circle_push_tokens t where t.user_id=p_user;
  insert into circle_notification_log(user_id,kind,actor_id,ref_id,delivered)
    values(p_user,p_kind,p_actor,p_ref,enabled and msgs is not null);
  if enabled and msgs is not null then
    perform net.http_post(url:='https://exp.host/--/api/v2/push/send',body:=msgs,
      headers:='{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);
  end if;
end $$;

create function public.circle_on_link() returns trigger language plpgsql security definer set search_path=public as $$
declare other uuid;
begin
  other:=case when new.user_low=new.requested_by then new.user_high else new.user_low end;
  if new.status='pending' and (tg_op='INSERT' or old.status<>'pending') then
    perform circle_notify(other,'invite',new.requested_by,new.id,'{name} wants to join your circle','You have a new friend request','requests');
  elsif tg_op='UPDATE' and new.status='accepted' and old.status='pending' then
    perform circle_notify(new.requested_by,'approval',other,new.id,'{name} accepted your friend request','A friend request was accepted','friends');
  end if;
  return new;
end $$;
create trigger circle_links_notify after insert or update of status on public.circle_links
  for each row execute function public.circle_on_link();

create function public.circle_on_signal() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform circle_notify(new.recipient_id,'signal',new.sender_id,new.id,
    case new.signal when 'thinking' then '{name} is thinking of you ❤️' when 'hug' then '{name} sent you a hug 🤗'
      when 'here' then '{name} is here for you 🫶' when 'sunshine' then '{name} sent you some sunshine ☀️'
      when 'gotthis' then '{name} says you''ve got this 💪' else '{name} is cheering you on 🎉' end,
    'Someone in your circle sent you a Little Signal','today');
  return new;
end $$;
create trigger circle_signals_notify after insert on public.circle_signals
  for each row execute function public.circle_on_signal();

create function public.circle_on_reaction() returns trigger language plpgsql security definer set search_path=public as $$
declare m circle_shared_moods; show_mood boolean;
begin
  if tg_op='UPDATE' and new.emoji=old.emoji then return new; end if;
  select * into m from circle_shared_moods where id=new.shared_mood_id;
  select coalesce(show_mood_on_lock_screen,false) into show_mood from circle_notification_prefs where user_id=m.owner_id;
  perform circle_notify(m.owner_id,'reaction',new.reactor_id,m.id,
    '{name} reacted '||new.emoji||case when coalesce(show_mood,false) then ' to your '||lower(m.mood)||' mood' else '' end,
    'Someone reacted to your shared mood','today');
  return new;
end $$;
create trigger circle_reactions_notify after insert or update of emoji on public.circle_reactions
  for each row execute function public.circle_on_reaction();

-- Function privileges: RPCs for signed-in users only; internals not callable from the API.
do $$ declare f record; begin
  for f in select p.oid::regprocedure sig, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'circle\_%' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    if f.proname in ('circle_ensure_profile','circle_regenerate_invite','circle_my_invite','circle_preview_invite',
      'circle_redeem_invite','circle_requests','circle_respond','circle_cancel_request','circle_friends',
      'circle_remove_friend','circle_share_mood','circle_stop_share','circle_send_signal','circle_mark_signals_seen',
      'circle_register_push_token','circle_are_friends','circle_owns_mood','circle_can_see_mood','circle_reaction_allowed') then
      execute format('grant execute on function %s to authenticated', f.sig);
    else
      execute format('revoke all on function %s from authenticated', f.sig);
    end if;
  end loop;
end $$;
