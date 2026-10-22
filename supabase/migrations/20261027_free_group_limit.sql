-- MoodPals Free includes one My Circle group; more groups need MoodPals Plus.
create or replace function public.enforce_free_group_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_plus(new.owner_id)
     and (select count(*) from public.circle_groups g where g.owner_id = new.owner_id) >= 1 then
    raise exception 'MoodPals Free includes 1 group. Upgrade to MoodPals Plus for more.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.enforce_free_group_limit() from public, anon, authenticated;

drop trigger if exists circle_groups_free_limit on public.circle_groups;
create trigger circle_groups_free_limit before insert on public.circle_groups
  for each row execute function public.enforce_free_group_limit();
