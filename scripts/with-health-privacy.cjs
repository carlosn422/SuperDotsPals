const { withInfoPlist } = require('@expo/config-plugins');

// Force the native iOS Info.plist to include HealthKit purpose strings even
// when other config plugins alter permissions during prebuild.
module.exports = function withHealthPrivacy(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSHealthShareUsageDescription =
      'Superdots reads heart rate variability, resting heart rate, steps, and sleep to provide wellness insights when you grant access.';
    config.modResults.NSHealthUpdateUsageDescription =
      'Superdots uses Apple Health integration for wellness features. Superdots currently reads health information and does not add or change health records.';
    return config;
  });
};
