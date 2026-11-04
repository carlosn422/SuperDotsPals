-- Live friend requests: the app subscribes to circle_links changes (RLS cl_select limits rows to the two people).
alter publication supabase_realtime add table public.circle_links;
