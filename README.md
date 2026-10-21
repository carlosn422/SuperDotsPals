# Superdots Pals — iOS-first Wellness Demo

A playful, original React Native Expo stress and recovery demo inspired by wellness dashboards. Visual styling takes cues from the supplied Superdots brand direction: vivid grape-purple, soft lilac, rounded cards, and a friendly two-eyed alien companion with antennae. This new illustrated mascot is **not** a reproduction of the existing one-eyed Superdots logo artwork.

## Run

```bash
npm install
npx expo start --ios
```

## Included

- Today: StressWatch-style stress hero (daily stress level from HRV and resting heart rate vs your own 21-day baseline), HRV trend and hourly heart-rate cards
- Actions: sleep, fitness rings, daylight, mindfulness, steps and noise from Apple Health; water, caffeine, mood check-ins, journal, breathing, spiritual reading and AI chat
- Trends: stress trend by day/week/month/year, mood check-ins, Apple Health trends, PDF report export
- Apple Health sync (native iOS build only) to the user's private Supabase rows; opt-in stress alerts and daily reminders
- Background Apple Health delivery (HRV, resting HR, sleep, heart rate) keeps the score, widgets and alerts current while the app is closed
- Home/lock-screen stress widget (`targets/stress-widget`)
- watchOS companion (see `watchos/`)

See [docs/STRESSWATCH_COMPARISON.md](docs/STRESSWATCH_COMPARISON.md) for the feature comparison.

**Important:** Stress scores are a wellness estimate based on your own readings, not a medical measurement or diagnosis. HealthKit isn't available in Expo Go.
