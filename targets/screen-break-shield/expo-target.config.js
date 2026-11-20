/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'shield-config',
  name: 'MoodPalsScreenBreakShield',
  displayName: 'MoodPals Screen Break',
  bundleIdentifier: '.screenbreakshield',
  deploymentTarget: '16.4',
  frameworks: ['ManagedSettings', 'ManagedSettingsUI'],
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
