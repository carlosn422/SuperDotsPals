module.exports = {
  type: 'watch',
  name: 'SuperdotsWatch',
  displayName: 'Superdots',
  bundleIdentifier: '.watchkitapp',
  deploymentTarget: '10.0',
  frameworks: ['SwiftUI', 'Security', 'WidgetKit'],
  entitlements: { 'com.apple.security.application-groups': ['group.com.superdotspals.wellnest.watch'] },
  icon: '../../assets/icon.png',
  infoPlist: { CFBundleIconName: 'AppIcon' },
};
