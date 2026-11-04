-- MoodPals no longer manages quiet hours; people use iPhone Sleep / Focus instead.
-- Column stays so older app builds can still save prefs, but it is ignored.
update public.circle_notification_prefs set quiet_hours=false where quiet_hours;
alter table public.circle_notification_prefs alter column quiet_hours set default false;

create or replace function public.circle_notify(p_user uuid, p_kind text, p_actor uuid, p_ref uuid, p_named text, p_private text, p_route text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare pr circle_notification_prefs; enabled boolean; msgs jsonb; actor_name text; body text;
begin
  select * into pr from circle_notification_prefs where user_id=p_user;
  if not found then pr:=row(p_user,true,true,true,true,false,true,false,'UTC')::circle_notification_prefs; end if;
  enabled:=case p_kind when 'invite' then pr.invites when 'approval' then pr.approvals
    when 'signal' then pr.signals else pr.reactions end;
  if enabled and p_kind in ('signal','reaction') and exists(select 1 from circle_friend_settings
     where owner_id=p_user and friend_id=p_actor and muted) then enabled:=false; end if;
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
end $function$;
