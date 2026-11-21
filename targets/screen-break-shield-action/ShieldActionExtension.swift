import Foundation
import ManagedSettings

/// Screen Break: "OK" closes the paused app; only the parent can lift the break, from MoodPals or the Watch.
/// The owner's daily limit: "Take a break" closes the app; "I need it today" lifts only the limit (never a Screen Break).
class ShieldActionExtension: ShieldActionDelegate {
  private func respond(_ action: ShieldAction, _ completionHandler: @escaping (ShieldActionResponse) -> Void) {
    guard action == .secondaryButtonPressed, let group = UserDefaults(suiteName: "group.com.superdotspals.wellnest") else {
      completionHandler(.close)
      return
    }
    let c = Calendar.current.dateComponents([.year, .month, .day], from: Date())
    group.set("\(c.year ?? 0)-\(c.month ?? 0)-\(c.day ?? 0)", forKey: "socialTrack.limitSkipDay")
    ManagedSettingsStore(named: ManagedSettingsStore.Name("moodpals.socialLimit")).clearAllSettings()
    completionHandler(.defer)
  }

  override func handle(action: ShieldAction, for application: ApplicationToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
    respond(action, completionHandler)
  }

  override func handle(action: ShieldAction, for webDomain: WebDomainToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
    respond(action, completionHandler)
  }

  override func handle(action: ShieldAction, for category: ActivityCategoryToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
    respond(action, completionHandler)
  }
}
