-- Plus includes 30 minutes of pal talk time a month (was 60), so every plan covers its Gemini cost.
update public.voice_settings set monthly_minutes_cap = 30, updated_at = now() where id;
