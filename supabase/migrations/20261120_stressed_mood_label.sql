-- "Angry" stays the stored mood id; push text shows it as "stressed".
create or replace function public.family_on_mood_recipient()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare m circle_shared_moods; fam_owner uuid; show_mood boolean; label text;
begin
  select * into m from circle_shared_moods where id=new.shared_mood_id;
  if m.id is null or m.stopped_at is not null then return new; end if;
  label:=case when m.mood='Angry' then 'stressed' else lower(m.mood) end;
  select owner_id into fam_owner from family_profiles where profile_user_id=m.owner_id;
  if fam_owner is not null then
    perform circle_notify(new.recipient_id,'family_mood',m.owner_id,m.id,
      '{name} is feeling '||label,'A family watch shared a mood',
      case when new.recipient_id=fam_owner then 'family' else 'today' end);
    return new;
  end if;
  select coalesce(show_mood_on_lock_screen,false) into show_mood from circle_notification_prefs where user_id=new.recipient_id;
  perform circle_notify(new.recipient_id,'mood',m.owner_id,m.id,
    case when coalesce(show_mood,false) then '{name} is feeling '||label else '{name} shared a mood with you' end,
    'Someone in your circle shared a mood','today');
  return new;
end $function$;
