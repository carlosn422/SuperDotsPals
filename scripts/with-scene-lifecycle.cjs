// iOS 27 SDK apps must use the UIScene life cycle. Expo 57 ships ExpoAppSceneDelegate (objc name
// EXExpoAppSceneDelegate), but the generated AppDelegate still creates its own window. This plugin:
// 1. declares the scene delegate in Info.plist, and
// 2. makes AppDelegate an ExpoReactNativeFactoryProvider that only creates the React Native factory;
//    the scene delegate creates the window and starts React Native into it.
const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: 'EXExpoAppSceneDelegate' },
        ],
      },
    };
    return c;
  });
  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') throw new Error('with-scene-lifecycle expects a Swift AppDelegate');
    let src = c.modResults.contents;
    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      src = src.replace(/class AppDelegate: ExpoAppDelegate\s*\{/, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    }
    const start = /window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*factory\.startReactNative\(\s*withModuleName: "main",\s*in: window,\s*launchOptions: launchOptions\)/;
    if (start.test(src)) {
      src = src.replace(start, '// The window and React Native start in ExpoAppSceneDelegate (UIScene life cycle).');
    }
    if (!src.includes('ExpoReactNativeFactoryProvider {') || start.test(src)) {
      throw new Error('with-scene-lifecycle could not update AppDelegate.swift; check the Expo template');
    }
    c.modResults.contents = src;
    return c;
  });
};
