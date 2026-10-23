/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = {
  type: 'watch',
  name: 'SuperdotsWatch',
  displayName: 'MoodPals',
  // Keep the watch app embedded in the existing MoodPals iOS bundle.
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
  // Keep Info.plist in sync: apple-targets preserves the existing file as-is.
  // Independent install does not remove the iPhone companion relationship.
  infoPlist: {
    CFBundleIconName: 'AppIcon',
    WKRunsIndependentlyOfCompanionApp: true,
  },
};
