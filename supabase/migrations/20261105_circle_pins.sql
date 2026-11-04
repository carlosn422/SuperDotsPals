-- Pin people to the front of My Circle → Your People (per account, private to the owner).
alter table public.circle_friend_settings add column pinned_at timestamptz;

drop function public.circle_friends();
create function public.circle_friends() returns table(friend_id uuid,display_name text,real_name text,nickname text,avatar_color text,since timestamptz,muted boolean,hide_my_moods boolean,pinned_at timestamptz)
language sql stable security definer set search_path=public as $$
  select f.fid, coalesce(s.nickname,p.display_name,'MoodPals friend'), coalesce(p.display_name,'MoodPals friend'), s.nickname,
    coalesce(p.avatar_color,'#7BC6A4'), f.since, coalesce(s.muted,false), coalesce(s.hide_my_moods,false), s.pinned_at
  from (select case when l.user_low=auth.uid() then l.user_high else l.user_low end fid, coalesce(l.responded_at,l.created_at) since
        from circle_links l where auth.uid() in (l.user_low,l.user_high) and l.status='accepted') f
  left join circle_profiles p on p.user_id=f.fid
  left join circle_friend_settings s on s.owner_id=auth.uid() and s.friend_id=f.fid
  order by 2;
$$;
revoke all on function public.circle_friends() from public, anon;
grant execute on function public.circle_friends() to authenticated;
