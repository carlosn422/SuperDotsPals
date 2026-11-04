-- The default "Friends" group can't be renamed or un-defaulted (also guards older app builds).
create or replace function public.circle_keep_default_group() returns trigger
language plpgsql set search_path to '' as $function$
begin
  if old.is_default then
    new.name := old.name;
    new.is_default := true;
  end if;
  return new;
end $function$;

drop trigger if exists circle_groups_keep_default on public.circle_groups;
create trigger circle_groups_keep_default before update on public.circle_groups
for each row execute function public.circle_keep_default_group();

update public.circle_groups set name = 'Friends' where is_default and name <> 'Friends';
