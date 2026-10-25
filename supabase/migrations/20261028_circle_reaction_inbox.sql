-- Circle reaction inbox: per-reaction notification ids, persistent read state and idempotent watch mood sharing.
-- Read does not delete: rows stay in circle_reactions; read_at only removes them from unread lists.

alter table public.circle_reactions
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists read_at timestamptz;
create unique index if not exists circle_reactions_id on public.circle_reactions(id);
create index if not exists circle_reactions_unread on public.circle_reactions(shared_mood_id) where read_at is null;

-- Changing the emoji is a new notification: new id, unread again.
create or replace function public.circle_reaction_renew() returns trigger language plpgsql set search_path=public as $$
begin
  if new.emoji is distinct from old.emoji then
    new.id:=gen_random_uuid(); new.read_at:=null; new.updated_at:=now();
  else
    new.id:=old.id; new.read_at:=old.read_at;
  end if;
  return new;
end $$;
drop trigger if exists circle_reactions_renew on public.circle_reactions;
create trigger circle_reactions_renew before update on public.circle_reactions
  for each row execute function public.circle_reaction_renew();

alter table public.circle_shared_moods add column if not exists client_event_id uuid;
create unique index if not exists circle_shared_moods_event on public.circle_shared_moods(owner_id,client_event_id)
  where client_event_id is not null;

-- Reactions to the caller's own shared moods, newest first.
create or replace function public.circle_reaction_inbox(p_unread_only boolean default false,p_limit int default 50)
returns table(id uuid,shared_mood_id uuid,mood text,reactor_id uuid,reactor_name text,emoji text,reacted_at timestamptz,read_at timestamptz)
language sql stable security definer set search_path=public as $$
  select r.id,r.shared_mood_id,m.mood,r.reactor_id,coalesce(p.display_name,'A friend'),r.emoji,r.updated_at,r.read_at
  from circle_reactions r
  join circle_shared_moods m on m.id=r.shared_mood_id
  left join circle_profiles p on p.user_id=r.reactor_id
  where m.owner_id=circle_uid() and (not p_unread_only or r.read_at is null)
    and circle_are_friends(m.owner_id,r.reactor_id)
  order by r.updated_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
$$;

-- Marks the caller's own reaction notifications read. Safe to retry: already-read ids are ignored.
create or replace function public.circle_mark_reactions_read(p_ids uuid[]) returns int
language plpgsql security definer set search_path=public as $$
declare me uuid:=circle_uid(); n int;
begin
  update circle_reactions r set read_at=now()
    from circle_shared_moods m
    where m.id=r.shared_mood_id and m.owner_id=me and r.id=any(coalesce(p_ids,'{}')) and r.read_at is null;
  get diagnostics n=row_count;
  return n;
end $$;

-- Shares a mood picked on a device (Apple Watch) with every group allowed to see that mood.
-- p_event_id is generated on the device once per mood change, so retries never share twice.
create or replace function public.circle_share_mood_auto(p_mood text,p_event_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid:=circle_uid(); mid uuid; gids uuid[];
begin
  if p_mood not in ('Joyful','Calm','Sad','Angry','Anxious','Tired') then raise exception 'Invalid mood'; end if;
  if p_event_id is null then raise exception 'Missing event id'; end if;
  select id into mid from circle_shared_moods where owner_id=me and client_event_id=p_event_id;
  if found then return mid; end if;
  gids:=array(select g.id from circle_groups g where g.owner_id=me and p_mood=any(g.allowed_moods));
  if coalesce(array_length(gids,1),0)=0 then return null; end if;
  insert into circle_shared_moods(owner_id,mood,group_ids,client_event_id) values(me,p_mood,gids,p_event_id)
    on conflict (owner_id,client_event_id) where client_event_id is not null do nothing
    returning id into mid;
  if mid is null then
    select id into mid from circle_shared_moods where owner_id=me and client_event_id=p_event_id;
    return mid;
  end if;
  insert into circle_mood_recipients(shared_mood_id,recipient_id)
    select distinct mid,gm.member_id from circle_groups g join circle_group_members gm on gm.group_id=g.id
    where g.owner_id=me and g.id=any(gids) and circle_are_friends(me,gm.member_id)
      and not exists(select 1 from circle_friend_settings s where s.owner_id=me and s.friend_id=gm.member_id and s.hide_my_moods);
  return mid;
end $$;

revoke all on function public.circle_reaction_renew() from public, anon, authenticated;
revoke all on function public.circle_reaction_inbox(boolean,int) from public, anon;
revoke all on function public.circle_mark_reactions_read(uuid[]) from public, anon;
revoke all on function public.circle_share_mood_auto(text,uuid) from public, anon;
grant execute on function public.circle_reaction_inbox(boolean,int) to authenticated;
grant execute on function public.circle_mark_reactions_read(uuid[]) to authenticated;
grant execute on function public.circle_share_mood_auto(text,uuid) to authenticated;
