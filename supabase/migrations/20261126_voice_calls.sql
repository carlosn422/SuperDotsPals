-- Voice friend (Gemini Live) usage per account, plus an editable monthly cap and prices.
-- Change the cap:   update public.voice_settings set monthly_minutes_cap = 90;   (0 turns voice off)
create table if not exists public.voice_settings (
  id boolean primary key default true check (id),
  monthly_minutes_cap integer not null default 60 check (monthly_minutes_cap >= 0),
  -- USD per 1M tokens (Gemini Live paid tier), used for estimated_cost_usd.
  price_input_text numeric(8,4) not null default 0.75,
  price_input_audio numeric(8,4) not null default 3.00,
  price_output_text numeric(8,4) not null default 4.50,
  price_output_audio numeric(8,4) not null default 12.00,
  updated_at timestamptz not null default now()
);
insert into public.voice_settings (id) values (true) on conflict (id) do nothing;
alter table public.voice_settings enable row level security;

create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  voice text not null check (voice in ('female','male')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds between 0 and 3600),
  input_text_tokens integer not null default 0,
  input_audio_tokens integer not null default 0,
  output_text_tokens integer not null default 0,
  output_audio_tokens integer not null default 0,
  estimated_cost_usd numeric(10,5) not null default 0
);
create index if not exists voice_calls_user_started_idx on public.voice_calls (user_id, started_at desc);
alter table public.voice_calls enable row level security;
drop policy if exists "Users read own voice calls" on public.voice_calls;
create policy "Users read own voice calls" on public.voice_calls for select to authenticated using (auth.uid() = user_id);

-- Called by the app when a call ends. Only closes the caller's own open call; length can't exceed real elapsed time.
create or replace function public.finish_voice_call(p_call_id uuid, p_seconds integer, p_input_text integer, p_input_audio integer, p_output_text integer, p_output_audio integer)
returns void language sql security definer set search_path = public as $$
  update public.voice_calls c set
    ended_at = now(),
    duration_seconds = least(greatest(p_seconds, 0), ceil(extract(epoch from now() - c.started_at))::integer, 3600),
    input_text_tokens = greatest(p_input_text, 0),
    input_audio_tokens = greatest(p_input_audio, 0),
    output_text_tokens = greatest(p_output_text, 0),
    output_audio_tokens = greatest(p_output_audio, 0),
    estimated_cost_usd = round((greatest(p_input_text, 0) * s.price_input_text + greatest(p_input_audio, 0) * s.price_input_audio
      + greatest(p_output_text, 0) * s.price_output_text + greatest(p_output_audio, 0) * s.price_output_audio) / 1000000.0, 5)
  from public.voice_settings s
  where s.id and c.id = p_call_id and c.user_id = auth.uid() and c.ended_at is null;
$$;
revoke all on function public.finish_voice_call(uuid, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.finish_voice_call(uuid, integer, integer, integer, integer, integer) to authenticated;
