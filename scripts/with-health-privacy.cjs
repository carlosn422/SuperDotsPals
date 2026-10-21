const { withInfoPlist, withXcodeProject } = require('@expo/config-plugins');

const share = 'Superdots reads heart rate variability, resting heart rate, steps, and sleep to provide wellness insights when you grant access.';
const update = 'Superdots integrates with Apple Health to support wellness features. The app currently reads health data and does not modify health records.';

module.exports = function withHealthPrivacy(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.NSHealthShareUsageDescription = share;
    c.modResults.NSHealthUpdateUsageDescription = update;
    return c;
  });
  return withXcodeProject(config, (c) => {
    // Also set generated Info.plist keys at the iOS app target build-setting level.
    // This covers Xcode projects where the effective plist is generated at build time.
    const project = c.modResults;
    const configs = project.pbxXCBuildConfigurationSection();
    for (const entry of Object.values(configs)) {
      if (!entry || typeof entry !== 'object' || !entry.buildSettings) continue;
      const settings = entry.buildSettings;
      // Restrict the settings to the main iPhone app target configurations.
      if (typeof settings.PRODUCT_BUNDLE_IDENTIFIER !== 'string' ||
          !settings.PRODUCT_BUNDLE_IDENTIFIER.includes('com.superdotspals.wellnest') ||
          settings.PRODUCT_BUNDLE_IDENTIFIER.includes('watchkitapp')) continue;
      settings.INFOPLIST_KEY_NSHealthShareUsageDescription = JSON.stringify(share);
      settings.INFOPLIST_KEY_NSHealthUpdateUsageDescription = JSON.stringify(update);
    }
    // Set watch icon metadata at native project generation time. This is the
    // build phase EAS actually runs AFTER the post-install script.
    for (const entry of Object.values(configs)) {
      if (!entry || typeof entry !== 'object' || !entry.buildSettings) continue;
      const settings = entry.buildSettings;
      const bundle = String(settings.PRODUCT_BUNDLE_IDENTIFIER || '');
      if (!bundle.includes('com.superdotspals.wellnest.watchkitapp')) continue;
      settings.ASSETCATALOG_COMPILER_APPICON_NAME = 'AppIcon';
      settings.INFOPLIST_KEY_CFBundleIconName = 'AppIcon';
    }
    return c;
  });
};
