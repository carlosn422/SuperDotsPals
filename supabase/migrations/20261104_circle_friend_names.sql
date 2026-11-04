-- Friends showed as "Friend" when their Circle profile was created before their name was saved.
-- Circle names now follow the user's profile name, and each user can give a friend a private nickname.

alter table public.circle_friend_settings
  add column nickname text check (nickname is null or char_length(nickname) between 1 and 40);

create or replace function public.circle_real_name(p_user uuid) returns text
language sql stable security definer set search_path=public as $$
  select left(coalesce(nullif(trim(pr.display_name),''),nullif(trim(u.raw_user_meta_data->>'display_name'),'')),40)
  from auth.users u left join profiles pr on pr.id=u.id where u.id=p_user;
$$;
revoke all on function public.circle_real_name(uuid) from public, anon, authenticated;

update public.circle_profiles cp set display_name=public.circle_real_name(cp.user_id)
where cp.display_name='Friend' and public.circle_real_name(cp.user_id) is not null
  and not exists(select 1 from public.family_profiles f where f.profile_user_id=cp.user_id);

create or replace function public.circle_ensure_profile() returns public.circle_profiles
language plpgsql security definer set search_path=public as $$
declare me uuid:=circle_uid(); p circle_profiles; nm text;
  palette text[]:=array['#7BC6A4','#F2A65A','#8FA7F5','#E58BB0','#B79CEB','#6CB7D9','#F0B95B','#9BD08A'];
begin
  nm:=circle_real_name(me);
  select * into p from circle_profiles where user_id=me;
  if found then
    if p.display_name='Friend' and nm is not null then
      update circle_profiles set display_name=nm where user_id=me returning * into p;
    end if;
    return p;
  end if;
  insert into circle_profiles(user_id,display_name,avatar_color)
    values(me,coalesce(nm,'Friend'),palette[1+abs(hashtext(me::text))%array_length(palette,1)])
    on conflict (user_id) do nothing;
  insert into circle_notification_prefs(user_id) values(me) on conflict do nothing;
  select * into p from circle_profiles where user_id=me;
  return p;
end $$;

create or replace function public.circle_sync_profile_name() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if nullif(trim(new.display_name),'') is not null
     and not exists(select 1 from family_profiles f where f.profile_user_id=new.id) then
    update circle_profiles set display_name=left(trim(new.display_name),40) where user_id=new.id;
  end if;
  return new;
end $$;
revoke all on function public.circle_sync_profile_name() from public, anon, authenticated;
create trigger profiles_circle_name after insert or update of display_name on public.profiles
  for each row execute function public.circle_sync_profile_name();

drop function public.circle_friends();
create function public.circle_friends() returns table(friend_id uuid,display_name text,real_name text,nickname text,avatar_color text,since timestamptz,muted boolean,hide_my_moods boolean)
language sql stable security definer set search_path=public as $$
  select f.fid, coalesce(s.nickname,p.display_name,'MoodPals friend'), coalesce(p.display_name,'MoodPals friend'), s.nickname,
    coalesce(p.avatar_color,'#7BC6A4'), f.since, coalesce(s.muted,false), coalesce(s.hide_my_moods,false)
  from (select case when l.user_low=auth.uid() then l.user_high else l.user_low end fid, coalesce(l.responded_at,l.created_at) since
        from circle_links l where auth.uid() in (l.user_low,l.user_high) and l.status='accepted') f
  left join circle_profiles p on p.user_id=f.fid
  left join circle_friend_settings s on s.owner_id=auth.uid() and s.friend_id=f.fid
  order by 2;
$$;
revoke all on function public.circle_friends() from public, anon;
grant execute on function public.circle_friends() to authenticated;

-- Push text uses the recipient's nickname for the sender when they set one.
create or replace function public.circle_notify(p_user uuid,p_kind text,p_actor uuid,p_ref uuid,p_named text,p_private text,p_route text)
returns void language plpgsql security definer set search_path=public as $$
declare pr circle_notification_prefs; enabled boolean; hr int; msgs jsonb; actor_name text; body text;
begin
  select * into pr from circle_notification_prefs where user_id=p_user;
  if not found then pr:=row(p_user,true,true,true,true,true,true,false,'UTC')::circle_notification_prefs; end if;
  enabled:=case p_kind when 'invite' then pr.invites when 'approval' then pr.approvals
    when 'signal' then pr.signals else pr.reactions end;
  if enabled and p_kind in ('signal','reaction') and exists(select 1 from circle_friend_settings
     where owner_id=p_user and friend_id=p_actor and muted) then enabled:=false; end if;
  if enabled and pr.quiet_hours then
    begin hr:=extract(hour from now() at time zone pr.timezone);
    exception when others then hr:=extract(hour from now()); end;
    if hr>=22 or hr<7 then enabled:=false; end if;
  end if;
  select coalesce((select s.nickname from circle_friend_settings s where s.owner_id=p_user and s.friend_id=p_actor),p.display_name)
    into actor_name from circle_profiles p where p.user_id=p_actor;
  body:=case when pr.show_names_in_preview then replace(p_named,'{name}',coalesce(actor_name,'Someone')) else p_private end;
  select jsonb_agg(jsonb_build_object('to',t.token,'title','MoodPals','body',body,'sound','default',
           'data',jsonb_build_object('action','circle','route',p_route,'ref',p_ref)))
    into msgs from circle_push_tokens t where t.user_id=p_user;
  insert into circle_notification_log(user_id,kind,actor_id,ref_id,delivered)
    values(p_user,p_kind,p_actor,p_ref,enabled and msgs is not null);
  if enabled and msgs is not null then
    perform net.http_post(url:='https://exp.host/--/api/v2/push/send',body:=msgs,
      headers:='{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);
  end if;
end $$;
revoke all on function public.circle_notify(uuid,text,uuid,uuid,text,text,text) from public, anon, authenticated;
