-- Family watches: their owner can send them Little Signals, and the watch shows them.

create or replace function public.circle_family_pair(a uuid, b uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from family_profiles f
    where (f.owner_id=a and f.profile_user_id=b) or (f.owner_id=b and f.profile_user_id=a))
$$;
revoke all on function public.circle_family_pair(uuid,uuid) from public, anon, authenticated;

create or replace function public.circle_send_signal(p_recipients uuid[], p_signal text)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare me uuid:=circle_uid(); r uuid; n int:=0;
begin
  if not exists(select 1 from circle_signal_info(p_signal)) then raise exception 'Invalid signal'; end if;
  foreach r in array (select array(select distinct unnest(coalesce(p_recipients,'{}')))) loop
    continue when not (circle_are_friends(me,r) or circle_family_pair(me,r));
    continue when (select count(*) from circle_signals where sender_id=me and recipient_id=r and sent_at>now()-interval '1 hour')>=3;
    exit when circle_rate_limited('signal',30,interval '1 day');
    insert into circle_signals(sender_id,recipient_id,signal) values(me,r,p_signal);
    insert into circle_rate_events(user_id,kind) values(me,'signal');
    n:=n+1;
  end loop;
  return n;
end $function$;

create or replace function public.circle_watch_inbox(p_unread_only boolean default true, p_limit integer default 50)
returns table(kind text, id uuid, ref_id uuid, name text, emoji text, label text, mood text, at timestamptz, read_at timestamptz)
language sql stable security definer set search_path to 'public' as $function$
  select * from (
    select 'reaction'::text, r.id, r.shared_mood_id, coalesce(s.nickname, p.display_name, 'A friend'),
           r.emoji, circle_reaction_label(r.emoji), m.mood, r.updated_at, r.read_at
    from circle_reactions r
    join circle_shared_moods m on m.id = r.shared_mood_id
    left join circle_profiles p on p.user_id = r.reactor_id
    left join circle_friend_settings s on s.owner_id = m.owner_id and s.friend_id = r.reactor_id
    where m.owner_id = circle_uid() and (not p_unread_only or r.read_at is null)
      and (circle_are_friends(m.owner_id, r.reactor_id) or family_audience(m.owner_id, r.reactor_id))
    union all
    select 'signal'::text, g.id, g.id, coalesce(s.nickname, p.display_name, 'A friend'),
           coalesce(i.emoji,'💚'), coalesce(i.label,'Little Signal'), null::text, g.sent_at, g.seen_at
    from circle_signals g
    left join lateral circle_signal_info(g.signal) i on true
    left join circle_profiles p on p.user_id = g.sender_id
    left join circle_friend_settings s on s.owner_id = g.recipient_id and s.friend_id = g.sender_id
    where g.recipient_id = circle_uid() and (not p_unread_only or g.seen_at is null)
      and (circle_are_friends(g.recipient_id, g.sender_id) or circle_family_pair(g.recipient_id, g.sender_id))
  ) x
  order by 8 desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$function$;

-- Adds is_mine so the app knows which family watches it can send signals to.
drop function if exists public.circle_family_names();
create function public.circle_family_names()
returns table(profile_id uuid, display_name text, owner_name text, is_mine boolean)
language sql stable security definer set search_path to '' as $function$
  select f.profile_user_id, coalesce(p.display_name,f.device_name), coalesce(op.display_name,'a friend'), f.owner_id=(select auth.uid())
  from public.family_profiles f
  left join public.circle_profiles p on p.user_id=f.profile_user_id
  left join public.circle_profiles op on op.user_id=f.owner_id
  where f.owner_id=(select auth.uid()) or (public.family_audience(f.profile_user_id,(select auth.uid()))
    and exists(select 1 from public.circle_shared_moods m join public.circle_mood_recipients r on r.shared_mood_id=m.id
      where m.owner_id=f.profile_user_id and r.recipient_id=(select auth.uid())))
$function$;
grant execute on function public.circle_family_names() to authenticated;
