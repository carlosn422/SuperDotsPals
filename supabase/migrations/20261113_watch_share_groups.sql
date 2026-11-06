-- Each Apple Watch sends its hand-picked moods to one chosen Circle group (default: the owner's Friends group).
-- Choosing any group other than Friends requires MoodPals Plus.

alter table public.connected_devices add column if not exists share_group_id uuid references public.circle_groups(id) on delete set null;

create or replace function public.watch_share_groups()
returns table(device_id uuid, group_id uuid) language sql stable security definer set search_path to 'public' as $$
  select d.id, coalesce(d.share_group_id,(select g.id from circle_groups g where g.owner_id=d.user_id and g.is_default))
  from connected_devices d where d.user_id=circle_uid() and d.platform='watchos' and d.revoked_at is null;
$$;

create or replace function public.watch_set_share_group(p_device uuid, p_group uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare me uuid:=circle_uid();
begin
  if not exists(select 1 from circle_groups g where g.id=p_group and g.owner_id=me) then raise exception 'Group not found'; end if;
  if not exists(select 1 from circle_groups g where g.id=p_group and g.is_default) and not public.has_plus(me) then
    raise exception 'MoodPals Plus is required to choose another group'; end if;
  update connected_devices set share_group_id=p_group where id=p_device and user_id=me and platform='watchos' and revoked_at is null;
  if not found then raise exception 'Watch not found'; end if;
end $$;

-- Family watches keep using family_profile_groups, now limited to one group chosen here.
create or replace function public.family_set_share_group(p_profile uuid, p_group uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare me uuid:=circle_uid();
begin
  if not exists(select 1 from family_profiles f where f.profile_user_id=p_profile and f.owner_id=me) then raise exception 'Family watch not found'; end if;
  if not exists(select 1 from circle_groups g where g.id=p_group and g.owner_id=me) then raise exception 'Group not found'; end if;
  if not exists(select 1 from circle_groups g where g.id=p_group and g.is_default) and not public.has_plus(me) then
    raise exception 'MoodPals Plus is required to choose another group'; end if;
  delete from family_profile_groups where profile_user_id=p_profile and group_id<>p_group;
  insert into family_profile_groups(profile_user_id,group_id) values(p_profile,p_group) on conflict do nothing;
end $$;

revoke all on function public.watch_share_groups() from public, anon;
revoke all on function public.watch_set_share_group(uuid,uuid) from public, anon;
revoke all on function public.family_set_share_group(uuid,uuid) from public, anon;
grant execute on function public.watch_share_groups() to authenticated;
grant execute on function public.watch_set_share_group(uuid,uuid) to authenticated;
grant execute on function public.family_set_share_group(uuid,uuid) to authenticated;

-- New family watches start on the owner's Friends group; backfill ones with no group yet.
create or replace function public.family_profile_default_group()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  insert into public.family_profile_groups(profile_user_id,group_id)
    select new.profile_user_id,g.id from public.circle_groups g where g.owner_id=new.owner_id and g.is_default
    on conflict do nothing;
  return new;
end $$;
drop trigger if exists family_profiles_default_group on public.family_profiles;
create trigger family_profiles_default_group after insert on public.family_profiles
  for each row execute function public.family_profile_default_group();
insert into public.family_profile_groups(profile_user_id,group_id)
  select f.profile_user_id,g.id from public.family_profiles f join public.circle_groups g on g.owner_id=f.owner_id and g.is_default
  where not exists(select 1 from public.family_profile_groups x where x.profile_user_id=f.profile_user_id)
  on conflict do nothing;

-- Shares from the owner's own watch (user agent SuperdotsWatch/<build>) go only to that watch's group.
-- The iPhone check-in keeps sharing to every group that allows the mood.
create or replace function public.circle_share_mood_auto(p_mood text, p_event_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare me uuid:=circle_uid(); mid uuid; gids uuid[]; fam_owner uuid; wg uuid;
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
    if coalesce(nullif(current_setting('request.headers',true),'')::json->>'user-agent','') like 'SuperdotsWatch/%' then
      select coalesce(
        (select d.share_group_id from connected_devices d where d.user_id=me and d.platform='watchos' and d.revoked_at is null and d.share_group_id is not null order by d.last_seen_at desc nulls last limit 1),
        (select g.id from circle_groups g where g.owner_id=me and g.is_default)) into wg;
    end if;
    gids:=array(select g.id from circle_groups g where g.owner_id=me and p_mood=any(g.allowed_moods) and (wg is null or g.id=wg));
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
