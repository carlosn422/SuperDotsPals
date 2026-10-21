module.exports = {
  type: 'watch-widget',
  name: 'MoodPalsStressComplication',
  displayName: 'MoodPals Stress',
  bundleIdentifier: '.watchkitapp.stresscomplication',
  deploymentTarget: '10.0',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.superdotspals.wellnest.watch'],
  },
};
