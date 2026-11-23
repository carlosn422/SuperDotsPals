import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings

// Kept byte-identical in modules/watch-link/ios and targets/screen-break-monitor.
// The owner's own app tracking: Apple only reports "this app reached N minutes today", so the monitor
// extension records a timestamp every 15 minutes of use per app. MoodPals matches those against HRV and moods.
// Every 5 minutes of all chosen apps together is also added to a daily total for whoever was using the iPhone:
// the owner, or the family member whose Screen Break timer was running. Only the owner's total counts toward the limit.

/// One "app reached `minutes` today at `at`" event. `app` indexes `SocialTrackShared.orderedApps()`; -1 is the
/// chosen categories and websites as one group.
struct SocialMark: Codable, Equatable {
  let app: Int
  let minutes: Int
  let at: Date
  /// Reached while a family member's Screen Break timer ran: counted as theirs, not the owner's.
  var family: Bool? = nil
  /// That family member's id.
  var member: String? = nil
}

enum SocialTrackShared {
  static let activityName = DeviceActivityName("moodpals.socialTrack")
  static let storeName = ManagedSettingsStore.Name("moodpals.socialLimit")
  static let selectionKey = "socialTrack.selection"
  static let appsKey = "socialTrack.apps"
  static let enabledKey = "socialTrack.enabled"
  static let limitKey = "socialTrack.limitMinutes"
  static let marksKey = "socialTrack.marks"
  static let limitHitKey = "socialTrack.limitHitDay"
  static let limitSkipKey = "socialTrack.limitSkipDay"
  static let startedKey = "socialTrack.startedAt"
  static let dailyKey = "socialTrack.daily"
  /// "y-m-d|minutes": the last 5-minute total the current schedule reported today.
  static let totalLastKey = "socialTrack.totalLast"
  /// Bumped when the schedule's events change, so MoodPals restarts an older schedule on launch.
  static let scheduleVersionKey = "socialTrack.scheduleVersion"
  static let scheduleVersion = 2
  /// Daily totals use this key for the owner; family members use their id.
  static let ownerKey = "you"
  static let step = 15
  static let maxMarks = 16
  static let maxApps = 12
  static let totalStep = 5
  /// 12 hours of 5-minute steps.
  static let maxTotalMarks = 144
  static let keepDays = 400

  static var defaults: UserDefaults { UserDefaults(suiteName: "group.com.superdotspals.wellnest") ?? .standard }

  static func loadSelection() -> FamilyActivitySelection? {
    guard let data = defaults.data(forKey: selectionKey) else { return nil }
    return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  /// Saves the selection and a stable app order, so mark indexes keep meaning the same app.
  static func saveSelection(_ selection: FamilyActivitySelection) {
    guard let data = try? JSONEncoder().encode(selection) else { return }
    defaults.set(data, forKey: selectionKey)
    var order = orderedApps()
    for token in selection.applicationTokens where !order.contains(token) { order.append(token) }
    if let encoded = try? JSONEncoder().encode(order) { defaults.set(encoded, forKey: appsKey) }
  }

  /// Every app ever chosen, in the order first chosen. Removed apps keep their index so old marks stay correct.
  static func orderedApps() -> [ApplicationToken] {
    guard let data = defaults.data(forKey: appsKey) else { return [] }
    return (try? JSONDecoder().decode([ApplicationToken].self, from: data)) ?? []
  }

  static var enabled: Bool { defaults.bool(forKey: enabledKey) }
  static var limitMinutes: Int { defaults.integer(forKey: limitKey) }

  /// Screen Time & Stress shares the 14-day Screen Break trial, cached by MoodPals under screenBreak.entitlement.
  /// No cache yet means MoodPals hasn't synced, so tracking keeps working until it does.
  static func trialAllows(now: Date = Date()) -> Bool {
    guard let data = defaults.data(forKey: "screenBreak.entitlement"),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return true }
    if json["hasPlus"] as? Bool == true || json["trialAvailable"] as? Bool == true { return true }
    guard let ends = json["trialEndsAt"] as? Double else { return false }
    return Date(timeIntervalSinceReferenceDate: ends) > now
  }

  static func today(_ date: Date = Date()) -> String {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return "\(c.year ?? 0)-\(c.month ?? 0)-\(c.day ?? 0)"
  }

  static var limitHitToday: Bool { defaults.string(forKey: limitHitKey) == today() && defaults.string(forKey: limitSkipKey) != today() }

  static func start() throws {
    let center = DeviceActivityCenter()
    center.stopMonitoring([activityName])
    // The shield follows the new choice and limit: removed apps unlock, and it returns if the owner is still over.
    clearLimit()
    guard enabled, let selection = loadSelection() else { return }
    let order = orderedApps()
    var events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]
    // Each app gets its own 15-minute marks; capped so the schedule stays a reasonable size.
    let tracked = order.enumerated().filter { selection.applicationTokens.contains($0.element) }.prefix(maxApps)
    for (i, token) in tracked {
      for k in 1...maxMarks {
        events[.init("a.\(i).\(k)")] = event(apps: [token], minutes: k * step)
      }
    }
    if !selection.categoryTokens.isEmpty || !selection.webDomainTokens.isEmpty {
      for k in 1...maxMarks {
        events[.init("a.-1.\(k)")] = event(categories: selection.categoryTokens, webDomains: selection.webDomainTokens, minutes: k * step)
      }
    }
    // All chosen apps together, in 5-minute steps: the daily totals and the shared limit.
    let chosen = selection.applicationTokens.count + selection.categoryTokens.count + selection.webDomainTokens.count
    if chosen > 0 {
      for k in 1...maxTotalMarks {
        events[.init("t.\(k)")] = event(apps: selection.applicationTokens, categories: selection.categoryTokens,
                                        webDomains: selection.webDomainTokens, minutes: k * totalStep)
      }
    }
    guard !events.isEmpty else { return }
    let day = DeviceActivitySchedule(intervalStart: DateComponents(hour: 0, minute: 0),
                                     intervalEnd: DateComponents(hour: 23, minute: 59, second: 59), repeats: true)
    defaults.set(Date().timeIntervalSince1970, forKey: startedKey)
    // A new schedule counts its own total from zero (for the apps chosen now).
    defaults.set("\(today())|0", forKey: totalLastKey)
    try center.startMonitoring(activityName, during: day, events: events)
    defaults.set(scheduleVersion, forKey: scheduleVersionKey)
    checkLimit()
  }

  /// Counts today's use from before monitoring (re)started (iOS 17.4+), so editing apps, changing the limit
  /// or reinstalling doesn't reset the day.
  private static func event(apps: Set<ApplicationToken> = [], categories: Set<ActivityCategoryToken> = [],
                            webDomains: Set<WebDomainToken> = [], minutes: Int) -> DeviceActivityEvent {
    let threshold = DateComponents(minute: minutes)
    if #available(iOS 17.4, *) {
      return DeviceActivityEvent(applications: apps, categories: categories, webDomains: webDomains,
                                 threshold: threshold, includesPastActivity: true)
    }
    return DeviceActivityEvent(applications: apps, categories: categories, webDomains: webDomains, threshold: threshold)
  }

  /// Restarts a schedule made by an older MoodPals (for example, one without the 5-minute totals).
  static func migrateIfNeeded() {
    guard enabled, defaults.integer(forKey: scheduleVersionKey) < scheduleVersion else { return }
    try? start()
  }

  static func stop() {
    DeviceActivityCenter().stopMonitoring([activityName])
    clearLimit()
  }

  static func loadMarks() -> [SocialMark] {
    guard let data = defaults.data(forKey: marksKey) else { return [] }
    return (try? JSONDecoder().decode([SocialMark].self, from: data)) ?? []
  }

  /// Called by the monitor extension. Time while a family member's Screen Break timer runs isn't the owner's.
  static func record(_ event: DeviceActivityEvent.Name, now: Date = Date()) {
    // After the trial, the next usage callback also lifts a limit screen that was already up.
    guard trialAllows(now: now) else { clearLimit(); return }
    let parts = event.rawValue.split(separator: ".")
    if parts.count == 2, parts[0] == "t", let k = Int(parts[1]) {
      addTotal(k * totalStep, now: now)
      checkLimit(now: now)
      return
    }
    checkLimit(now: now)
    guard parts.count == 3, parts[0] == "a", let app = Int(parts[1]), let k = Int(parts[2]) else { return }
    // iOS sometimes fires thresholds early; a mark can't be more minutes than have passed today.
    let sinceMidnight = now.timeIntervalSince(Calendar.current.startOfDay(for: now))
    guard Double(k * step * 60) <= sinceMidnight + 60 else { return }
    var marks = loadMarks()
    // Restarting replays marks already passed today; they'd carry the wrong time, so keep only new ones.
    let dayStart = Calendar.current.startOfDay(for: now)
    if marks.contains(where: { $0.app == app && $0.minutes == k * step && $0.at >= dayStart }) { return }
    if now.timeIntervalSince1970 - defaults.double(forKey: startedKey) < 120 { return }
    let member = runningMember()
    marks.append(SocialMark(app: app, minutes: k * step, at: now, family: member == nil ? nil : true, member: member))
    if let data = try? JSONEncoder().encode(Array(marks.suffix(8000))) { defaults.set(data, forKey: marksKey) }
  }

  /// Minutes per person per day ("y-m-d" -> ["you" or member id: minutes]).
  static func loadDaily() -> [String: [String: Int]] {
    guard let data = defaults.data(forKey: dailyKey) else { return [:] }
    return (try? JSONDecoder().decode([String: [String: Int]].self, from: data)) ?? [:]
  }

  /// `minutes` is today's running total for the apps chosen now; the step since the schedule's last total goes to whoever
  /// is using the iPhone. Right after a restart iOS replays totals already counted, so those only move the baseline.
  private static func addTotal(_ minutes: Int, now: Date) {
    let key = today(now)
    let saved = (defaults.string(forKey: totalLastKey) ?? "").split(separator: "|")
    let last = saved.count == 2 && saved[0] == key ? Int(saved[1]) ?? 0 : 0
    guard minutes > last else { return }
    defaults.set("\(key)|\(minutes)", forKey: totalLastKey)
    if now.timeIntervalSince1970 - defaults.double(forKey: startedKey) < 120 { return }
    var daily = loadDaily()
    var day = daily[key] ?? [:]
    let who = runningMember() ?? ownerKey
    day[who, default: 0] += minutes - last
    daily[key] = day
    if daily.count > keepDays {
      let cutoff = Calendar.current.date(byAdding: .day, value: -keepDays, to: now) ?? now
      daily = daily.filter { k, _ in dayDate(k).map { $0 >= cutoff } ?? false }
    }
    if let data = try? JSONEncoder().encode(daily) { defaults.set(data, forKey: dailyKey) }
  }

  private static func dayDate(_ key: String) -> Date? {
    let p = key.split(separator: "-").compactMap { Int($0) }
    guard p.count == 3 else { return nil }
    return Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
  }

  static func ownerMinutesToday(now: Date = Date()) -> Int { loadDaily()[today(now)]?[ownerKey] ?? 0 }

  /// Shows the limit screen once the owner's own time today reaches the limit. A family member's timer time
  /// never counts, and during their timer the limit waits (the iPhone is theirs until it ends).
  static func checkLimit(now: Date = Date()) {
    guard enabled, limitMinutes > 0, trialAllows(now: now), defaults.string(forKey: limitSkipKey) != today(now),
          runningMember() == nil, ownerMinutesToday(now: now) >= limitMinutes, let selection = loadSelection() else { return }
    defaults.set(today(now), forKey: limitHitKey)
    let store = ManagedSettingsStore(named: storeName)
    store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
    store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
    store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
  }

  /// A family member's timer starts: the owner's limit screen steps aside until it ends (checkLimit puts it back).
  static func liftForMember() {
    ManagedSettingsStore(named: storeName).clearAllSettings()
  }

  /// "I need it today" on the limit screen; the limit returns at midnight.
  static func skipToday() {
    defaults.set(today(), forKey: limitSkipKey)
    ManagedSettingsStore(named: storeName).clearAllSettings()
  }

  static func clearLimit() {
    defaults.removeObject(forKey: limitHitKey)
    ManagedSettingsStore(named: storeName).clearAllSettings()
  }

  /// The family member whose Screen Break timer is running, if any.
  private static func runningMember() -> String? {
    guard let data = defaults.data(forKey: "screenBreak.session"),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          json["status"] as? String == "active" else { return nil }
    return json["childId"] as? String ?? "family"
  }
}
