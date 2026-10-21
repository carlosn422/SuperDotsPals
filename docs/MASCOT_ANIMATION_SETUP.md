# Animated mood mascots

The phone and watch now share the same five mood states:

| Mood | Character |
|---|---|
| happy, excited, good | Joy |
| sad, down, tired | Sadness |
| frustrated, angry | Anger |
| anxious, stressed, overwhelmed | Fear |
| calm, neutral, okay, or no check-in | Calm (green, stored internally as disgust) |

The uploaded animation archives are not stored as binaries in GitHub yet. Until installed, the iPhone falls back to its existing mascot image and watchOS shows a simple placeholder.

## Install full-resolution animations

Download the companion ZIP from the conversation and extract the five `*_mascot_animation_frames.zip` files into the repo root.

```bash
git checkout feature/ios-stress-demo
git pull origin feature/ios-stress-demo
python3 scripts/install_mascot_animations.py .
npm run typecheck
npx expo start --clear
```

The installer writes 180 iPhone PNG files under `assets/mascot-animations`, 180 watchOS frames in `watchos/SuperdotsWatch/AnimationFrames.xcassets`, and generates `MascotAnimationAssets.ts` with static Metro-compatible `require()` calls.

To **persist** the assets in GitHub, run:

```bash
git add MascotAnimationAssets.ts assets/mascot-animations watchos/SuperdotsWatch/AnimationFrames.xcassets
git commit -m "Add full-resolution animated Superdots mascot assets"
git push origin feature/ios-stress-demo
```

For watchOS, regenerate the Xcode project from `watchos/project.yml` with XcodeGen and rebuild. Watch animation uses TimelineView at 12 FPS and pauses when inactive or Reduce Motion is enabled. Mood sync requires a signed-in watch account and a user mood entry in Supabase.

These changes have not been validated in an iOS simulator or on a real Apple Watch yet.
