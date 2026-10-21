const { withInfoPlist, withXcodeProject } = require('@expo/config-plugins');

const share = 'MoodPals reads heart rate variability, heart rate, resting heart rate, sleep, activity, daylight, mindful minutes and noise levels to estimate your stress and energy.';
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
    const target = project.getFirstTarget();
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
    return c;
  });
};
