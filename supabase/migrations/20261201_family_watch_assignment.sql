-- Watch assignment rules for Family members:
-- * A watch that belongs to another member can't be taken by assigning it (it used to merge the two members).
-- * Unassigning keeps the member and parks the watch in a hidden "watch_only" row so it can be assigned again.
alter table public.family_children add column if not exists watch_only boolean not null default false;

create or replace function public.family_link_child_watch(p_child uuid, p_profile uuid)
returns public.family_children language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  target public.family_children;
  other public.family_children;
begin
  select * into target from public.family_children where id = p_child and owner_id = me for update;
  if target.id is null or target.watch_only then raise exception 'Member not found' using errcode = 'P0002'; end if;
  if not exists(select 1 from public.family_profiles f where f.profile_user_id = p_profile and f.owner_id = me) then
    raise exception 'Family watch not found' using errcode = 'P0002';
  end if;
  if target.profile_user_id = p_profile then return target; end if;
  if target.profile_user_id is not null then raise exception 'This member already has a watch. Unassign it first.' using errcode = 'P0001'; end if;
  select * into other from public.family_children where profile_user_id = p_profile for update;
  if other.id is not null then
    -- Only a parked watch, or the row created moments ago by adding a new watch, may be merged into this member.
    if not other.watch_only and other.created_at < now() - interval '15 minutes' then
      raise exception 'This watch is assigned to %. Unassign it there first.', other.name using errcode = 'P0001';
    end if;
    update public.screen_break_sessions set child_id = target.id where child_id = other.id;
    delete from public.family_children where id = other.id;
  end if;
  update public.family_children set profile_user_id = p_profile, updated_at = now() where id = target.id returning * into target;
  return target;
end $$;
revoke all on function public.family_link_child_watch(uuid, uuid) from public, anon;
grant execute on function public.family_link_child_watch(uuid, uuid) to authenticated;

create or replace function public.family_unassign_child_watch(p_child uuid)
returns public.family_children language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  target public.family_children;
  watch uuid;
  watch_name text;
begin
  select * into target from public.family_children where id = p_child and owner_id = me and not watch_only for update;
  if target.id is null then raise exception 'Member not found' using errcode = 'P0002'; end if;
  watch := target.profile_user_id;
  if watch is null then return target; end if;
  update public.family_children set profile_user_id = null, updated_at = now() where id = target.id returning * into target;
  select device_name into watch_name from public.family_profiles where profile_user_id = watch;
  insert into public.family_children(owner_id, name, profile_user_id, watch_only)
  values (me, left(public.family_child_name(watch_name), 40), watch, true);
  return target;
end $$;
revoke all on function public.family_unassign_child_watch(uuid) from public, anon;
grant execute on function public.family_unassign_child_watch(uuid) to authenticated;

-- Parked watches don't count toward the 10-member limit.
create or replace function public.family_add_child(p_name text)
returns public.family_children language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  clean text := btrim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g'));
  row public.family_children;
begin
  if me is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if public.is_family_profile(me) then raise exception 'A family watch profile cannot add members.' using errcode = 'P0001'; end if;
  if char_length(clean) not between 1 and 40 then raise exception 'Use 1 to 40 characters.' using errcode = 'P0001'; end if;
  if (select count(*) from public.family_children c where c.owner_id = me and not c.watch_only) >= 10 then
    raise exception 'You can add up to 10 members.' using errcode = 'P0001';
  end if;
  insert into public.family_children(owner_id, name) values (me, clean) returning * into row;
  return row;
end $$;
revoke all on function public.family_add_child(text) from public, anon;
grant execute on function public.family_add_child(text) to authenticated;
