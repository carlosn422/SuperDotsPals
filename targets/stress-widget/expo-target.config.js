/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'MoodPalsStressWidget',
  displayName: 'MoodPals Stress',
  bundleIdentifier: '.stresswidget',
  deploymentTarget: '17.0',
  colors: { $accent: '#34B37E', $widgetBackground: '#E4F6EA' },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
