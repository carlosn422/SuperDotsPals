import Foundation
import FamilyControls
import DeviceActivity
import ManagedSettings
import UserNotifications

struct ScreenBreakChild: Codable, Equatable {
  var id: String
  var name: String
}

/// Cached on this iPhone so Screen Break keeps working offline and when the Watch starts a session
/// while MoodPals isn't running. The server stays authoritative and refreshes it on every sync.
struct ScreenBreakEntitlement: Codable, Equatable {
  var hasPlus: Bool
  var trialAvailable: Bool
  var trialStartedAt: Date?
  var trialEndsAt: Date?
  var checkedAt: Date

  func allows(at now: Date) -> Bool {
    hasPlus || trialAvailable || (trialEndsAt.map { $0 > now } ?? false)
  }
}

private struct ScreenBreakCommandRecord: Codable {
  var id: String
  var ok: Bool
  var error: String?
  var code: String?
  var at: Date
}

struct ScreenBreakError: Error {
  let code: String
  let message: String
}

/// Runs Screen Break on the controlling iPhone: one session at a time, enforced by DeviceActivity and
/// ManagedSettings with an absolute deadline, so it keeps working while MoodPals and the Watch app are closed.
/// Commands come from the MoodPals UI and from the parent's Apple Watch, each with a unique command id.
final class ScreenBreakEngine {
  static let shared = ScreenBreakEngine()

  /// Fired on the main queue with the latest state whenever it changes.
  var onChange: (([String: Any]) -> Void)?

  private let queue = DispatchQueue(label: "com.superdotspals.screenBreak")
  private var timer: DispatchSourceTimer?
  private let childrenKey = "screenBreak.children"
  private let entitlementKey = "screenBreak.entitlement"
  private let commandsKey = "screenBreak.commands"
  private let deviceKey = "screenBreak.deviceId"
  private let warnId = "moodpals.screenBreak.warning"
  private let endId = "moodpals.screenBreak.ended"
  static let minMinutes = 1
  static let maxMinutes = 720
  static let addTimeOptions = [5, 10, 15, 30]
  static let remindOnPhone = false

  private var defaults: UserDefaults { ScreenBreakShared.defaults }

  var deviceId: String {
    if let id = defaults.string(forKey: deviceKey) { return id }
    let id = UUID().uuidString.lowercased()
    defaults.set(id, forKey: deviceKey)
    return id
  }

  var authorized: Bool { AuthorizationCenter.shared.authorizationStatus == .approved }

  // MARK: Public API (thread-safe)

  func state() -> [String: Any] {
    queue.sync {
      reconcileLocked()
      return stateLocked()
    }
  }

  func reconcile() {
    queue.async { self.reconcileLocked() }
  }

  /// `action`: state | start | addTime | endNow | cancel | release.
  /// Fields: commandId, childId, minutes, sessionId, expectedVersion.
  func handle(_ command: [String: Any]) -> [String: Any] {
    queue.sync { handleLocked(command) }
  }

  func setChildren(_ list: [[String: Any]]) {
    queue.sync {
      let children = list.compactMap { item -> ScreenBreakChild? in
        guard let id = item["id"] as? String, let name = item["name"] as? String, !id.isEmpty else { return nil }
        return ScreenBreakChild(id: id, name: String(name.prefix(40)))
      }
      guard children != loadChildren() else { return }
      if let data = try? JSONEncoder().encode(children) { defaults.set(data, forKey: childrenKey) }
      notifyLocked()
    }
  }

  func setEntitlement(_ dict: [String: Any]) {
    queue.sync {
      let date: (String) -> Date? = { key in (dict[key] as? Double).flatMap { $0 > 0 ? Date(timeIntervalSince1970: $0) : nil } }
      let next = ScreenBreakEntitlement(
        hasPlus: dict["hasPlus"] as? Bool ?? false,
        trialAvailable: dict["trialAvailable"] as? Bool ?? false,
        trialStartedAt: date("trialStartedAt"),
        trialEndsAt: date("trialEndsAt"),
        checkedAt: Date())
      let previous = loadEntitlement()
      if let data = try? JSONEncoder().encode(next) { defaults.set(data, forKey: entitlementKey) }
      // Only a real change is pushed to the Watch and the UI (every sync refreshes checkedAt).
      var unchanged = next
      unchanged.checkedAt = previous?.checkedAt ?? next.checkedAt
      if unchanged != previous { notifyLocked() }
    }
  }

  func selectionChanged() {
    queue.async {
      // A running break picks up the new app list immediately.
      if ScreenBreakShared.loadSession()?.isRestricted == true { ScreenBreakShared.applyShield() }
      self.notifyLocked()
    }
  }

  /// Snapshots for the server, in the `screen_break_sync` format.
  func pendingSync() -> [[String: Any]] {
    queue.sync {
      let iso = ISO8601DateFormatter()
      return ScreenBreakShared.loadPendingSync().map { s in
        var row: [String: Any] = [
          "id": s.id, "child_id": s.childId, "device_id": s.deviceId,
          "started_at": iso.string(from: s.startedAt), "deadline_at": iso.string(from: s.deadline),
          "granted_seconds": s.grantedSeconds, "status": s.status, "version": s.version,
        ]
        if let ended = s.endedAt { row["ended_at"] = iso.string(from: ended) }
        if let reason = s.endReason { row["end_reason"] = reason }
        return row
      }
    }
  }

  /// Drops synced snapshots (session id -> saved version).
  func ackSync(_ saved: [String: Int]) {
    queue.sync {
      let left = ScreenBreakShared.loadPendingSync().filter { s in
        guard let version = saved[s.id] else { return true }
        return s.version > version
      }
      ScreenBreakShared.savePendingSync(left)
    }
  }

  // MARK: Commands

  private func handleLocked(_ command: [String: Any]) -> [String: Any] {
    reconcileLocked()
    let action = command["action"] as? String ?? "state"
    let commandId = command["commandId"] as? String ?? ""
    if action == "state" { return result(commandId: commandId, error: nil) }
    guard !commandId.isEmpty else {
      return result(commandId: commandId, error: ScreenBreakError(code: "invalid", message: "Missing command id."))
    }
    var records = loadCommands()
    // A retried command (same id) is answered with its original outcome and never runs twice.
    if let previous = records.first(where: { $0.id == commandId }) {
      return result(commandId: commandId, error: previous.ok ? nil : ScreenBreakError(code: previous.code ?? "failed", message: previous.error ?? "Failed."))
    }
    var failure: ScreenBreakError?
    do {
      switch action {
      case "start": try start(command)
      case "addTime": try addTime(command)
      case "endNow": try endNow(command)
      case "cancel": try cancel(command)
      case "release": try release(command)
      default: throw ScreenBreakError(code: "invalid", message: "Unknown command.")
      }
    } catch let error as ScreenBreakError {
      failure = error
    } catch {
      failure = ScreenBreakError(code: "failed", message: error.localizedDescription)
    }
    records.append(ScreenBreakCommandRecord(id: commandId, ok: failure == nil, error: failure?.message, code: failure?.code, at: Date()))
    saveCommands(Array(records.suffix(60)))
    if failure == nil { notifyLocked() }
    return result(commandId: commandId, error: failure)
  }

  private func result(commandId: String, error: ScreenBreakError?) -> [String: Any] {
    var reply: [String: Any] = ["ok": error == nil, "commandId": commandId, "state": stateLocked()]
    if let error {
      reply["error"] = error.message
      reply["code"] = error.code
    }
    return reply
  }

  private func requireCurrent(_ command: [String: Any]) throws -> ScreenBreakSession {
    guard let session = ScreenBreakShared.loadSession() else {
      throw ScreenBreakError(code: "stale", message: "There's no Screen Break running.")
    }
    if let id = command["sessionId"] as? String, !id.isEmpty, id != session.id {
      throw ScreenBreakError(code: "stale", message: "This Screen Break already ended. Showing the latest one.")
    }
    if let version = (command["expectedVersion"] as? NSNumber)?.intValue, version != session.version {
      throw ScreenBreakError(code: "stale", message: "Screen Break changed on another device. Showing the latest.")
    }
    return session
  }

  private func start(_ command: [String: Any]) throws {
    guard authorized else {
      throw ScreenBreakError(code: "permission", message: "Allow Screen Time access in MoodPals on your iPhone first.")
    }
    guard ScreenBreakShared.selectionCount(ScreenBreakShared.loadSelection()) > 0 else {
      throw ScreenBreakError(code: "noSelection", message: "Choose the apps to pause in MoodPals on your iPhone first.")
    }
    guard let childId = command["childId"] as? String, let child = loadChildren().first(where: { $0.id == childId }) else {
      throw ScreenBreakError(code: "noChild", message: "Choose a child in MoodPals on your iPhone.")
    }
    let minutes = (command["minutes"] as? NSNumber)?.intValue ?? 0
    guard (Self.minMinutes...Self.maxMinutes).contains(minutes) else {
      throw ScreenBreakError(code: "invalid", message: "Choose between 1 minute and 12 hours.")
    }
    if let current = ScreenBreakShared.loadSession(), current.isActive {
      throw ScreenBreakError(code: "busy", message: "\(current.childName)'s Screen Break is already running on this iPhone.")
    }
    let now = Date()
    guard var entitlement = loadEntitlement() else {
      throw ScreenBreakError(code: "entitlement", message: "Open MoodPals on your iPhone once while online, then try again.")
    }
    guard entitlement.allows(at: now) else {
      throw ScreenBreakError(code: "plus", message: "Your 14-day Screen Break trial has ended. MoodPals Plus keeps Screen Break on.")
    }
    var session = ScreenBreakSession(
      id: UUID().uuidString.lowercased(), childId: child.id, childName: child.name, deviceId: deviceId,
      startedAt: now, deadline: now.addingTimeInterval(TimeInterval(minutes * 60)), grantedSeconds: minutes * 60,
      status: "active", endReason: nil, endedAt: nil, version: 1, updatedAt: now)
    try schedule(session)
    // Starting while a finished break is still on replaces it: the old break is released.
    if var previous = ScreenBreakShared.loadSession(), previous.isRestricted {
      previous.status = "released"
      previous.version += 1
      previous.updatedAt = now
      ScreenBreakShared.enqueueSync(previous)
    }
    ScreenBreakShared.clearShield()
    session.updatedAt = now
    ScreenBreakShared.saveSession(session)
    ScreenBreakShared.enqueueSync(session)
    scheduleNotifications(session)
    if !entitlement.hasPlus && entitlement.trialAvailable {
      // Provisional until the server confirms the trial start on the next sync.
      entitlement.trialAvailable = false
      entitlement.trialStartedAt = now
      entitlement.trialEndsAt = now.addingTimeInterval(336 * 3600)
      if let data = try? JSONEncoder().encode(entitlement) { defaults.set(data, forKey: entitlementKey) }
    }
    armTimer(session)
  }

  private func addTime(_ command: [String: Any]) throws {
    var session = try requireCurrent(command)
    // Time can be added while running, or after time is up (the pause lifts until the new deadline).
    guard session.isActive || session.isRestricted else {
      throw ScreenBreakError(code: "stale", message: "Screen time already ended. Start a new session to give more time.")
    }
    let minutes = (command["minutes"] as? NSNumber)?.intValue ?? 0
    guard Self.addTimeOptions.contains(minutes) || (Self.minMinutes...120).contains(minutes) else {
      throw ScreenBreakError(code: "invalid", message: "Choose how much time to add.")
    }
    let now = Date()
    let deadline = max(session.deadline, now).addingTimeInterval(TimeInterval(minutes * 60))
    guard deadline.timeIntervalSince(session.startedAt) <= TimeInterval(24 * 3600) else {
      throw ScreenBreakError(code: "invalid", message: "A session can last up to 24 hours.")
    }
    var next = session
    if session.isRestricted {
      next.status = "active"
      next.endReason = nil
      next.endedAt = nil
    }
    next.deadline = deadline
    next.grantedSeconds = Int(deadline.timeIntervalSince(session.startedAt).rounded())
    next.version += 1
    next.updatedAt = now
    try schedule(next)
    // Lift the pause only once the new deadline is scheduled.
    if session.isRestricted { ScreenBreakShared.clearShield() }
    session = next
    ScreenBreakShared.saveSession(session)
    ScreenBreakShared.enqueueSync(session)
    scheduleNotifications(session)
    armTimer(session)
  }

  private func endNow(_ command: [String: Any]) throws {
    var session = try requireCurrent(command)
    guard session.isActive else { throw ScreenBreakError(code: "stale", message: "Screen time already ended.") }
    let now = Date()
    DeviceActivityCenter().stopMonitoring([ScreenBreakShared.activityName])
    session.status = "restricted"
    session.endReason = "end_now"
    session.endedAt = now
    session.version += 1
    session.updatedAt = now
    ScreenBreakShared.applyShield()
    ScreenBreakShared.saveSession(session)
    ScreenBreakShared.enqueueSync(session)
    scheduleNotifications(session)
    disarmTimer()
  }

  private func cancel(_ command: [String: Any]) throws {
    var session = try requireCurrent(command)
    guard session.isActive || session.isRestricted else {
      throw ScreenBreakError(code: "stale", message: "This Screen Break already ended.")
    }
    let now = Date()
    DeviceActivityCenter().stopMonitoring([ScreenBreakShared.activityName])
    ScreenBreakShared.clearShield()
    if session.isActive {
      session.endedAt = now
      session.endReason = "canceled"
    }
    session.status = "canceled"
    session.version += 1
    session.updatedAt = now
    ScreenBreakShared.saveSession(session)
    ScreenBreakShared.enqueueSync(session)
    scheduleNotifications(session)
    disarmTimer()
  }

  private func release(_ command: [String: Any]) throws {
    var session = try requireCurrent(command)
    guard session.isRestricted else {
      throw ScreenBreakError(code: "stale", message: "There's no break to release.")
    }
    ScreenBreakShared.clearShield()
    session.status = "released"
    session.version += 1
    session.updatedAt = Date()
    ScreenBreakShared.saveSession(session)
    ScreenBreakShared.enqueueSync(session)
    scheduleNotifications(session)
  }

  // MARK: Enforcement

  /// DeviceActivity needs an interval of at least 15 minutes, so short sessions start the interval earlier;
  /// only its end (the deadline) matters. The monitor extension turns the break on at `intervalDidEnd`.
  private func schedule(_ session: ScreenBreakSession) throws {
    let center = DeviceActivityCenter()
    center.stopMonitoring([ScreenBreakShared.activityName])
    let calendar = Calendar.current
    let parts: Set<Calendar.Component> = [.era, .year, .month, .day, .hour, .minute, .second]
    let start = min(Date(), session.deadline.addingTimeInterval(-16 * 60))
    let schedule = DeviceActivitySchedule(
      intervalStart: calendar.dateComponents(parts, from: start),
      intervalEnd: calendar.dateComponents(parts, from: session.deadline),
      repeats: false)
    do {
      try center.startMonitoring(ScreenBreakShared.activityName, during: schedule)
    } catch {
      throw ScreenBreakError(code: "schedule", message: "Screen Time couldn't schedule this break. Check Screen Time access and try again.")
    }
  }

  /// Restores enforcement after relaunches, restarts, missed extension callbacks or revoked permission.
  private func reconcileLocked() {
    let now = Date()
    if ScreenBreakShared.expireIfDue(now: now) != nil {
      scheduleNotificationsAfterExpiry()
      disarmTimer()
      notifyLocked()
      return
    }
    guard let session = ScreenBreakShared.loadSession() else { return }
    if session.isRestricted {
      ScreenBreakShared.applyShield()
    } else if session.isActive {
      if authorized && !DeviceActivityCenter().activities.contains(ScreenBreakShared.activityName) {
        try? schedule(session)
      }
      armTimer(session)
    }
  }

  /// While MoodPals is running, end the session on time even if the extension callback is late.
  private func armTimer(_ session: ScreenBreakSession) {
    disarmTimer()
    let source = DispatchSource.makeTimerSource(queue: queue)
    source.schedule(deadline: .now() + max(0.5, session.deadline.timeIntervalSinceNow + 0.5))
    source.setEventHandler { [weak self] in self?.reconcileLocked() }
    source.resume()
    timer = source
  }

  private func disarmTimer() {
    timer?.cancel()
    timer = nil
  }

  // MARK: Notifications

  /// Screen Break reminders go to the parent's Apple Watch only (the watch schedules its own from the synced state).
  /// The iPhone is usually in a child's hands, so it never shows them; this only clears ones left from older builds.
  private func scheduleNotifications(_ session: ScreenBreakSession) {
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: [warnId, endId])
    center.removeDeliveredNotifications(withIdentifiers: [warnId, endId])
    guard Self.remindOnPhone, session.isActive else { return }
    let data: [String: Any] = ["action": "screenBreak", "sessionId": session.id, "childId": session.childId]
    let warnAt = session.deadline.addingTimeInterval(-300)
    // Sessions of 5 minutes or less only get the "time is up" notification.
    if session.deadline.timeIntervalSince(session.startedAt) > 300 && warnAt.timeIntervalSinceNow > 5 {
      add(warnId, title: "\(session.childName)'s screen time ends in 5 minutes.", body: "Open Screen Break to add time or end now.", at: warnAt, data: data)
    }
    add(endId, title: "\(session.childName)'s screen time is over", body: "Screen Break is on. You can release it in MoodPals.", at: session.deadline, data: data)
  }

  private func scheduleNotificationsAfterExpiry() {
    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [warnId])
  }

  private func add(_ id: String, title: String, body: String, at date: Date, data: [String: Any]) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    content.threadIdentifier = "moodpals.screenBreak"
    // expo-notifications reads custom data from "body"; the Watch reads either.
    content.userInfo = ["body": data, "action": "screenBreak"]
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, date.timeIntervalSinceNow), repeats: false)
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
  }

  // MARK: State

  private func stateLocked() -> [String: Any] {
    let now = Date()
    let entitlement = loadEntitlement()
    var state: [String: Any] = [
      "deviceId": deviceId,
      "authorized": authorized,
      "selectionCount": ScreenBreakShared.selectionCount(ScreenBreakShared.loadSelection()),
      "entitlementKnown": entitlement != nil,
      "allowed": entitlement?.allows(at: now) ?? false,
      "hasPlus": entitlement?.hasPlus ?? false,
      "trialAvailable": entitlement?.trialAvailable ?? false,
      "children": loadChildren().map { ["id": $0.id, "name": $0.name] },
      "addTimeOptions": Self.addTimeOptions,
      "updatedAt": now.timeIntervalSince1970,
    ]
    if let ends = entitlement?.trialEndsAt { state["trialEndsAt"] = ends.timeIntervalSince1970 }
    if let session = ScreenBreakShared.loadSession() { state["session"] = Self.dict(session) }
    return state
  }

  static func dict(_ s: ScreenBreakSession) -> [String: Any] {
    var d: [String: Any] = [
      "id": s.id, "childId": s.childId, "childName": s.childName, "status": s.status,
      "startedAt": s.startedAt.timeIntervalSince1970, "deadline": s.deadline.timeIntervalSince1970,
      "grantedSeconds": s.grantedSeconds, "version": s.version, "updatedAt": s.updatedAt.timeIntervalSince1970,
    ]
    if let endedAt = s.endedAt { d["endedAt"] = endedAt.timeIntervalSince1970 }
    if let reason = s.endReason { d["endReason"] = reason }
    return d
  }

  private func notifyLocked() {
    let state = stateLocked()
    DispatchQueue.main.async {
      self.onChange?(state)
      WatchLinkSession.shared.pushScreenBreak(state)
    }
  }

  private func loadChildren() -> [ScreenBreakChild] {
    guard let data = defaults.data(forKey: childrenKey) else { return [] }
    return (try? JSONDecoder().decode([ScreenBreakChild].self, from: data)) ?? []
  }

  private func loadEntitlement() -> ScreenBreakEntitlement? {
    guard let data = defaults.data(forKey: entitlementKey) else { return nil }
    return try? JSONDecoder().decode(ScreenBreakEntitlement.self, from: data)
  }

  private func loadCommands() -> [ScreenBreakCommandRecord] {
    guard let data = defaults.data(forKey: commandsKey) else { return [] }
    return (try? JSONDecoder().decode([ScreenBreakCommandRecord].self, from: data)) ?? []
  }

  private func saveCommands(_ records: [ScreenBreakCommandRecord]) {
    if let data = try? JSONEncoder().encode(records) { defaults.set(data, forKey: commandsKey) }
  }
}
