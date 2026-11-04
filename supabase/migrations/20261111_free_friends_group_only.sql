-- Free accounts: only the default "Friends" group. Move every free user's friends into Friends and remove their other groups.
create or replace function public.enforce_free_group_limit() returns trigger
language plpgsql security definer set search_path to '' as $function$
begin
  if not new.is_default and not public.has_plus(new.owner_id) then
    raise exception 'MoodPals Free includes the Friends group. Upgrade to MoodPals Plus to create more groups.' using errcode = 'P0001';
  end if;
  return new;
end $function$;

insert into public.circle_group_members(group_id,member_id)
select public.circle_default_group(p.user_id), case when l.user_low=p.user_id then l.user_high else l.user_low end
from public.circle_profiles p
join public.circle_links l on l.status='accepted' and p.user_id in (l.user_low,l.user_high)
where not public.has_plus(p.user_id)
on conflict do nothing;

delete from public.circle_groups g where not g.is_default and not public.has_plus(g.owner_id);
