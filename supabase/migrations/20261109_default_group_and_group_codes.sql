-- Every account gets a default "Friends" group; each group can have its own invite code.
alter table public.circle_groups add column if not exists is_default boolean not null default false;
create unique index if not exists circle_groups_one_default on public.circle_groups(owner_id) where is_default;
alter table public.circle_invites add column if not exists group_id uuid references public.circle_groups(id) on delete cascade;

-- The default "Friends" group doesn't count toward the free 1-group limit.
create or replace function public.enforce_free_group_limit() returns trigger
language plpgsql security definer set search_path to '' as $function$
begin
  if not new.is_default and not public.has_plus(new.owner_id)
     and (select count(*) from public.circle_groups g where g.owner_id = new.owner_id and not g.is_default) >= 1 then
    raise exception 'MoodPals Free includes 1 group. Upgrade to MoodPals Plus for more.' using errcode = 'P0001';
  end if;
  return new;
end $function$;

create or replace function public.circle_default_group(p_owner uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare g uuid;
begin
  select id into g from circle_groups where owner_id=p_owner and is_default;
  if g is null then
    insert into circle_groups(owner_id,name,icon,color,is_default) values(p_owner,'Friends','people','#3BA986',true)
      on conflict do nothing returning id into g;
    if g is null then select id into g from circle_groups where owner_id=p_owner and is_default; end if;
  end if;
  return g;
end $$;
revoke execute on function public.circle_default_group(uuid) from public, anon, authenticated;

create or replace function public.circle_ensure_profile() returns circle_profiles
language plpgsql security definer set search_path to 'public' as $function$
declare me uuid:=circle_uid(); p circle_profiles; nm text;
  palette text[]:=array['#7BC6A4','#F2A65A','#8FA7F5','#E58BB0','#B79CEB','#6CB7D9','#F0B95B','#9BD08A'];
begin
  nm:=circle_real_name(me);
  select * into p from circle_profiles where user_id=me;
  if found then
    if p.display_name='Friend' and nm is not null then
      update circle_profiles set display_name=nm where user_id=me returning * into p;
    end if;
    perform circle_default_group(me);
    return p;
  end if;
  insert into circle_profiles(user_id,display_name,avatar_color)
    values(me,coalesce(nm,'Friend'),palette[1+abs(hashtext(me::text))%array_length(palette,1)])
    on conflict (user_id) do nothing;
  insert into circle_notification_prefs(user_id) values(me) on conflict do nothing;
  perform circle_default_group(me);
  select * into p from circle_profiles where user_id=me;
  return p;
end $function$;

select count(public.circle_default_group(user_id)) from public.circle_profiles;

create or replace function public.circle_my_invite() returns table(code text, expires_at timestamptz)
language plpgsql security definer set search_path to 'public' as $function$
declare me uuid:=circle_uid();
begin
  return query select i.code,i.expires_at from circle_invites i
    where i.owner_id=me and i.group_id is null and i.revoked_at is null and i.expires_at>now();
  if not found then return query select * from circle_regenerate_invite(); end if;
end $function$;

create or replace function public.circle_regenerate_invite() returns table(code text, expires_at timestamptz)
language plpgsql security definer set search_path to 'public' as $function$
declare me uuid:=circle_uid();
begin
  perform circle_ensure_profile();
  update circle_invites set revoked_at=now() where owner_id=me and group_id is null and revoked_at is null;
  return query insert into circle_invites(owner_id,code) values(me,circle_new_code())
    returning circle_invites.code,circle_invites.expires_at;
end $function$;

create or replace function public.circle_group_invite(p_group uuid, p_regenerate boolean default false)
returns table(code text, expires_at timestamptz)
language plpgsql security definer set search_path to 'public' as $function$
declare me uuid:=circle_uid();
begin
  if not exists(select 1 from circle_groups g where g.id=p_group and g.owner_id=me) then raise exception 'Group not found'; end if;
  if p_regenerate then
    update circle_invites set revoked_at=now() where owner_id=me and group_id=p_group and revoked_at is null;
  else
    return query select i.code,i.expires_at from circle_invites i
      where i.owner_id=me and i.group_id=p_group and i.revoked_at is null and i.expires_at>now();
    if found then return; end if;
  end if;
  return query insert into circle_invites(owner_id,code,group_id) values(me,circle_new_code(),p_group)
    returning circle_invites.code,circle_invites.expires_at;
end $function$;
revoke execute on function public.circle_group_invite(uuid,boolean) from public, anon;
grant execute on function public.circle_group_invite(uuid,boolean) to authenticated;

drop function public.circle_requests();
create function public.circle_requests()
returns table(link_id uuid, direction text, status text, display_name text, avatar_color text, created_at timestamptz, group_id uuid, group_name text)
language sql stable security definer set search_path to 'public' as $function$
  select l.id, case when l.requested_by=auth.uid() then 'outgoing' else 'incoming' end, l.status::text,
    coalesce(p.display_name,'MoodPals friend'), coalesce(p.avatar_color,'#7BC6A4'), l.created_at, g.id, g.name
  from circle_links l
  left join circle_profiles p on p.user_id=case when l.user_low=auth.uid() then l.user_high else l.user_low end
  left join circle_invites i on i.id=l.via_invite
  left join circle_groups g on l.requested_by<>auth.uid() and g.owner_id=auth.uid()
    and (g.id=i.group_id or (i.group_id is null and g.is_default))
  where auth.uid() in (l.user_low,l.user_high)
    and (l.status='pending' or (l.status='declined' and l.requested_by=auth.uid() and l.responded_at>now()-interval '14 days'))
  order by l.created_at desc;
$function$;
revoke execute on function public.circle_requests() from public, anon;
grant execute on function public.circle_requests() to authenticated;

-- Accepting with no groups chosen (e.g. older app builds) puts them in the code's group, or Friends.
create or replace function public.circle_respond(p_link uuid, p_accept boolean, p_group_ids uuid[] default '{}'::uuid[])
returns void language plpgsql security definer set search_path to 'public' as $function$
declare me uuid:=circle_uid(); l circle_links; other uuid; ids uuid[]:=coalesce(p_group_ids,'{}'); ig uuid;
begin
  select * into l from circle_links where id=p_link and me in (user_low,user_high) and requested_by<>me and status='pending' for update;
  if not found then raise exception 'Request not found'; end if;
  other:=case when l.user_low=me then l.user_high else l.user_low end;
  perform circle_ensure_profile();
  update circle_links set status=case when p_accept then 'accepted'::circle_link_status else 'declined'::circle_link_status end,
    responded_at=now() where id=l.id;
  if p_accept then
    if cardinality(ids)=0 then
      select i.group_id into ig from circle_invites i where i.id=l.via_invite and i.owner_id=me;
      ids:=array[coalesce(ig,circle_default_group(me))];
    end if;
    insert into circle_group_members(group_id,member_id)
      select g.id,other from circle_groups g where g.owner_id=me and g.id=any(ids)
      on conflict do nothing;
  end if;
end $function$;
