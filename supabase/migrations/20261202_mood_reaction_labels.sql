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
