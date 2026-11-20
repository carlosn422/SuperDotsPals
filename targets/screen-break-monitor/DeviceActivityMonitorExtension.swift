import DeviceActivity
import Foundation

/// Turns Screen Break on at the session deadline while MoodPals is closed.
/// The schedule's end is the deadline; ScreenBreakShared re-checks the saved session so a stopped or
/// replaced schedule never shields early.
class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    guard activity == ScreenBreakShared.activityName else { return }
    // iOS may call slightly before the exact second.
    ScreenBreakShared.expireIfDue(tolerance: 30)
  }

  override func intervalDidStart(for activity: DeviceActivityName) {
    super.intervalDidStart(for: activity)
    guard activity == ScreenBreakShared.activityName else { return }
    // Already past the deadline (late callback after a restart): turn the break on now.
    ScreenBreakShared.expireIfDue()
  }
}
