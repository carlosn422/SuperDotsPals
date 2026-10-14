# Wellnest — iOS-first React Native wellness demo

An original sample-data stress and recovery app inspired by the general functionality of StressWatch. **Not affiliated with StressWatch.** It does not copy original app imagery or Mr. Fizz artwork.

## Quick start

```bash
npm install
npx expo start --ios
```

Run on macOS with Xcode Simulator, or use `npx expo start` and open in Expo Go on an iPhone.

## What's included

- Today: friendly recovery character, daily readiness, HRV and resting-heart-rate metrics, charted stress and HRV.
- Trends: day/week/month switches, HRV chart, stress balance, weekly insights.
- Habits: interactive mood, water and caffeine logs; one-minute breathing countdown.
- You: personal sample baseline, current connection status and safety disclaimers.

All values are fictional and some controls retain state only during the current app session. No login, persistent database, Apple Health or Apple Watch integration is implemented. No AI API calls are made and all insights are static examples.

### Next implementation steps

Connect iOS HealthKit with user authorization, persist personal baselines securely, choose and validate a transparent metric interpretation approach, and add Apple Watch support as a separate watchOS project.
