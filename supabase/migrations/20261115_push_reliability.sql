-- Push reliability:
-- 1) Friends get a push when someone shares a mood with them by hand (all shares are manual picks: Share screen,
--    check-in "Share with My Circle", or a mood picked on the watch). Auto-switched moods are never shared, so never pushed.
--    New per-user toggle circle_notification_prefs.moods; at most one mood push per friend every 15 minutes.
-- 2) Tokens that Expo/Apple reject (DeviceNotRegistered, BadDeviceToken, ...) are removed, using Expo's tickets and receipts.

alter table public.circle_notification_prefs add column if not exists moods boolean not null default true;

alter table public.circle_notification_log drop constraint if exists circle_notification_log_kind_check;
alter table public.circle_notification_log add constraint circle_notification_log_kind_check
  check (kind in ('invite','approval','signal','reaction','family_mood','mood'));

-- Which tokens each Expo request went to (in message order), so tickets and receipts can be matched to tokens.
create table if not exists public.circle_push_requests(
  request_id bigint primary key,
  kind text not null check (kind in ('send','receipts')),
  tokens text[] not null default '{}',
  ticket_ids text[] not null default '{}',
  created_at timestamptz not null default now());
create table if not exists public.circle_push_tickets(
  ticket_id text primary key,
  token text not null,
  requested_at timestamptz,
  created_at timestamptz not null default now());
alter table public.circle_push_requests enable row level security;
alter table public.circle_push_tickets enable row level security;
revoke all on table public.circle_push_requests, public.circle_push_tickets from anon, authenticated;

create or replace function public.circle_notify(p_user uuid, p_kind text, p_actor uuid, p_ref uuid, p_named text, p_private text, p_route text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare pr circle_notification_prefs; enabled boolean; msgs jsonb; toks text[]; actor_name text; body text; rid bigint;
begin
  select * into pr from circle_notification_prefs where user_id=p_user;
  if not found then
    pr.user_id:=p_user; pr.invites:=true; pr.approvals:=true; pr.signals:=true; pr.reactions:=true; pr.moods:=true;
    pr.show_names_in_preview:=true; pr.show_mood_on_lock_screen:=false;
  end if;
  enabled:=case p_kind when 'invite' then pr.invites when 'approval' then pr.approvals
    when 'signal' then pr.signals when 'mood' then pr.moods else pr.reactions end;
  if enabled and p_kind in ('signal','reaction','mood') and exists(select 1 from circle_friend_settings
     where owner_id=p_user and friend_id=p_actor and muted) then enabled:=false; end if;
  if enabled and p_kind='mood' and exists(select 1 from circle_notification_log l where l.user_id=p_user and l.actor_id=p_actor
     and l.kind='mood' and l.delivered and l.created_at>now()-interval '15 minutes') then enabled:=false; end if;
  select coalesce((select s.nickname from circle_friend_settings s where s.owner_id=p_user and s.friend_id=p_actor),p.display_name)
    into actor_name from circle_profiles p where p.user_id=p_actor;
  body:=case when pr.show_names_in_preview then replace(p_named,'{name}',coalesce(actor_name,'Someone')) else p_private end;
  select jsonb_agg(jsonb_build_object('to',t.token,'title','MoodPals','body',body,'sound','default',
           'data',jsonb_build_object('action','circle','route',p_route,'ref',p_ref)) order by t.token),
         array_agg(t.token order by t.token)
    into msgs,toks from circle_push_tokens t where t.user_id=p_user;
  insert into circle_notification_log(user_id,kind,actor_id,ref_id,delivered)
    values(p_user,p_kind,p_actor,p_ref,enabled and msgs is not null);
  if enabled and msgs is not null then
    rid:=net.http_post(url:='https://exp.host/--/api/v2/push/send',body:=msgs,
      headers:='{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);
    insert into circle_push_requests(request_id,kind,tokens) values(rid,'send',toks) on conflict do nothing;
  end if;
end $function$;

-- One push per recipient of a shared mood: family watches as before ('family_mood'), friends' shares as 'mood'.
create or replace function public.family_on_mood_recipient()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare m circle_shared_moods; fam_owner uuid; show_mood boolean;
begin
  select * into m from circle_shared_moods where id=new.shared_mood_id;
  if m.id is null or m.stopped_at is not null then return new; end if;
  select owner_id into fam_owner from family_profiles where profile_user_id=m.owner_id;
  if fam_owner is not null then
    perform circle_notify(new.recipient_id,'family_mood',m.owner_id,m.id,
      '{name} is feeling '||lower(m.mood),'A family watch shared a mood',
      case when new.recipient_id=fam_owner then 'family' else 'today' end);
    return new;
  end if;
  select coalesce(show_mood_on_lock_screen,false) into show_mood from circle_notification_prefs where user_id=new.recipient_id;
  perform circle_notify(new.recipient_id,'mood',m.owner_id,m.id,
    case when coalesce(show_mood,false) then '{name} is feeling '||lower(m.mood) else '{name} shared a mood with you' end,
    'Someone in your circle shared a mood','today');
  return new;
end $$;

-- Every 10 minutes: read Expo's send responses and receipts, and remove tokens that can never receive pushes.
create or replace function public.circle_push_prune()
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record; t jsonb; rc jsonb; k text; i int; ids text[]; rid bigint;
  dead constant text[]:=array['BadDeviceToken','Unregistered','DeviceTokenNotForTopic'];
begin
  for r in select q.request_id,q.kind,q.tokens,q.ticket_ids,h.content from circle_push_requests q
           join net._http_response h on h.id=q.request_id loop
    begin
      if r.kind='send' then
        for i in 1..coalesce(array_length(r.tokens,1),0) loop
          t:=(r.content::jsonb)->'data'->(i-1);
          if t->>'status'='ok' and t->>'id' is not null then
            insert into circle_push_tickets(ticket_id,token) values(t->>'id',r.tokens[i]) on conflict do nothing;
          elsif t->'details'->>'error'='DeviceNotRegistered' then
            delete from circle_push_tokens where token=r.tokens[i];
          end if;
        end loop;
      else
        foreach k in array r.ticket_ids loop
          rc:=(r.content::jsonb)->'data'->k;
          if rc is null then update circle_push_tickets set requested_at=null where ticket_id=k; continue; end if;
          if rc->>'status'='error' and (rc->'details'->>'error'='DeviceNotRegistered' or rc->'details'->'apns'->>'reason'=any(dead)) then
            delete from circle_push_tokens where token=(select token from circle_push_tickets where ticket_id=k);
          end if;
          delete from circle_push_tickets where ticket_id=k;
        end loop;
      end if;
    exception when others then null;
    end;
    delete from circle_push_requests where request_id=r.request_id;
  end loop;
  delete from circle_push_requests where created_at<now()-interval '7 hours';
  update circle_push_tickets set requested_at=null where requested_at<now()-interval '7 hours';
  delete from circle_push_tickets where created_at<now()-interval '1 day';
  ids:=array(select ticket_id from circle_push_tickets where requested_at is null and created_at<now()-interval '15 minutes'
             order by created_at limit 1000);
  if coalesce(array_length(ids,1),0)>0 then
    rid:=net.http_post(url:='https://exp.host/--/api/v2/push/getReceipts',body:=jsonb_build_object('ids',to_jsonb(ids)),
      headers:='{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);
    insert into circle_push_requests(request_id,kind,ticket_ids) values(rid,'receipts',ids) on conflict do nothing;
    update circle_push_tickets set requested_at=now() where ticket_id=any(ids);
  end if;
end $$;
revoke all on function public.circle_push_prune() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('circle-push-prune','*/10 * * * *','select public.circle_push_prune()');
