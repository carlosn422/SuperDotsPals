-- Personal and group codes each allow one active code (fixes group codes colliding with the personal-code index).
drop index if exists public.circle_invites_one_active;
create unique index circle_invites_one_active on public.circle_invites(owner_id) where revoked_at is null and group_id is null;
create unique index if not exists circle_invites_one_active_group on public.circle_invites(group_id) where revoked_at is null and group_id is not null;

create or replace function public.circle_group_invite(p_group uuid, p_regenerate boolean default false)
returns table(code text, expires_at timestamptz)
language plpgsql security definer set search_path to 'public' as $function$
declare me uuid:=circle_uid();
begin
  if not exists(select 1 from circle_groups g where g.id=p_group and g.owner_id=me) then raise exception 'Group not found'; end if;
  if not p_regenerate then
    return query select i.code,i.expires_at from circle_invites i
      where i.owner_id=me and i.group_id=p_group and i.revoked_at is null and i.expires_at>now();
    if found then return; end if;
  end if;
  update circle_invites set revoked_at=now() where owner_id=me and group_id=p_group and revoked_at is null;
  return query insert into circle_invites(owner_id,code,group_id) values(me,circle_new_code(),p_group)
    returning circle_invites.code,circle_invites.expires_at;
end $function$;
