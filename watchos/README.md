# Superdots Apple Watch (native SwiftUI)

This folder contains a **separate watchOS 10+ app**, independent of the existing Expo/React Native iPhone code.

## Build and run

Prerequisites: macOS, Xcode with watchOS simulator installed, and [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```bash
brew install xcodegen
cd watchos
xcodegen generate
open SuperdotsWatch.xcodeproj
```

Select the **SuperdotsWatch** scheme and an Apple Watch simulator, then press Cmd+R.

The Xcode project file is generated from `project.yml` so it doesn't need to be maintained by hand. If Xcode reports signing errors for the simulator, turn off automatic signing for that local simulator build or configure your development team. For physical-device builds, use an Apple Developer signing team.

## Implemented in watchOS

- Watch-sized dashboard with fictional HRV, resting heart rate and stress
- Five distinct original companion illustrations and persistent local theme selection
- Hourly sample HRV chart using Swift Charts
- Calm, box and unwind 1-minute breathing routines with start, pause and reset

## Important limitations

- All health readings are sample values, not live Apple Health readings.
- The watch app currently operates **standalone** and does not share sessions, onboarding state or authentication with the iPhone or Supabase.
- HealthKit, WatchConnectivity, background delivery and WidgetKit complications remain future integrations.
- No claim of clinical stress measurement is made. No simulator or Xcode build has been run yet.

## Next phase

Add HealthKit authorization and explicit user consent; implement an iOS native bridge for WatchConnectivity to synchronize the selected mascot and sign-in state; choose a secure watch authentication model; then add watch complications as a WidgetKit extension.
