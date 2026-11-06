-- Circle calendar history. Read-only helpers for the History calendar; retention and visibility rules are unchanged:
-- friends' moods still count only while circle_can_see_mood allows them (24 h), and reactions/signals follow the same
-- rules as circle_reaction_inbox and circle_signals RLS.

-- Local calendar days (in p_tz) between p_start and p_end that have Circle activity the caller may see. Dates only, no content.
create or replace function public.circle_activity_days(p_start timestamptz, p_end timestamptz, p_tz text)
returns setof date language plpgsql stable security definer set search_path to 'public' as $$
declare me uuid:=circle_uid(); tz text:=p_tz;
begin
  if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '45 days' then raise exception 'Invalid range'; end if;
  if tz is null or not exists(select 1 from pg_timezone_names where name=tz) then tz:='UTC'; end if;
  return query select distinct (t at time zone tz)::date from (
    select r.updated_at t from circle_reactions r join circle_shared_moods m on m.id=r.shared_mood_id
      where m.owner_id=me and r.updated_at>=p_start and r.updated_at<p_end
        and (circle_are_friends(m.owner_id,r.reactor_id) or family_audience(m.owner_id,r.reactor_id))
    union all
    select m.shared_at from circle_mood_recipients x join circle_shared_moods m on m.id=x.shared_mood_id
      where x.recipient_id=me and m.shared_at>=p_start and m.shared_at<p_end and circle_can_see_mood(m.id)
    union all
    select r.updated_at from circle_reactions r
      where r.reactor_id=me and r.updated_at>=p_start and r.updated_at<p_end and circle_can_see_mood(r.shared_mood_id)
    union all
    select s.sent_at from circle_signals s where s.recipient_id=me and s.sent_at>=p_start and s.sent_at<p_end
    union all
    select s.sent_at from circle_signals s where s.sender_id=me and s.sent_at>=p_start and s.sent_at<p_end
  ) a;
end $$;

-- Reactions friends sent to my moods within a time range (same audience rule as circle_reaction_inbox).
create or replace function public.circle_reaction_history(p_start timestamptz, p_end timestamptz, p_limit integer default 200)
returns table(id uuid, shared_mood_id uuid, mood text, shared_at timestamptz, reactor_id uuid, reactor_name text, emoji text, style text, reacted_at timestamptz, read_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
declare me uuid:=circle_uid();
begin
  if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '45 days' then raise exception 'Invalid range'; end if;
  return query select r.id,r.shared_mood_id,m.mood,m.shared_at,r.reactor_id,coalesce(p.display_name,'A friend'),r.emoji,r.style,r.updated_at,r.read_at
    from circle_reactions r
    join circle_shared_moods m on m.id=r.shared_mood_id
    left join circle_profiles p on p.user_id=r.reactor_id
    where m.owner_id=me and r.updated_at>=p_start and r.updated_at<p_end
      and (circle_are_friends(m.owner_id,r.reactor_id) or family_audience(m.owner_id,r.reactor_id))
    order by r.updated_at desc
    limit greatest(1,least(coalesce(p_limit,200),500));
end $$;


revoke all on function public.circle_activity_days(timestamptz,timestamptz,text) from public, anon;
grant execute on function public.circle_activity_days(timestamptz,timestamptz,text) to authenticated;
revoke all on function public.circle_reaction_history(timestamptz,timestamptz,integer) from public, anon;
grant execute on function public.circle_reaction_history(timestamptz,timestamptz,integer) to authenticated;
