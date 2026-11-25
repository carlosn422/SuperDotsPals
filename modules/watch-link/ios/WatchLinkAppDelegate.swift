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
    if SatelliteLink.shared.isLinked { Task { _ = await SatelliteLink.shared.sync("launch") } }
    return true
  }

  public func applicationDidBecomeActive(_ application: UIApplication) {
    ScreenBreakEngine.shared.reconcile()
    if SatelliteLink.shared.isLinked { Task { _ = await SatelliteLink.shared.sync("active") } }
  }

  /// A family device is woken by a background push when the parent sends a command. The push is only a
  /// hint: commands stay stored on the server and also sync at launch, in the foreground and over Realtime.
  public func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    guard SatelliteLink.isSyncPush(userInfo), SatelliteLink.shared.isLinked else {
      completionHandler(.noData)
      return
    }
    Task {
      _ = await SatelliteLink.shared.sync("push")
      completionHandler(.newData)
    }
  }
}
