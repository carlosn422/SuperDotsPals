-- Live health refresh: the iPhone subscribes to its own wellness_readings inserts (RLS "own readings select" limits rows to the owner),
-- so stress, HRV and sleep uploaded by the Apple Watch update the iPhone MoodPal within seconds.
alter publication supabase_realtime add table public.wellness_readings;
