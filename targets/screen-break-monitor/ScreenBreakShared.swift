import Foundation
import FamilyControls
import DeviceActivity
import ManagedSettings

// Kept byte-identical in modules/watch-link/ios and targets/screen-break-monitor.
// The iPhone app and the Device Activity monitor extension share Screen Break state through the App Group.

/// A Screen Break session on this iPhone. The deadline is absolute and authoritative; nothing counts down in memory.
struct ScreenBreakSession: Codable, Equatable {
  var id: String
  var childId: String
  var childName: String
  var deviceId: String
  var startedAt: Date
  var deadline: Date
  var grantedSeconds: Int
  /// active | restricted | released | canceled
  var status: String
  /// deadline | end_now | canceled
  var endReason: String?
  var endedAt: Date?
  var version: Int
  var updatedAt: Date

  var isActive: Bool { status == "active" }
  var isRestricted: Bool { status == "restricted" }
}

enum ScreenBreakShared {
  static let appGroup = "group.com.superdotspals.wellnest"
  static let storeName = ManagedSettingsStore.Name("moodpals.screenBreak")
  static let activityName = DeviceActivityName("moodpals.screenBreak")
  static let sessionKey = "screenBreak.session"
  static let selectionKey = "screenBreak.selection"
  static let pendingSyncKey = "screenBreak.pendingSync"

  static var defaults: UserDefaults { UserDefaults(suiteName: appGroup) ?? .standard }

  static func loadSession() -> ScreenBreakSession? {
    guard let data = defaults.data(forKey: sessionKey) else { return nil }
    return try? JSONDecoder().decode(ScreenBreakSession.self, from: data)
  }

  static func saveSession(_ session: ScreenBreakSession?) {
    if let session, let data = try? JSONEncoder().encode(session) {
      defaults.set(data, forKey: sessionKey)
    } else {
      defaults.removeObject(forKey: sessionKey)
    }
  }

  /// Apps, categories and websites the parent chose. Apple's opaque tokens stay on this iPhone only.
  static func loadSelection() -> FamilyActivitySelection? {
    guard let data = defaults.data(forKey: selectionKey) else { return nil }
    return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  static func saveSelection(_ selection: FamilyActivitySelection) {
    if let data = try? JSONEncoder().encode(selection) { defaults.set(data, forKey: selectionKey) }
  }

  static func selectionCount(_ selection: FamilyActivitySelection?) -> Int {
    guard let selection else { return 0 }
    return selection.applicationTokens.count + selection.categoryTokens.count + selection.webDomainTokens.count
  }

  /// Session snapshots waiting to be saved to the parent's account (newest version per session).
  static func loadPendingSync() -> [ScreenBreakSession] {
    guard let data = defaults.data(forKey: pendingSyncKey) else { return [] }
    return (try? JSONDecoder().decode([ScreenBreakSession].self, from: data)) ?? []
  }

  static func savePendingSync(_ sessions: [ScreenBreakSession]) {
    if let data = try? JSONEncoder().encode(Array(sessions.suffix(100))) { defaults.set(data, forKey: pendingSyncKey) }
  }

  static func enqueueSync(_ session: ScreenBreakSession) {
    var list = loadPendingSync().filter { !($0.id == session.id && $0.version <= session.version) }
    if list.contains(where: { $0.id == session.id }) { return }
    list.append(session)
    savePendingSync(list)
  }

  /// Shields the chosen apps through MoodPals' own named store, so other Screen Time restrictions are untouched.
  static func applyShield() {
    let store = ManagedSettingsStore(named: storeName)
    guard let selection = loadSelection() else { return }
    store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
    store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
    store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
    store.shield.webDomainCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
  }

  /// Removes only the restrictions Screen Break added.
  static func clearShield() {
    ManagedSettingsStore(named: storeName).clearAllSettings()
  }

  /// Ends the allowed time of an active session whose deadline has passed and turns on the break.
  /// Returns the updated session when something changed.
  @discardableResult
  static func expireIfDue(now: Date = Date(), tolerance: TimeInterval = 0) -> ScreenBreakSession? {
    guard var session = loadSession(), session.isActive, now.addingTimeInterval(tolerance) >= session.deadline else { return nil }
    session.status = "restricted"
    session.endReason = "deadline"
    session.endedAt = session.deadline
    session.version += 1
    session.updatedAt = now
    applyShield()
    saveSession(session)
    enqueueSync(session)
    return session
  }
}
