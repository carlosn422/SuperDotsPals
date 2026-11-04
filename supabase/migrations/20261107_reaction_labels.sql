-- Reaction pushes say what the reaction means: "{name}: Rest well 🌙" instead of "{name} reacted 🌙".
-- Labels mirror REACTION_LABELS in LittleSignalsData.ts; unknown emoji keep the old wording.
create or replace function public.circle_reaction_label(p_emoji text) returns text
language sql immutable set search_path=public as $$
  select case p_emoji
    when '🎉' then 'So happy for you' when '🙌' then 'Love this' when '✨' then 'Keep shining'
    when '❤️' then 'Thinking of you' when '💜' then 'Thinking of you' when '🌿' then 'Take a breath'
    when '☀️' then 'Sending sunshine' when '💚' then 'Glad you''re feeling good' when '🫂' then 'Sending a hug'
    when '🫶' then 'Here for you' when '💙' then 'You''re not alone' when '💪' then 'You''ve got this'
    when '🌙' then 'Rest well' when '☕' then 'Coffee''s on me'
  end $$;

create or replace function public.circle_on_reaction() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare m circle_shared_moods; show_mood boolean; lbl text;
begin
  if tg_op='UPDATE' and new.emoji=old.emoji then return new; end if;
  select * into m from circle_shared_moods where id=new.shared_mood_id;
  select coalesce(show_mood_on_lock_screen,false) into show_mood from circle_notification_prefs where user_id=m.owner_id;
  lbl:=circle_reaction_label(new.emoji);
  perform circle_notify(m.owner_id,'reaction',new.reactor_id,m.id,
    case when lbl is not null then '{name}: '||lbl||' '||new.emoji
      else '{name} reacted '||new.emoji||case when coalesce(show_mood,false) then ' to your '||lower(m.mood)||' mood' else '' end end,
    'Someone reacted to your shared mood','today');
  return new;
end $function$;
