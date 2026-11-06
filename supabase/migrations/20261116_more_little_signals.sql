-- Little Signals: 6 more free, positive signals (12 total). One lookup for emoji, label and push text,
-- shared by sending, the push trigger and the Apple Watch inbox.
create or replace function public.circle_signal_info(p_signal text)
returns table(emoji text, label text, notify text) language sql immutable set search_path to 'public' as $$
  select v.emoji, v.label, v.notify from (values
    ('thinking','❤️','Thinking of you','{name} is thinking of you ❤️'),
    ('hug','🤗','Sending a hug','{name} sent you a hug 🤗'),
    ('here','🫶','Here for you','{name} is here for you 🫶'),
    ('sunshine','☀️','Sending sunshine','{name} sent you some sunshine ☀️'),
    ('gotthis','💪','You''ve got this','{name} says you''ve got this 💪'),
    ('cheer','🎉','Cheering you on','{name} is cheering you on 🎉'),
    ('pray','🙏','Praying for you','{name} is praying for you 🙏'),
    ('proud','🌟','Proud of you','{name} is proud of you 🌟'),
    ('missyou','💞','Missing you','{name} misses you 💞'),
    ('madeday','😊','You made my day','{name} says you made their day 😊'),
    ('calm','🌿','Sending calm','{name} sent you some calm 🌿'),
    ('highfive','🙌','High five','{name} sent you a high five 🙌')
  ) v(id,emoji,label,notify) where v.id=p_signal;
$$;

alter table public.circle_signals drop constraint if exists circle_signals_signal_check;
alter table public.circle_signals add constraint circle_signals_signal_check
  check (signal in ('thinking','hug','here','sunshine','gotthis','cheer','pray','proud','missyou','madeday','calm','highfive'));

create or replace function public.circle_send_signal(p_recipients uuid[], p_signal text)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare me uuid:=circle_uid(); r uuid; n int:=0;
begin
  if not exists(select 1 from circle_signal_info(p_signal)) then raise exception 'Invalid signal'; end if;
  foreach r in array (select array(select distinct unnest(coalesce(p_recipients,'{}')))) loop
    continue when not circle_are_friends(me,r);
    continue when (select count(*) from circle_signals where sender_id=me and recipient_id=r and sent_at>now()-interval '1 hour')>=3;
    exit when circle_rate_limited('signal',30,interval '1 day');
    insert into circle_signals(sender_id,recipient_id,signal) values(me,r,p_signal);
    insert into circle_rate_events(user_id,kind) values(me,'signal');
    n:=n+1;
  end loop;
  return n;
end $function$;

create or replace function public.circle_on_signal() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform circle_notify(new.recipient_id,'signal',new.sender_id,new.id,
    coalesce((select notify from circle_signal_info(new.signal)),'{name} sent you a Little Signal'),
    'Someone in your circle sent you a Little Signal','today');
  return new;
end $$;

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
           coalesce(i.emoji,'💚'), coalesce(i.label,'Little Signal'), null::text, g.sent_at, g.seen_at
    from circle_signals g
    left join lateral circle_signal_info(g.signal) i on true
    left join circle_profiles p on p.user_id = g.sender_id
    left join circle_friend_settings s on s.owner_id = g.recipient_id and s.friend_id = g.sender_id
    where g.recipient_id = circle_uid() and (not p_unread_only or g.seen_at is null)
      and circle_are_friends(g.recipient_id, g.sender_id)
  ) x
  order by 8 desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.circle_signal_info(text) from public, anon;
grant execute on function public.circle_signal_info(text) to authenticated;
