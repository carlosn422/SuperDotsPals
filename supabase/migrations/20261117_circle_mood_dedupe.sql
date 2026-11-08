-- One Circle message per logical mood share.
-- 1) Sharing the same mood again within 5 minutes returns the earlier share: no new message, no new push.
--    The private check-in is still saved by the app; only the Circle copy is skipped. A stopped share doesn't count.
-- 2) circle_share_mood takes the device's event id, so retries of the same Share tap return the original share.
-- Both functions lock per owner so two devices sharing at the same moment can't both insert.

create or replace function public.circle_recent_same_mood(p_owner uuid, p_mood text) returns uuid
language sql stable security definer set search_path to 'public' as $$
  select id from circle_shared_moods
  where owner_id=p_owner and mood=p_mood and stopped_at is null and shared_at>now()-interval '5 minutes'
  order by shared_at desc limit 1
$$;
revoke all on function public.circle_recent_same_mood(uuid,text) from public, anon, authenticated;

create or replace function public.circle_share_mood_auto(p_mood text, p_event_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare me uuid:=circle_uid(); mid uuid; gids uuid[]; fam_owner uuid; wg uuid;
begin
  if p_mood not in ('Joyful','Calm','Sad','Angry','Anxious','Tired') then raise exception 'Invalid mood'; end if;
  if p_event_id is null then raise exception 'Missing event id'; end if;
  perform pg_advisory_xact_lock(hashtext('circle_share_mood:'||me::text));
  select id into mid from circle_shared_moods where owner_id=me and client_event_id=p_event_id;
  if found then return mid; end if;
  mid:=circle_recent_same_mood(me,p_mood);
  if mid is not null then return mid; end if;
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

create or replace function public.circle_share_mood(p_mood text, p_group_ids uuid[], p_event_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare me uuid:=circle_uid(); mid uuid;
begin
  if p_mood not in ('Joyful','Calm','Sad','Angry','Anxious','Tired') then raise exception 'Invalid mood'; end if;
  perform pg_advisory_xact_lock(hashtext('circle_share_mood:'||me::text));
  if p_event_id is not null then
    select id into mid from circle_shared_moods where owner_id=me and client_event_id=p_event_id;
    if found then return mid; end if;
  end if;
  mid:=circle_recent_same_mood(me,p_mood);
  if mid is not null then return mid; end if;
  insert into circle_shared_moods(owner_id,mood,group_ids,client_event_id)
    values(me,p_mood,array(select g.id from circle_groups g where g.owner_id=me and g.id=any(coalesce(p_group_ids,'{}'))),p_event_id)
    returning id into mid;
  insert into circle_mood_recipients(shared_mood_id,recipient_id)
    select distinct mid,gm.member_id from circle_groups g join circle_group_members gm on gm.group_id=g.id
    where g.owner_id=me and g.id=any(coalesce(p_group_ids,'{}')) and p_mood=any(g.allowed_moods)
      and circle_are_friends(me,gm.member_id)
      and not exists(select 1 from circle_friend_settings s where s.owner_id=me and s.friend_id=gm.member_id and s.hide_my_moods);
  return mid;
end $$;

-- Older app builds call the two-argument version.
create or replace function public.circle_share_mood(p_mood text, p_group_ids uuid[])
returns uuid language sql security definer set search_path to 'public' as $$
  select public.circle_share_mood(p_mood,p_group_ids,null::uuid)
$$;

revoke all on function public.circle_share_mood(text,uuid[],uuid) from public, anon;
grant execute on function public.circle_share_mood(text,uuid[],uuid) to authenticated;
revoke all on function public.circle_share_mood(text,uuid[]) from public, anon;
grant execute on function public.circle_share_mood(text,uuid[]) to authenticated;
