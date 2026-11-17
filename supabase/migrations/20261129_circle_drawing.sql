-- Circle drawing: an optional shared freehand canvas for each Circle group (owner + members).
-- Reuses circle_groups / circle_group_members for membership, invitations and owner controls.
-- Only the latest canvas is kept (no history, no images). Strokes are vector JSON on a 1000x1000 square:
-- {"id":text,"u":uuid author,"b":"pen"|"marker"|"pencil"|"highlighter","c":"#RRGGBB","w":number,"p":[x,y,x,y,...]}.

-- A row exists while the owner has the canvas turned on for that group.
create table public.circle_group_canvas (
  group_id uuid primary key references public.circle_groups(id) on delete cascade,
  background text not null default '#FFFFFF' check (background ~ '^#[0-9A-F]{6}$'),
  strokes jsonb not null default '[]'::jsonb check (jsonb_typeof(strokes) = 'array'),
  version bigint not null default 0,
  updated_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null
);

-- Per-user drawing settings: the one Circle shown in my widget, the widget's access token and today's publish count.
create table public.circle_drawing_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  widget_group_id uuid references public.circle_groups(id) on delete set null,
  widget_token_hashes text[] not null default '{}',  -- one per device, newest first
  publish_day date,
  publish_count int not null default 0
);

alter table public.circle_group_canvas enable row level security;
alter table public.circle_drawing_prefs enable row level security;

create function public.circle_drawing_member_of(p_group uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from circle_groups g where g.id = p_group and g.owner_id = p_user)
      or exists(select 1 from circle_group_members m where m.group_id = p_group and m.member_id = p_user);
$$;
create function public.circle_drawing_member(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.circle_drawing_member_of(p_group, auth.uid());
$$;
create index circle_drawing_prefs_tokens on public.circle_drawing_prefs using gin (widget_token_hashes);

create policy cgc_select on public.circle_group_canvas for select to authenticated using (public.circle_drawing_member(group_id));
create policy cdp_select on public.circle_drawing_prefs for select to authenticated using (user_id = auth.uid());
-- All writes go through the functions below.

-- Free tools: pen, default width, six colors. Everything else needs MoodPals Plus.
create function public.circle_stroke_is_free(s jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(s->>'b', 'pen') = 'pen'
     and coalesce((s->>'w')::numeric, 10) = 10
     and upper(s->>'c') in ('#1C2B33', '#E5484D', '#F59E0B', '#34B37E', '#3B82F6', '#8B5CF6');
$$;

create function public.circle_stroke_is_valid(s jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(s) = 'object'
     and char_length(coalesce(s->>'id', '')) between 1 and 40
     and coalesce(s->>'b', 'pen') in ('pen', 'marker', 'pencil', 'highlighter')
     and coalesce(s->>'c', '') ~* '^#[0-9A-F]{6}$'
     and jsonb_typeof(s->'w') = 'number' and (s->>'w')::numeric between 1 and 60
     and jsonb_typeof(s->'p') = 'array' and jsonb_array_length(s->'p') between 2 and 4000
     and jsonb_array_length(s->'p') % 2 = 0
     and char_length(coalesce(s->>'f', '')) <= 40;
$$;

-- Owner turns the shared canvas on or off. Turning it off removes the canvas.
create function public.circle_canvas_enable(p_group uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from circle_groups where id = p_group and owner_id = auth.uid()) then
    raise exception 'Only the group owner can change its canvas.';
  end if;
  if p_on then insert into circle_group_canvas(group_id) values (p_group) on conflict do nothing;
  else delete from circle_group_canvas where group_id = p_group; end if;
end $$;

-- Canvases I can draw on, with members (visible to everyone in a group once its canvas is on).
create function public.circle_canvas_list() returns table(
  group_id uuid, name text, icon text, color text, owner_id uuid, is_owner boolean, version bigint,
  updated_at timestamptz, updated_by uuid, is_widget boolean, members jsonb, plus boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.icon, g.color, g.owner_id, g.owner_id = auth.uid(), c.version, c.updated_at, c.updated_by,
    coalesce((select p.widget_group_id = g.id from circle_drawing_prefs p where p.user_id = auth.uid()), false),
    (select coalesce(jsonb_agg(jsonb_build_object('id', u.uid, 'name', coalesce(pr.display_name, 'Friend'), 'color', coalesce(pr.avatar_color, '#7BC6A4'), 'owner', u.uid = g.owner_id) order by u.uid <> g.owner_id, pr.display_name), '[]'::jsonb)
       from (select g.owner_id uid union select m.member_id from circle_group_members m where m.group_id = g.id) u
       left join circle_profiles pr on pr.user_id = u.uid),
    has_plus(g.owner_id)
  from circle_groups g join circle_group_canvas c on c.group_id = g.id
  where circle_drawing_member(g.id)
  order by coalesce(c.updated_at, g.created_at) desc;
$$;

create function public.circle_drawing_publishes_left() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, 5 - coalesce((select publish_count from circle_drawing_prefs where user_id = auth.uid() and publish_day = current_date), 0));
$$;

-- Publishes one drawing session: removes erased strokes by id, adds new ones, optionally changes the background.
-- Merges with anything other members published meanwhile. The group owner's plan decides the canvas:
-- owner has Plus = unlimited publishes and all tools for every member; otherwise each member gets 5 publishes a day and basic tools.
-- Returns my free publishes left today (null on a Plus owner's canvas).
create function public.circle_canvas_publish(p_group uuid, p_remove text[] default '{}', p_add jsonb default '[]'::jsonb, p_background text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); plus boolean := has_plus((select owner_id from circle_groups where id = p_group)); rm text[] := coalesce(p_remove, '{}');
  orig jsonb; cur jsonb; added jsonb := '[]'::jsonb; s jsonb; src jsonb; used int; lim int;
begin
  if not circle_drawing_member(p_group) then raise exception 'You are not in this Circle.'; end if;
  if jsonb_typeof(coalesce(p_add, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_add, '[]'::jsonb)) > 1500 then raise exception 'Invalid drawing'; end if;
  if p_background is not null and upper(p_background) <> '#FFFFFF' and not plus then
    raise exception 'Background colors are part of MoodPals Plus.' using errcode = 'P0001';
  end if;
  select strokes into orig from circle_group_canvas where group_id = p_group for update;
  if not found then raise exception 'This Circle''s canvas is turned off.'; end if;

  for s in select * from jsonb_array_elements(coalesce(p_add, '[]'::jsonb)) loop
    if not coalesce(circle_stroke_is_valid(s), false) then raise exception 'Invalid stroke'; end if;
    if s->>'f' = any(rm) then
      -- A piece left after erasing part of saved stroke f: keeps that stroke's look and author.
      src := null;
      select o.value into src from jsonb_array_elements(orig) o where o.value->>'id' = s->>'f' limit 1;
      if src is null then continue; end if;  -- someone else already erased the whole stroke
      if coalesce(src->>'b', 'pen') <> coalesce(s->>'b', 'pen') or upper(src->>'c') <> upper(s->>'c') or (src->>'w')::numeric <> (s->>'w')::numeric then
        raise exception 'Invalid stroke';
      end if;
      s := (s - 'f' - 'u') || jsonb_strip_nulls(jsonb_build_object('u', src->'u'));
    else
      if not plus and not circle_stroke_is_free(s) then
        raise exception 'More brushes, colors and sizes are part of MoodPals Plus.' using errcode = 'P0001';
      end if;
      s := (s - 'f') || jsonb_build_object('u', me);
    end if;
    added := added || jsonb_build_array(s);
  end loop;

  lim := case when plus then 500 else 5 end;  -- Plus is unlimited for ordinary use; the cap only stops runaway clients.
  insert into circle_drawing_prefs(user_id, publish_day, publish_count) values (me, current_date, 0)
    on conflict (user_id) do update set publish_day = current_date,
      publish_count = case when circle_drawing_prefs.publish_day = current_date then circle_drawing_prefs.publish_count else 0 end
    returning publish_count into used;
  if used >= lim then
    raise exception 'You''ve shared 5 drawings today. MoodPals Plus includes unlimited drawing.' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(o.value), '[]'::jsonb) into cur from jsonb_array_elements(orig) o where not (o.value->>'id' = any(rm));
  select cur || coalesce(jsonb_agg(a.value), '[]'::jsonb) into cur
    from jsonb_array_elements(added) a
    where not exists(select 1 from jsonb_array_elements(cur) o where o.value->>'id' = a.value->>'id');
  if jsonb_array_length(cur) > 3000 or pg_column_size(cur) > 900000 then
    raise exception 'This canvas is full. Erase a little to keep going.' using errcode = 'P0001';
  end if;
  update circle_group_canvas set strokes = cur, background = coalesce(upper(p_background), background),
    version = version + 1, updated_at = now(), updated_by = me where group_id = p_group;
  update circle_drawing_prefs set publish_count = used + 1 where user_id = me;
  return case when plus then null else lim - used - 1 end;
end $$;

-- Owner control. Doesn't count as a publish.
create function public.circle_canvas_clear(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from circle_groups where id = p_group and owner_id = auth.uid()) then raise exception 'Only the group owner can clear the canvas.'; end if;
  update circle_group_canvas set strokes = '[]'::jsonb, background = '#FFFFFF', version = version + 1, updated_at = now(), updated_by = auth.uid()
    where group_id = p_group;
end $$;

-- Members can leave a group they were added to. Their strokes stay on the canvas.
create function public.circle_group_leave(p_group uuid) returns void
language sql security definer set search_path = public as $$
  delete from circle_group_members where group_id = p_group and member_id = auth.uid();
$$;

-- My widget shows one Circle's canvas (or nothing). Doesn't affect anyone else.
create function public.circle_drawing_set_widget(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_group is not null and not exists(select 1 from circle_group_canvas where group_id = p_group and circle_drawing_member(p_group)) then
    raise exception 'You are not in this Circle.';
  end if;
  insert into circle_drawing_prefs(user_id, widget_group_id) values (auth.uid(), p_group)
    on conflict (user_id) do update set widget_group_id = excluded.widget_group_id;
end $$;

-- Secret that lets the home-screen widget fetch my selected canvas without a session.
create function public.circle_drawing_widget_token() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text := encode(gen_random_bytes(24), 'hex');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into circle_drawing_prefs(user_id, widget_token_hashes) values (auth.uid(), array[encode(digest(t, 'sha256'), 'hex')])
    on conflict (user_id) do update set widget_token_hashes = (excluded.widget_token_hashes || circle_drawing_prefs.widget_token_hashes)[1:5];
  return t;
end $$;

-- Artwork only. Strokes are omitted when the widget already has p_version, to keep polling cheap.
create function public.circle_drawing_widget_latest(p_token text, p_version bigint default null)
returns table(group_id uuid, background text, strokes jsonb, version bigint)
language sql stable security definer set search_path = public, extensions as $$
  select c.group_id, c.background, case when c.version = p_version then null else c.strokes end, c.version
  from circle_drawing_prefs p join circle_group_canvas c on c.group_id = p.widget_group_id
  where p.widget_token_hashes @> array[encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')]
    and circle_drawing_member_of(c.group_id, p.user_id);
$$;

-- Live updates: members subscribe to the private broadcast topic "drawing:<group id>".
-- The database announces new versions there (no strokes in the message); apps send drafts there while drawing.
create function public.circle_canvas_announce() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform realtime.send(jsonb_build_object('version', new.version, 'by', new.updated_by), 'canvas', 'drawing:' || new.group_id, true);
  return new;
end $$;
create trigger circle_group_canvas_announce after update of version on public.circle_group_canvas
  for each row execute function public.circle_canvas_announce();

create function public.circle_drawing_topic_ok(p_topic text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return p_topic like 'drawing:%' and circle_drawing_member(substr(p_topic, 9)::uuid);
exception when invalid_text_representation then return false;
end $$;
create policy circle_drawing_broadcast_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.circle_drawing_topic_ok(realtime.topic()));
create policy circle_drawing_broadcast_write on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and public.circle_drawing_topic_ok(realtime.topic()));

revoke all on function public.circle_drawing_member_of(uuid, uuid), public.circle_drawing_member(uuid), public.circle_stroke_is_free(jsonb), public.circle_stroke_is_valid(jsonb),
  public.circle_canvas_enable(uuid, boolean), public.circle_canvas_list(), public.circle_drawing_publishes_left(),
  public.circle_canvas_publish(uuid, text[], jsonb, text), public.circle_canvas_clear(uuid), public.circle_group_leave(uuid),
  public.circle_drawing_set_widget(uuid), public.circle_drawing_widget_token(), public.circle_drawing_widget_latest(text, bigint),
  public.circle_canvas_announce(), public.circle_drawing_topic_ok(text) from public, anon;
grant execute on function public.circle_drawing_member(uuid), public.circle_canvas_enable(uuid, boolean), public.circle_canvas_list(),
  public.circle_drawing_publishes_left(), public.circle_canvas_publish(uuid, text[], jsonb, text), public.circle_canvas_clear(uuid),
  public.circle_group_leave(uuid), public.circle_drawing_set_widget(uuid), public.circle_drawing_widget_token(),
  public.circle_drawing_topic_ok(text) to authenticated;
grant execute on function public.circle_drawing_widget_latest(text, bigint) to anon, authenticated;
revoke all on function public.circle_drawing_member_of(uuid, uuid), public.circle_stroke_is_free(jsonb), public.circle_stroke_is_valid(jsonb),
  public.circle_canvas_announce() from authenticated;
