# Superdots Pals — iOS-first Wellness Demo

A playful, original React Native Expo stress and recovery demo inspired by wellness dashboards. Visual styling takes cues from the supplied Superdots brand direction: vivid grape-purple, soft lilac, rounded cards, and a friendly two-eyed alien companion with antennae. This new illustrated mascot is **not** a reproduction of the existing one-eyed Superdots logo artwork.

## Run

```bash
npm install
npx expo start --ios
```

## Included

- Today with tappable companion and fictional HRV and stress readings
- Trends with day/week/month/year charts and sample insights
- Sleep stages, workouts, steps, daylight, mood, water and caffeine trackers
- One-minute breathing activity and theme selector
- iOS-first Expo app (no Apple Health/Watch integration yet)

**Important:** No real physiological data is used. All health values and recommendations are fictional demonstrations, not medical advice. Habit entries and theme previews are session-local. App has not yet been tested on an iPhone simulator.

## Added feature coverage
- Current HRV sample: 67ms latest with baseline comparison
- Mindfulness session counter and simulated environmental noise levels
- Twelve selectable emotional-state check-ins
- Preset wellness-buddy explanations to mimic an AI coach, without live AI
- HRV, Stress and Sleep widget/watch *previews* (not actual system widgets)

Future native work: HealthKit authorization, true live readings, validated scoring, watchOS companion and complications, iOS widget extension, cloud-sync choice, and safe AI processing with consent.
