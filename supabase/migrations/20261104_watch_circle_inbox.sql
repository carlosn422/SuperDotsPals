-- Apple Watch Circle inbox: unread responses to my shared moods plus Little Signals sent to me.
-- ref_id matches the `ref` in Circle push data (shared mood id for responses, signal id for signals).
create or replace function public.circle_watch_inbox(p_unread_only boolean default true, p_limit integer default 50)
returns table(kind text, id uuid, ref_id uuid, name text, emoji text, label text, mood text, at timestamptz, read_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
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
           case g.signal when 'thinking' then '❤️' when 'hug' then '🤗' when 'here' then '🫶'
             when 'sunshine' then '☀️' when 'gotthis' then '💪' else '🎉' end,
           case g.signal when 'thinking' then 'Thinking of you' when 'hug' then 'Sending a hug' when 'here' then 'Here for you'
             when 'sunshine' then 'Sending sunshine' when 'gotthis' then 'You''ve got this' else 'Cheering you on' end,
           null::text, g.sent_at, g.seen_at
    from circle_signals g
    left join circle_profiles p on p.user_id = g.sender_id
    left join circle_friend_settings s on s.owner_id = g.recipient_id and s.friend_id = g.sender_id
    where g.recipient_id = circle_uid() and (not p_unread_only or g.seen_at is null)
      and circle_are_friends(g.recipient_id, g.sender_id)
  ) x
  order by 8 desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function public.circle_mark_signals_read(p_ids uuid[])
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  update circle_signals set seen_at = now()
    where recipient_id = circle_uid() and id = any(coalesce(p_ids, '{}')) and seen_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.circle_watch_inbox(boolean, integer) from public, anon;
revoke all on function public.circle_mark_signals_read(uuid[]) from public, anon;
grant execute on function public.circle_watch_inbox(boolean, integer) to authenticated;
grant execute on function public.circle_mark_signals_read(uuid[]) to authenticated;
