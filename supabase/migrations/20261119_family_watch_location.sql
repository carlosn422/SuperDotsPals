-- Family watches share their last known location with their owner.
-- The watch sends it only when the app opens or a mood is set; only the latest point is kept.

create table if not exists public.family_watch_locations(
  profile_user_id uuid primary key references auth.users(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision,
  recorded_at timestamptz not null default now()
);
alter table public.family_watch_locations enable row level security;
revoke all on table public.family_watch_locations from public, anon, authenticated;

create or replace function public.family_watch_report_location(p_lat double precision, p_lon double precision, p_accuracy double precision default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare me uuid:=auth.uid();
begin
  if me is null or not exists(select 1 from family_profiles where profile_user_id=me) then return; end if;
  insert into family_watch_locations(profile_user_id,latitude,longitude,accuracy_m,recorded_at)
  values(me,p_lat,p_lon,p_accuracy,now())
  on conflict(profile_user_id) do update
    set latitude=excluded.latitude, longitude=excluded.longitude,
        accuracy_m=excluded.accuracy_m, recorded_at=excluded.recorded_at;
end $function$;

create or replace function public.family_watch_location(p_profile uuid)
returns table(latitude double precision, longitude double precision, accuracy_m double precision, recorded_at timestamptz)
language sql stable security definer set search_path to 'public' as $function$
  select l.latitude, l.longitude, l.accuracy_m, l.recorded_at
  from family_watch_locations l
  where l.profile_user_id=p_profile
    and exists(select 1 from family_profiles f where f.profile_user_id=p_profile and f.owner_id=auth.uid())
$function$;

revoke all on function public.family_watch_report_location(double precision,double precision,double precision) from public, anon;
revoke all on function public.family_watch_location(uuid) from public, anon;
grant execute on function public.family_watch_report_location(double precision,double precision,double precision) to authenticated;
grant execute on function public.family_watch_location(uuid) to authenticated;
