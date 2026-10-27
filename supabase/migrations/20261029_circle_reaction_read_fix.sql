-- circle_reaction_renew copied old.read_at on every update that kept the emoji, which also undid
-- circle_mark_reactions_read: notifications could never be marked read. Only an emoji change touches read_at now.
create or replace function public.circle_reaction_renew() returns trigger language plpgsql set search_path=public as $$
begin
  if new.emoji is distinct from old.emoji then
    new.id:=gen_random_uuid(); new.read_at:=null; new.updated_at:=now();
  else
    new.id:=old.id;
  end if;
  return new;
end $$;
