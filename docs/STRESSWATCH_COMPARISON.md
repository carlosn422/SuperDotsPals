# MoodPals vs StressWatch

Benchmark: [StressWatch: AI Stress Monitor](https://apps.apple.com/us/app/stresswatch-ai-stress-monitor/id6444737095) (One Hundred Bad Ideas Ltd, v3.4.3, 4.7★ / 24.5k ratings). Sources: App Store listing and screenshots, plus the ScreensDesign catalog entry (229 recorded screens).

| Area | StressWatch | MoodPals before (`feature/moodpals`) | `moodpals-optimized` |
|---|---|---|---|
| Home hero | Big colour-changing mascot, "here's your daily score", level word (Great…), 4-colour scale | Mood mascot, latest raw HRV value | **Stress hero**: daily stress level from HRV + resting HR vs personal baseline, 4-colour scale with marker, mascot mapped to level, sync button |
| Stress model | HRV-based stress levels, hourly→yearly | None (only raw HRV, median comparison) | `StressEngine.ts`: per-HRV-sample 0–100 score vs 21-day baseline (min 8 samples / 3 days), levels Great / Normal / Elevated / Overload |
| HRV trend | Dot chart coloured by level, 0:00–24:00 | Bars of HRV medians | **HRV Trend** card (Today / 7 days), dots coloured by stress level, latest-level pill |
| Heart rate | Daily HR chart | Resting HR only | **Heart Rate** card: hourly averages from HealthKit, avg + resting |
| Actions | Sleep (duration / quality / avg HR + ring), Fitness (Move / Exercise / Stand rings), Daylight, Mindfulness, Steps, Noise | Water, caffeine, journal, chat; sleep/steps only on Health tab | **Body & recovery** grid with all six tiles from Apple Health; Mindfulness opens the breathing studio |
| HealthKit | HRV, HR, RHR, sleep stages, activity, daylight, mindful, noise | HRV, RHR, steps, sleep total | + hourly heart rate, sleep stages + sleep HR, activity summaries, time in daylight (iOS 17+), mindful sessions, environmental noise |
| Sleep detail | Dark sleep screen with stages | Sleep total only | **Sleep detail** sheet (tap Sleep): stages breakdown, sleep HR, 7-night chart |
| Energy | Body battery | None | **Energy card**: 0–100 from sleep, stress score and active calories |
| Trends | Hourly / daily / monthly / yearly stress | Mood check-in counts + health medians | **Stress Trend** card per period with level colours and time-in-level distribution |
| Alerts | Stress notifications | Daily reminder only | Opt-in **stress alerts** (threshold 60/75/85, 3 h cooldown); tapping one opens a breathing break |
| Mood / water / caffeine | Yes | Yes | Unchanged |
| AI | "Ask AI" chat | `superdot-chat` Edge Function (Gemini) | Unchanged; it already reads non-demo `wellness_readings`, so it now sees stress scores too |
| Watch | Watch app + complications | watchOS app (mood, breathing, basic health) | Unchanged in this PR |
| Look | Mint/pastel, white cards, dark text | Lilac/grape | Mint theme (`APP_THEME`), white elevated cards |

## Still missing compared with StressWatch
- Background HealthKit delivery (scores and alerts update when the app syncs, not while it's closed).
- Watch-face complications/widgets with the live stress level.
- Bio age.
- Subscription paywall (intentionally out of scope).
