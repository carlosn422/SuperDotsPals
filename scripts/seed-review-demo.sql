-- Re-runnable demo data for the App Review accounts (appreview1 = Avery, Plus; appreview2 = Jordan).
-- Resets their moods and Circle shares to fresh ones relative to now(). Run shortly before each submission.
do $$
declare
 a uuid:=(select id from auth.users where email='appreview1@moodpals.com');
 j uuid:=(select id from auth.users where email='appreview2@moodpals.com');
 ga uuid:=(select id from public.circle_groups where owner_id=(select id from auth.users where email='appreview1@moodpals.com') order by created_at limit 1);
 gj uuid:=(select id from public.circle_groups where owner_id=(select id from auth.users where email='appreview2@moodpals.com') order by created_at limit 1);
 mia uuid; s record; mid uuid;
begin
 if a is null or j is null or ga is null or gj is null then raise exception 'review accounts or groups missing'; end if;
 select profile_user_id into mia from public.family_profiles where owner_id=a order by created_at limit 1;
 if mia is null then
  mia:=gen_random_uuid();
  insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
   values(mia,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','family-'||mia||'@family.moodpals.invalid',now(),
    jsonb_build_object('family_profile',true,'owner_id',a),'{"provider":"email","providers":["email"]}',now(),now());
  insert into public.family_profiles(profile_user_id,owner_id,device_name) values(mia,a,'Mia''s Apple Watch');
 end if;
 insert into public.circle_profiles(user_id,display_name) values(mia,'Mia''s Apple Watch') on conflict (user_id) do nothing;
 insert into public.family_profile_groups(profile_user_id,group_id) values(mia,ga) on conflict do nothing;
 delete from public.circle_shared_moods where owner_id in (a,j,mia);
 delete from public.wellness_journal where user_id in (a,j,mia) and mood is not null;
 -- owner, mood, hours ago, group, recipients, reactions (reactor, emoji)
 for s in select * from (values
  (mia,'Joyful',0.5,ga,array[a,j],array[a,j],array['🎉','🥳']),
  (mia,'Sad',3.0,ga,array[a,j],array[a,j],array['❤️','🫂']),
  (mia,'Calm',5.0,ga,array[a,j],array[j],array['🌿']),
  (mia,'Tired',26.0,ga,array[a,j],array[a],array['💤']),
  (mia,'Anxious',74.0,ga,array[a,j],array[a,j],array['🫶','🤗']),
  (a,'Calm',1.0,ga,array[j],array[j],array['💚']),
  (a,'Joyful',4.0,ga,array[j],array[j],array['✨']),
  (a,'Sad',50.0,ga,array[j],array[j],array['🫂']),
  (j,'Joyful',2.0,gj,array[a],array[a],array['🙌']),
  (j,'Calm',6.0,gj,array[a],array[a],array['🧘'])
 ) v(owner,mood,hrs,grp,recips,reactors,emojis) loop
  insert into public.wellness_journal(user_id,entry_type,body,mood,occurred_at)
   values(s.owner,'reflection','Mood check-in',s.mood,now()-make_interval(secs=>s.hrs*3600));
  insert into public.circle_shared_moods(owner_id,mood,group_ids,shared_at,expires_at)
   values(s.owner,s.mood,array[s.grp],now()-make_interval(secs=>s.hrs*3600-5),now()-make_interval(secs=>s.hrs*3600-5)+interval '24 hours') returning id into mid;
  insert into public.circle_mood_recipients(shared_mood_id,recipient_id) select mid,x from unnest(s.recips) x;
  insert into public.circle_reactions(shared_mood_id,reactor_id,emoji,updated_at)
   select mid,s.reactors[i],s.emojis[i],now()-make_interval(secs=>s.hrs*3600-600-i*60) from generate_subscripts(s.reactors,1) i;
 end loop;
end $$;
