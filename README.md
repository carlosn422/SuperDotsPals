# SuperDotsPals — iOS Stress & Recovery Demo

An original React Native / Expo iOS-first wellbeing demo inspired by the general information architecture of HRV-based stress monitoring apps. All health metrics are sample data; no HealthKit connection or medical interpretation is implemented.

## Run

```bash
npm install
npx expo start --ios
```

Requires macOS with Xcode Simulator for `--ios`; alternatively open the project in Expo Go using `npx expo start`.

## Features

- Daily readiness and HRV dashboard
- Sample heart-rate and stress trend graphs
- Daily / weekly trend selector
- Mood, hydration and caffeine habit logging (session-local)
- Recovery/breathing timer
- Sample insights and settings screen

**Demo only:** All health readings are fictional. A future production version should request Apple Health access with explicit consent and use validated health models, privacy controls, and safety guidance.
