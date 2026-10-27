-- Family watches share hand-picked moods with their owner plus owner-chosen Circle groups,
-- and receive reactions back like a standard profile.

create table if not exists public.family_profile_groups(
  profile_user_id uuid not null references public.family_profiles(profile_user_id) on delete cascade,
  group_id uuid not null references public.circle_groups(id) on delete cascade,
  primary key(profile_user_id,group_id)
);
alter table public.family_profile_groups enable row level security;
drop policy if exists fpg_select on public.family_profile_groups;
create policy fpg_select on public.family_profile_groups for select to authenticated using (
  exists(select 1 from public.family_profiles f where f.profile_user_id=family_profile_groups.profile_user_id and f.owner_id=(select auth.uid())));
drop policy if exists fpg_insert on public.family_profile_groups;
create policy fpg_insert on public.family_profile_groups for insert to authenticated with check (
  exists(select 1 from public.family_profiles f where f.profile_user_id=family_profile_groups.profile_user_id and f.owner_id=(select auth.uid()))
  and exists(select 1 from public.circle_groups g where g.id=family_profile_groups.group_id and g.owner_id=(select auth.uid())));
drop policy if exists fpg_delete on public.family_profile_groups;
create policy fpg_delete on public.family_profile_groups for delete to authenticated using (
  exists(select 1 from public.family_profiles f where f.profile_user_id=family_profile_groups.profile_user_id and f.owner_id=(select auth.uid())));
grant select,insert,delete on public.family_profile_groups to authenticated;

-- The owner, or an accepted Circle friend of the owner, may see and react to a family profile's shared moods.
create or replace function public.family_audience(p_profile uuid, p_viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.family_profiles f where f.profile_user_id=p_profile and (f.owner_id=p_viewer
    or exists(select 1 from public.circle_links l where l.user_low=least(f.owner_id,p_viewer)
      and l.user_high=greatest(f.owner_id,p_viewer) and l.status='accepted')))
$$;

create or replace function public.family_profile_circle_setup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.circle_profiles(user_id,display_name) values(new.profile_user_id,left(new.device_name,40))
    on conflict (user_id) do update set display_name=excluded.display_name;
  insert into public.circle_notification_prefs(user_id) values(new.profile_user_id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists family_profiles_circle_setup on public.family_profiles;
create trigger family_profiles_circle_setup after insert on public.family_profiles
  for each row execute function public.family_profile_circle_setup();

create or replace function public.circle_can_see_mood(p_mood uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from circle_shared_moods m join circle_mood_recipients r on r.shared_mood_id=m.id
    where m.id=p_mood and r.recipient_id=auth.uid() and m.stopped_at is null and m.expires_at>now()
      and (exists(select 1 from circle_links l where l.user_low=least(m.owner_id,auth.uid())
        and l.user_high=greatest(m.owner_id,auth.uid()) and l.status='accepted')
        or family_audience(m.owner_id,auth.uid())));
$$;

create or replace function public.circle_reaction_inbox(p_unread_only boolean default false, p_limit integer default 50)
returns table(id uuid, shared_mood_id uuid, mood text, reactor_id uuid, reactor_name text, emoji text, reacted_at timestamptz, read_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select r.id,r.shared_mood_id,m.mood,r.reactor_id,coalesce(p.display_name,'A friend'),r.emoji,r.updated_at,r.read_at
  from circle_reactions r
  join circle_shared_moods m on m.id=r.shared_mood_id
  left join circle_profiles p on p.user_id=r.reactor_id
  where m.owner_id=circle_uid() and (not p_unread_only or r.read_at is null)
    and (circle_are_friends(m.owner_id,r.reactor_id) or family_audience(m.owner_id,r.reactor_id))
  order by r.updated_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
$$;

create or replace function public.circle_share_mood_auto(p_mood text, p_event_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare me uuid:=circle_uid(); mid uuid; gids uuid[]; fam_owner uuid;
begin
  if p_mood not in ('Joyful','Calm','Sad','Angry','Anxious','Tired') then raise exception 'Invalid mood'; end if;
  if p_event_id is null then raise exception 'Missing event id'; end if;
  select id into mid from circle_shared_moods where owner_id=me and client_event_id=p_event_id;
  if found then return mid; end if;
  select owner_id into fam_owner from family_profiles where profile_user_id=me;
  if fam_owner is not null then
    gids:=array(select g.id from family_profile_groups fg join circle_groups g on g.id=fg.group_id
      where fg.profile_user_id=me and g.owner_id=fam_owner and p_mood=any(g.allowed_moods));
  else
    gids:=array(select g.id from circle_groups g where g.owner_id=me and p_mood=any(g.allowed_moods));
    if coalesce(array_length(gids,1),0)=0 then return null; end if;
  end if;
  insert into circle_shared_moods(owner_id,mood,group_ids,client_event_id) values(me,p_mood,gids,p_event_id)
    on conflict (owner_id,client_event_id) where client_event_id is not null do nothing
    returning id into mid;
  if mid is null then
    select id into mid from circle_shared_moods where owner_id=me and client_event_id=p_event_id;
    return mid;
  end if;
  if fam_owner is not null then
    insert into circle_mood_recipients(shared_mood_id,recipient_id)
      select distinct mid,x.id from (
        select fam_owner id
        union
        select gm.member_id from circle_group_members gm
        where gm.group_id=any(gids) and family_audience(me,gm.member_id)
          and not exists(select 1 from circle_friend_settings s where s.owner_id=fam_owner and s.friend_id=gm.member_id and s.hide_my_moods)
      ) x where x.id<>me;
  else
    insert into circle_mood_recipients(shared_mood_id,recipient_id)
      select distinct mid,gm.member_id from circle_groups g join circle_group_members gm on gm.group_id=g.id
      where g.owner_id=me and g.id=any(gids) and circle_are_friends(me,gm.member_id)
        and not exists(select 1 from circle_friend_settings s where s.owner_id=me and s.friend_id=gm.member_id and s.hide_my_moods);
  end if;
  return mid;
end $$;

alter table public.circle_notification_log drop constraint if exists circle_notification_log_kind_check;
alter table public.circle_notification_log add constraint circle_notification_log_kind_check
  check (kind in ('invite','approval','signal','reaction','family_mood'));

-- Push each recipient (owner and chosen group members) when a family watch shares a mood.
create or replace function public.family_on_mood_recipient()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare m circle_shared_moods; fam_owner uuid;
begin
  select * into m from circle_shared_moods where id=new.shared_mood_id;
  select owner_id into fam_owner from family_profiles where profile_user_id=m.owner_id;
  if fam_owner is null then return new; end if;
  perform circle_notify(new.recipient_id,'family_mood',m.owner_id,m.id,
    '{name} is feeling '||lower(m.mood),'A family watch shared a mood',
    case when new.recipient_id=fam_owner then 'family' else 'today' end);
  return new;
end $$;
drop trigger if exists circle_mood_recipients_family_notify on public.circle_mood_recipients;
create trigger circle_mood_recipients_family_notify after insert on public.circle_mood_recipients
  for each row execute function public.family_on_mood_recipient();

-- Names for family watches whose moods reached me (or that I own), shown as "<watch> · <owner>'s family".
create or replace function public.circle_family_names()
returns table(profile_id uuid, display_name text, owner_name text)
language sql stable security definer set search_path = '' as $$
  select f.profile_user_id, coalesce(p.display_name,f.device_name), coalesce(op.display_name,'a friend')
  from public.family_profiles f
  left join public.circle_profiles p on p.user_id=f.profile_user_id
  left join public.circle_profiles op on op.user_id=f.owner_id
  where f.owner_id=(select auth.uid()) or (public.family_audience(f.profile_user_id,(select auth.uid()))
    and exists(select 1 from public.circle_shared_moods m join public.circle_mood_recipients r on r.shared_mood_id=m.id
      where m.owner_id=f.profile_user_id and r.recipient_id=(select auth.uid())))
$$;

-- Reactions to a family profile's shared moods, for its owner's Family tab.
create or replace function public.family_profile_reactions(p_profile uuid, p_limit int default 30)
returns table(id uuid, mood text, shared_at timestamptz, reactor_name text, emoji text, reacted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, m.mood, m.shared_at,
    case when r.reactor_id=(select auth.uid()) then 'You' else coalesce(p.display_name,'A friend') end,
    r.emoji, r.updated_at
  from public.circle_reactions r
  join public.circle_shared_moods m on m.id=r.shared_mood_id
  left join public.circle_profiles p on p.user_id=r.reactor_id
  where m.owner_id=p_profile
    and exists(select 1 from public.family_profiles f where f.profile_user_id=p_profile and f.owner_id=(select auth.uid()))
  order by r.updated_at desc
  limit least(greatest(coalesce(p_limit,30),1),100)
$$;
