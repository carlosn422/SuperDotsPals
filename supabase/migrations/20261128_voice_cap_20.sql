-- Plus includes 20 minutes of pal talk time a month (was 60), so every plan covers its Gemini cost after Apple's 30%.
update public.voice_settings set monthly_minutes_cap = 20, updated_at = now() where id;
