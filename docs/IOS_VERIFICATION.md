# Superdots — iOS implementation and device verification

Branch: `feature/ios-stress-demo`

## New functionality

- Five redesigned Today, Actions, Trends, Health and Settings layouts with Superdots mascots.
- Recorded mood chart and health charts from Supabase; no imaginary scores presented as real health data.
- Hydration/caffeine detail pages with daily totals and history.
- Energy and stress-factor questions stored with private journal entries.
- Manual opt-in Apple Health sync for HRV, resting heart rate, steps and sleep.
- HRV personal baseline card; comparisons require several actual readings and are not diagnostic.
- Gemini AI receives journal, mood, activity, recorded habit and non-demo health context. Prompt remains editable in `ai_assistant_prompts`.
- Apple voice preferences, real local notification scheduling, and user-requested PDF export.

## Install on your Mac

```bash
git checkout feature/ios-stress-demo
git pull origin feature/ios-stress-demo
npm install
npm run typecheck
npx expo prebuild --clean
npx expo run:ios
```

**Requirements:** Xcode capable of building Expo SDK 57, valid iOS signing, and a compatible Apple developer team. Native code cannot run in Expo Go. The HealthKit capability must also be enabled for the bundle ID `com.superdotspals.wellnest` in Apple Developer.

This branch is not yet verified on a real iPhone. Check the compiler output and native permissions before shipping.

## Verify on physical iPhone + Apple Watch

1. Sign in, complete the new 15-screen onboarding, confirm Supabase profile is updated.
2. Open Settings → Superdot Voice and preview/select an Apple voice.
3. Open Health → Connect and sync. iOS should show Health permissions for HRV, resting HR, steps and sleep. No background sync is enabled yet: sync is manual.
4. Verify the Health and Today cards display **actual** Apple Health readings and correct timestamps. Denying permission must keep empty states.
5. Review 7-day and 30-day Trends. Mood uses recorded check-ins; health bars appear only where real data exists.
6. On Actions, open Hydration and Caffeine, add and subtract cups, visit previous days, verify Supabase persists.
7. Enter mood, energy, likely contributing factors and a journal note; confirm those appear in the Journal and AI context.
8. Try voice chat; the assistant should remain focused on wellness and not diagnose illnesses.
9. Settings → Notifications: enable a daily local reminder and check scheduling on device; disable and confirm removal.
10. Trends → Export wellness report: generate PDF and verify the iOS share sheet.
11. Test iPhone screen dimensions (including SE and larger iPhones), dark/system text scaling, scrolling, and orientation.

## Boundaries and remaining tasks

- **Native iOS compilation and on-device tests are required.** No simulator/device build was available to the assistant, so build success is not confirmed.
- Real Health data is synchronized only after a user taps Connect/Sync and authorizes HealthKit.
- Apple Health does not disclose all denied read permissions; an empty reading is not proof that access was granted.
- Automatic ongoing HealthKit delivery and direct WatchConnectivity communication are not enabled.
- App Store subscription products, trials, offers and a functioning paywall require Apple StoreKit / RevenueCat configuration and actual product IDs; they are **not** implemented.
- The original StressWatch app contains 229 replay screens. We modeled its major product flows with original Superdots branding; this is not an exact reproduction of all screens, proprietary artwork, watch faces, or commercial assets.
- Production release still requires an accessibility pass, crash testing, permission UX review, and a privacy-policy/App Store review of health-data handling.

Use this document as the release validation checklist. Do not treat the branch as production-ready until native build and device tests pass.
