-- The free reaction allowlist drifted from MOOD_REACTIONS (LittleSignalsData.ts): the app offered
-- ❤️ 🫶 🫂 on Calm etc. but the server rejected them. Keep every old emoji and add the app's free 4.
create or replace function public.circle_reaction_allowed(p_mood uuid, p_emoji text)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select public.circle_can_see_mood(p_mood) and exists(select 1 from circle_shared_moods m where m.id=p_mood
    and p_emoji = any(case m.mood
      when 'Joyful' then array['🎉','🥳','🙌','✨','❤️','🫶','💪','🫂']
      when 'Calm' then array['🌿','💚','☀️','🧘','✨','❤️','🫶','🫂']
      when 'Sad' then array['❤️','🫂','🫶','🌷','💙','🌿']
      when 'Angry' then array['🫂','❤️','💪','🌿','🫶']
      when 'Anxious' then array['🫶','🤗','🌿','💛','☀️','🫂','❤️']
      else array['🌙','💤','🫂','☕','💜','❤️','🫶'] end));
$function$;
