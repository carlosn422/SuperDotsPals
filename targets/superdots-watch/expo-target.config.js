/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = {
  type: 'watch',
  name: 'SuperdotsWatch',
  displayName: 'MoodPals',
  bundleIdentifier: '.watchkitapp',
  deploymentTarget: '10.0',
  frameworks: ['SwiftUI', 'Security', 'HealthKit', 'WidgetKit', 'WatchConnectivity'],
  entitlements: {
    'com.apple.developer.healthkit': true,
    'com.apple.developer.healthkit.access': [],
    'com.apple.developer.healthkit.background-delivery': true,
    // Shared with the MoodPalsStressComplication watch-face widget.
    'com.apple.security.application-groups': ['group.com.superdotspals.wellnest.watch'],
  },
  // Health usage strings and WKBackgroundModes live in Info.plist (apple-targets keeps an existing Info.plist as-is).
  infoPlist: { CFBundleIconName: 'AppIcon' },
};
