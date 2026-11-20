-- Plus mood-matched reactions: labels for the extra emoji in PLUS_MOOD_REACTIONS (LittleSignalsData.ts),
-- so pushes and the watch read "{name}: Sending peace 🕊️". Unknown emoji keep the old wording.
create or replace function public.circle_reaction_label(p_emoji text) returns text
language sql immutable set search_path=public as $$
  select case p_emoji
    when '🎉' then 'So happy for you' when '🙌' then 'Love this' when '✨' then 'Keep shining'
    when '❤️' then 'Thinking of you' when '💜' then 'Thinking of you' when '🌿' then 'Take a breath'
    when '☀️' then 'Sending sunshine' when '💚' then 'Glad you''re feeling good' when '🫂' then 'Sending a hug'
    when '🫶' then 'Here for you' when '💙' then 'You''re not alone' when '💪' then 'You''ve got this'
    when '🌙' then 'Rest well' when '☕' then 'Coffee''s on me' when '🤗' then 'Sending a hug'
    when '🥳' then 'Celebrating with you' when '🌟' then 'Proud of you' when '😊' then 'You made me smile'
    when '🧘' then 'Stay centered' when '☁️' then 'Take it easy' when '🍃' then 'Peace to you'
    when '🌊' then 'Go with the flow' when '🕊️' then 'Sending peace' when '😌' then 'Love this calm'
    when '🌧️' then 'It''s okay to feel this' when '🌈' then 'Better days ahead' when '🕯️' then 'Holding space for you'
    when '🧸' then 'Sending comfort' when '💐' then 'Flowers for you' when '🧊' then 'Cool down'
    when '🌬️' then 'Breathe it out' when '🤝' then 'I''ve got your back' when '🍵' then 'Tea time'
    when '😴' then 'Get some sleep' when '🛌' then 'Rest up' when '💤' then 'Sweet dreams'
    when '⭐' then 'You did enough today' when '🤩' then 'You''re amazing' when '🔥' then 'You''re on fire'
    when '💃' then 'Dance it out' when '🪷' then 'Inner peace' when '🌸' then 'So peaceful'
    when '🌻' then 'Brighter days ahead' when '🫧' then 'Let it go' when '🦾' then 'Stronger than this'
    when '🦋' then 'You''ll get through this' when '🐢' then 'One step at a time' when '🦥' then 'Slow down'
    when '🌌' then 'Peaceful night'
  end $$;

-- Little Signals: six are free, the other six need Plus.
create or replace function public.circle_send_signal(p_recipients uuid[], p_signal text)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare me uuid:=circle_uid(); r uuid; n int:=0;
begin
  if not exists(select 1 from circle_signal_info(p_signal)) then raise exception 'Invalid signal'; end if;
  if p_signal not in ('thinking','hug','here','gotthis','calm','sunshine') and not public.has_plus(me) then
    raise exception 'This Little Signal needs MoodPals Plus';
  end if;
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
