import ExpoModulesCore

/// Runs before JavaScript loads, including background launches: the Watch can wake MoodPals to control
/// Screen Break, and a restarted iPhone restores enforcement from the saved deadline.
public final class WatchLinkAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    WatchLinkSession.shared.activate()
    ScreenBreakEngine.shared.reconcile()
    return true
  }

  public func applicationDidBecomeActive(_ application: UIApplication) {
    ScreenBreakEngine.shared.reconcile()
  }
}
