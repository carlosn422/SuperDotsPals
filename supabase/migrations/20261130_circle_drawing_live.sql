-- Lock Screen Live Activity for Circle drawings: ActivityKit push tokens per device.
-- kind 'start' lets the server start the drawing activity while MoodPals is closed (iOS 17.2+);
-- kind 'update' belongs to one running activity (iOS ends them after 8–12 hours).
create table public.circle_drawing_live_tokens (
  token text primary key check (token ~ '^[0-9a-f]{16,400}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('start', 'update')),
  activity_id text,
  group_id uuid references public.circle_groups(id) on delete cascade,
  env text not null default 'production' check (env in ('sandbox', 'production')),
  updated_at timestamptz not null default now()
);
create index circle_drawing_live_tokens_user on public.circle_drawing_live_tokens(user_id);
alter table public.circle_drawing_live_tokens enable row level security;

create function public.circle_drawing_live_register(p_token text, p_kind text, p_activity text default null, p_group uuid default null, p_env text default 'production')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_kind = 'update' and p_activity is not null then
    delete from circle_drawing_live_tokens where user_id = auth.uid() and activity_id = p_activity and token <> lower(p_token);
  end if;
  insert into circle_drawing_live_tokens(token, user_id, kind, activity_id, group_id, env)
    values (lower(p_token), auth.uid(), p_kind, p_activity, p_group, p_env)
    on conflict (token) do update set user_id = excluded.user_id, kind = excluded.kind, activity_id = excluded.activity_id,
      group_id = excluded.group_id, env = excluded.env, updated_at = now();
  -- Ended activities and old devices: keep the newest few per user.
  delete from circle_drawing_live_tokens where user_id = auth.uid() and token in (
    select token from circle_drawing_live_tokens where user_id = auth.uid() and kind = p_kind order by updated_at desc offset 5);
end $$;

-- Sign-out on this phone: the next account must not get the last one's drawings.
create function public.circle_drawing_live_unregister(p_tokens text[]) returns void
language sql security definer set search_path = public as $$
  delete from circle_drawing_live_tokens where user_id = auth.uid() and token = any(select lower(t) from unnest(p_tokens) t);
$$;

-- Devices to reach for a new drawing: members who picked this Circle for their widget.
create function public.circle_drawing_live_targets(p_group uuid)
returns table(token text, kind text, env text, user_id uuid)
language sql stable security definer set search_path = public as $$
  select t.token, t.kind, t.env, t.user_id
  from circle_drawing_live_tokens t join circle_drawing_prefs p on p.user_id = t.user_id
  where p.widget_group_id = p_group and circle_drawing_member_of(p_group, t.user_id)
    and (t.kind = 'start' or (t.group_id = p_group and t.updated_at > now() - interval '8 hours'));
$$;

revoke all on function public.circle_drawing_live_register(text, text, text, uuid, text), public.circle_drawing_live_unregister(text[]),
  public.circle_drawing_live_targets(uuid) from public, anon;
grant execute on function public.circle_drawing_live_register(text, text, text, uuid, text), public.circle_drawing_live_unregister(text[]) to authenticated;
grant execute on function public.circle_drawing_live_targets(uuid) to service_role;
