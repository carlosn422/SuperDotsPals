/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
// Device Activity Report is an ExtensionKit extension. apple-targets has no dedicated type for it, so this
// uses its ExtensionKit type ('app-intent') and the committed Info.plist sets the report extension point.
module.exports = (config) => ({
  type: 'app-intent',
  name: 'MoodPalsScreenTimeReport',
  displayName: 'MoodPals Screen Time',
  bundleIdentifier: '.screentime.report',
  deploymentTarget: '16.4',
  frameworks: ['DeviceActivity', 'SwiftUI'],
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
