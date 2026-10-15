# Superdots Apple Watch

Native watchOS 10+ SwiftUI app. Uses the **same six mascot animation packs as the iPhone app** and the same authenticated Supabase user account.

## Setup and run on Apple Watch simulator

1. On macOS install Xcode (including a watchOS simulator) and XcodeGen:
   ```bash
   brew install xcodegen
   ```
2. Pull the latest branch and install the **six original mascot frame ZIPs** into the repository root (joy, sadness, anger, fear, disgust/calm, tired). The generated frame files are not automatically part of the GitHub checkout:
   ```bash
   git checkout feature/ios-stress-demo
   git pull origin feature/ios-stress-demo
   python3 scripts/install_mascot_animations.py
   ```
3. Generate and open the watch project:
   ```bash
   cd watchos
   xcodegen generate
   open SuperdotsWatch.xcodeproj
   ```
4. Select the **SuperdotsWatch** scheme and a watchOS simulator, then **Cmd+R**.
5. The watch displays **Link with iPhone** and a short-lived QR code. On your signed-in Superdots iPhone app, open **Settings → Connected Devices → Scan Apple Watch QR code** and scan. Confirm approval. The watch polls for approval and automatically signs in. The code expires after five minutes. Use a physical phone to scan the watch simulator if camera scanning isn't supported in an iOS simulator.
6. To build the iPhone QR scanner, run `npx expo install expo-camera` at the repository root to install the SDK-matched native dependency, then rebuild your iOS development app if necessary. The camera permission is configured in `app.json`. The native module isn't available in an old binary until rebuilt.

## Current features to test

- Home screen with actual iPhone mascot animations installed by the assets script.
- Mood check-in with six moods. Gemini generates questions through `spiritual-reading` Edge Function; each response is saved to the user's private `wellness_journal`. Finish to get a verified World English Bible verse and a reflection.
- Save a passage to Supabase favorites; open Favorites and verify it remains saved.
- Health snapshot for **recorded** HRV, resting heart rate, steps, and sleep. These must be synced to Supabase from the iPhone with Apple Health permissions and a native iOS development build. The watch never invents measurements.
- Quick journal with watchOS text entry (dictation depends on watch keyboard/input availability); saves to `wellness_journal`.
- Mood insights list from actual Supabase check-ins.
- Authenticated account sync via Supabase using tokens in watch Keychain.

## Suggested test sequence

1. Connect to Supabase and verify the watch displays the **same latest mood** recorded on the phone.
2. Choose Sad, answer the personalized questions, and confirm the verse and reflection load. Save the verse to Favorites; reopen Favorites to verify persistence.
3. Open the iPhone app, sync Apple Health from the Health tab, then return to watch and tap **Sync wellness now**. Compare HRV, resting heart rate, steps and sleep. Missing data should display **No data**, not fabricated values.
4. Record a new watch mood check-in and verify it appears in the iPhone mood history after refresh. Save a quick journal note and verify it in the iPhone app.
5. Open iPhone **Settings → Connected Devices**, disconnect the watch, then refresh the watch and verify it clears its local session. Try linking again with a new QR; old codes must not work.
6. Test with poor connectivity to inspect error feedback; Gemini can fall back to curated questions and Scripture, but authenticated Supabase connectivity is still required.

## Limitations

- These changes have been pushed but **not compiled or tested with Xcode or a physical Apple Watch** in this environment.
- The native watch app is standalone; it does **not** automatically install with the Expo iPhone app. A separate iOS/watchOS app-target integration and Apple Developer signing are needed for a paired production experience.
- Full lock-screen notifications, interactive watch-face complications and background syncing require additional **WidgetKit / UserNotifications / WatchConnectivity** work and are **not implemented**.
- The Health snapshot reflects iPhone-synced measurements, not live watch sensors. Sleep and steps refresh after the iPhone has synced them.
- The Scripture catalog currently contains six verified WEB passages, not the entire Bible.
- The watch uses QR approval to establish its own Supabase session. The phone lists linked watches, and a revoked link is checked by the watch on sync. Revocation is **not equivalent to immediate server-wide JWT invalidation**; existing access tokens can continue working until expiry. Before production, enforce revoked device sessions in server-side authorization and add anti-abuse rate limiting for pairing requests.
- Device scans require a camera-enabled iPhone; Apple Watch Simulator is display-only. QR scan with a real iPhone or watch hardware.
