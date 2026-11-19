/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'device-activity-monitor',
  name: 'MoodPalsScreenBreakMonitor',
  displayName: 'MoodPals Screen Break',
  bundleIdentifier: '.screenbreak.monitor',
  deploymentTarget: '16.4',
  frameworks: ['DeviceActivity', 'FamilyControls', 'ManagedSettings'],
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
