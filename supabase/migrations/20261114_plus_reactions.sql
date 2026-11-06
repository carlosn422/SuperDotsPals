-- Plus reactions: Plus members can react with any single emoji in either Apple ("standard") or Fluent "3d" art.
-- Free members keep the per-mood list in circle_reaction_allowed, standard art only.
alter table public.circle_reactions add column if not exists style text not null default 'standard';
alter table public.circle_reactions drop constraint if exists circle_reactions_style_check;
alter table public.circle_reactions add constraint circle_reactions_style_check check (style in ('standard','3d'));

-- Emoji only: at least one non-ASCII character, no letters or whitespace, so reactions can't carry text.
create or replace function public.circle_reaction_ok(p_mood uuid, p_emoji text, p_style text) returns boolean
language sql stable security definer set search_path=public as $$
  select case when public.has_plus(auth.uid()) then
      public.circle_can_see_mood(p_mood)
      and char_length(p_emoji) between 1 and 16
      and octet_length(p_emoji) > char_length(p_emoji)
      and p_emoji !~ '[[:alpha:][:space:]]'
    else coalesce(p_style,'standard')='standard' and public.circle_reaction_allowed(p_mood,p_emoji) end;
$$;
revoke all on function public.circle_reaction_ok(uuid,text,text) from public, anon;
grant execute on function public.circle_reaction_ok(uuid,text,text) to authenticated;

drop policy if exists cr_insert on public.circle_reactions;
create policy cr_insert on public.circle_reactions for insert to authenticated
  with check (reactor_id=(select auth.uid()) and public.circle_reaction_ok(shared_mood_id,emoji,style));
drop policy if exists cr_update on public.circle_reactions;
create policy cr_update on public.circle_reactions for update to authenticated
  using (reactor_id=(select auth.uid())) with check (reactor_id=(select auth.uid()) and public.circle_reaction_ok(shared_mood_id,emoji,style));
