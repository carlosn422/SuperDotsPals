import Foundation
import CryptoKit
import Security
import FamilyControls
import DeviceActivity
import LocalAuthentication

enum SatelliteError: Error {
  case notLinked
  case revoked
  case http(Int, String)
}

/// Satellite mode: this iPad or spare iPhone is a family device on a parent's account. It has its own
/// restricted login (Keychain only), pulls the parent's commands from Supabase, applies them with the same
/// Screen Break engine the parent's iPhone uses, and acknowledges each one. Runs natively so a background
/// push, launch or foreground can sync without JavaScript; enforcement itself never needs the app running.
final class SatelliteLink {
  static let shared = SatelliteLink()
  static let supabaseURL = "https://hzoauxxpvrgahlavxmvp.supabase.co"
  static let anonKey = "sb_publishable_pPPqosRo1SqwrbW-8MWURA_UxTED6Vs"
  private static let service = "com.superdotspals.wellnest.satellite"
  private static let infoKey = "satellite.info"
  private static let authKindKey = "satellite.authKind"
  private static let installedKey = "satellite.installed"
  private static let maxRecoveryTries = 5

  struct Credentials: Codable {
    var access: String
    var refresh: String
    var expiresAt: Double
  }

  private let gate = NSLock()
  private var syncTask: Task<[String: Any], Never>?
  private var refreshTask: Task<String, Error>?

  private init() {
    // Keychain items outlive the app; a fresh install starts unlinked with a new installation id.
    if !UserDefaults.standard.bool(forKey: Self.installedKey) {
      ["credentials", "recovery", "installation", "recoveryTries"].forEach(remove)
      UserDefaults.standard.set(true, forKey: Self.installedKey)
    }
  }

  // MARK: Keychain

  private func base(_ account: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Self.service, kSecAttrAccount as String: account]
  }

  private func read(_ account: String) -> Data? {
    var query = base(account)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: AnyObject?
    return SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess ? out as? Data : nil
  }

  private func write(_ account: String, _ data: Data) {
    // Readable after first unlock so a background push can sync while the device is locked.
    let attrs: [String: Any] = [kSecValueData as String: data,
                                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
    if SecItemUpdate(base(account) as CFDictionary, attrs as CFDictionary) == errSecItemNotFound {
      SecItemAdd(base(account).merging(attrs) { $1 } as CFDictionary, nil)
    }
  }

  private func remove(_ account: String) {
    SecItemDelete(base(account) as CFDictionary)
  }

  var installationId: String {
    if let data = read("installation"), let id = String(data: data, encoding: .utf8) { return id }
    let id = UUID().uuidString.lowercased()
    write("installation", Data(id.utf8))
    return id
  }

  private var credentials: Credentials? {
    get { read("credentials").flatMap { try? JSONDecoder().decode(Credentials.self, from: $0) } }
    set {
      if let newValue, let data = try? JSONEncoder().encode(newValue) { write("credentials", data) } else { remove("credentials") }
    }
  }

  var isLinked: Bool { credentials != nil }

  private var info: [String: Any] {
    get { UserDefaults.standard.dictionary(forKey: Self.infoKey) ?? [:] }
    set { UserDefaults.standard.set(newValue, forKey: Self.infoKey) }
  }

  // MARK: Public API

  func saveCredentials(_ dict: [String: Any]) -> Bool {
    guard let access = dict["access_token"] as? String, let refresh = dict["refresh_token"] as? String,
          !access.isEmpty, !refresh.isEmpty else { return false }
    let expires = (dict["expires_at"] as? NSNumber)?.doubleValue ?? Date().timeIntervalSince1970 + 3000
    credentials = Credentials(access: access, refresh: refresh, expiresAt: expires)
    remove("recoveryTries")
    info = ["online": true]
    return true
  }

  func state() -> [String: Any] {
    var out = info
    out["linked"] = isLinked
    out["installationId"] = installationId
    out["authKind"] = UserDefaults.standard.string(forKey: Self.authKindKey) ?? NSNull()
    out["engine"] = ScreenBreakEngine.shared.state()
    return out
  }

  /// After the "unlinked" notice, the device can be linked again.
  func resetUnlinked() {
    guard !isLinked else { return }
    info = [:]
  }

  func setAuthKind(_ kind: String) {
    UserDefaults.standard.set(kind, forKey: Self.authKindKey)
  }

  /// One sync at a time; callers during a sync share its result.
  func sync(_ reason: String) async -> [String: Any] {
    gate.lock()
    if let running = syncTask {
      gate.unlock()
      return await running.value
    }
    let task = Task { await self.runSync(reason) }
    syncTask = task
    gate.unlock()
    let result = await task.value
    gate.lock()
    syncTask = nil
    gate.unlock()
    return result
  }

  /// Guardian recovery: the 6-digit code shown in the parent's Family Devices clears this device's
  /// restrictions and link even when it can't reach MoodPals.
  func recover(_ code: String) -> [String: Any] {
    let now = Date().timeIntervalSince1970
    var tries = read("recoveryTries").flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Double] } ?? [:]
    if let until = tries["until"], until > now {
      return ["ok": false, "error": "Too many tries. Wait 15 minutes."]
    }
    guard let expected = read("recovery").flatMap({ String(data: $0, encoding: .utf8) }),
          let deviceId = info["deviceId"] as? String else {
      return ["ok": false, "error": "Connect to the internet once, then try again."]
    }
    let digest = SHA256.hash(data: Data("\(deviceId):\(code)".utf8)).map { String(format: "%02x", $0) }.joined()
    guard digest == expected else {
      let count = (tries["count"] ?? 0) + 1
      tries = count >= Double(Self.maxRecoveryTries) ? ["count": 0, "until": now + 15 * 60] : ["count": count]
      if let data = try? JSONSerialization.data(withJSONObject: tries) { write("recoveryTries", data) }
      return ["ok": false, "error": "That code doesn't match."]
    }
    clearLocal(reason: "recovered")
    return ["ok": true]
  }

  func accessToken() async throws -> String {
    guard let current = credentials else { throw SatelliteError.notLinked }
    if current.expiresAt - Date().timeIntervalSince1970 > 120 { return current.access }
    return try await refresh()
  }

  static func isSyncPush(_ userInfo: [AnyHashable: Any]) -> Bool {
    let candidates: [Any?] = [userInfo["body"], userInfo["data"], userInfo]
    return candidates.contains { ($0 as? [AnyHashable: Any])?["action"] as? String == "satellite_sync" }
  }

  static func authStatus() -> String {
    switch AuthorizationCenter.shared.authorizationStatus {
    case .approved: return "approved"
    case .denied: return "denied"
    default: return "unknown"
    }
  }

  static func authenticateGuardian(_ reason: String) async -> Bool {
    let context = LAContext()
    var error: NSError?
    guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { return false }
    return (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) ?? false
  }

  // MARK: Sync

  private func runSync(_ reason: String) async -> [String: Any] {
    guard isLinked else { return state() }
    do {
      let engine = ScreenBreakEngine.shared
      let reply = try await rpc("satellite_sync", ["p_report": report()]) as? [String: Any] ?? [:]
      guard reply["linked"] as? Bool != false else {
        clearLocal(reason: "unlinked")
        return state()
      }
      apply(reply)
      if let saved = reply["saved"] as? [String: Any] {
        engine.ackSync(saved.compactMapValues { ($0 as? NSNumber)?.intValue })
      }
      for command in reply["commands"] as? [[String: Any]] ?? [] {
        guard try await process(command) else { return state() }
      }
      liftIfPlanEnded(reply)
      var next = info
      next["online"] = true
      next["lastSyncAt"] = Date().timeIntervalSince1970
      next["error"] = nil
      info = next
    } catch SatelliteError.revoked {
      clearLocal(reason: "unlinked")
    } catch SatelliteError.notLinked {
    } catch {
      var next = info
      next["online"] = false
      info = next
    }
    ScreenBreakEngine.shared.reconcile()
    return state()
  }

  private func report() -> [String: Any] {
    let engine = ScreenBreakEngine.shared
    let local = engine.state()
    return [
      "auth_status": Self.authStatus(),
      "auth_kind": UserDefaults.standard.string(forKey: Self.authKindKey) ?? NSNull(),
      "selection_count": local["selectionCount"] ?? 0,
      "restricted": restricted(),
      "sessions": engine.pendingSync(),
    ]
  }

  private func restricted() -> Bool {
    let local = ScreenBreakEngine.shared.state()
    let session = local["session"] as? [String: Any]
    return (local["manualLock"] as? Bool ?? false) || session?["status"] as? String == "restricted"
  }

  private func apply(_ reply: [String: Any]) {
    let engine = ScreenBreakEngine.shared
    if let children = reply["children"] as? [[String: Any]] { engine.setChildren(children) }
    if let ent = reply["entitlement"] as? [String: Any] {
      let epoch: (String) -> Double = { key in (ent[key] as? String).flatMap(Self.parseDate)?.timeIntervalSince1970 ?? 0 }
      engine.setEntitlement([
        "hasPlus": ent["has_plus"] as? Bool ?? false,
        "trialAvailable": ent["trial_available"] as? Bool ?? false,
        "trialStartedAt": epoch("trial_started_at"),
        "trialEndsAt": epoch("trial_ends_at"),
      ])
    }
    if let device = reply["device"] as? [String: Any] {
      var next = info
      next["deviceId"] = device["id"] as? String
      next["deviceName"] = device["name"] as? String
      next["deviceType"] = device["device_type"] as? String
      next["status"] = device["status"] as? String
      info = next
      if let hash = device["recovery_hash"] as? String { write("recovery", Data(hash.utf8)) }
    }
  }

  /// Applies one command in sequence order and acknowledges it. Returns false once the device is unlinked.
  private func process(_ command: [String: Any]) async throws -> Bool {
    guard let id = command["id"] as? String, let type = command["type"] as? String else { return true }
    let engine = ScreenBreakEngine.shared
    let sessionId = (command["session_id"] as? String)?.lowercased()
    let current = ScreenBreakShared.loadSession()
    var ok = true
    var error: String?
    var code: String?
    func run(_ cmd: [String: Any]) {
      let reply = engine.handle(cmd)
      ok = reply["ok"] as? Bool ?? false
      error = reply["error"] as? String
      code = reply["code"] as? String
    }
    if let expires = (command["expires_at"] as? String).flatMap(Self.parseDate), expires < Date() {
      ok = false
      code = "expired"
      error = "This request expired before the device received it."
    } else {
      switch type {
      case "START_SESSION":
        run(["action": "start", "commandId": id, "childId": command["child_id"] ?? "",
             "minutes": command["minutes"] ?? 0, "sessionId": sessionId ?? ""])
      case "EXTEND_SESSION":
        // A late "add time" never reopens a session that already ended here.
        if let current, current.id == sessionId, current.isActive {
          run(["action": "addTime", "commandId": id, "minutes": command["minutes"] ?? 0, "sessionId": current.id])
        } else {
          ok = false
          code = "stale"
          error = "That screen time already ended."
        }
      case "END_SESSION":
        if let current, current.id == sessionId, current.isActive {
          run(["action": "endNow", "commandId": id, "sessionId": current.id])
        }
      case "LOCK_APPS":
        run(["action": "lock", "commandId": id])
      case "UNLINK_DEVICE":
        clearLocal(reason: "unlinked", keepCredentials: true)
        _ = try? await rpc("satellite_ack", ["p_command": id, "p_ok": true, "p_restricted": false])
        clearLocal(reason: "unlinked")
        return false
      default:
        break
      }
    }
    var body: [String: Any] = ["p_command": id, "p_ok": ok, "p_restricted": restricted()]
    if let error { body["p_error"] = error }
    if let code { body["p_code"] = code }
    if let sessionId, let session = ScreenBreakShared.loadSession(), session.id == sessionId {
      body["p_session"] = Self.row(session)
    }
    let ack = try await rpc("satellite_ack", body) as? [String: Any] ?? [:]
    if ack["linked"] as? Bool == false {
      clearLocal(reason: "unlinked")
      return false
    }
    if ack["undo"] as? Bool == true, let sessionId {
      _ = engine.handle(["action": "cancel", "commandId": id + ".undo", "sessionId": sessionId])
    }
    return true
  }

  /// A lapsed plan never leaves the device locked: once no session is running, the pause lifts.
  private func liftIfPlanEnded(_ reply: [String: Any]) {
    guard let ent = reply["entitlement"] as? [String: Any], ent["allowed"] as? Bool == false else { return }
    if ScreenBreakShared.loadSession()?.isActive == true || !restricted() { return }
    _ = ScreenBreakEngine.shared.handle(["action": "unlock", "commandId": "plan." + UUID().uuidString])
  }

  /// Removes only what Screen Break owns on this device: its session, its shield and its schedule.
  private func clearLocal(reason: String, keepCredentials: Bool = false) {
    let engine = ScreenBreakEngine.shared
    if let session = ScreenBreakShared.loadSession(), session.isActive || session.isRestricted {
      _ = engine.handle(["action": "cancel", "commandId": "unlink." + UUID().uuidString, "sessionId": session.id])
    }
    _ = engine.handle(["action": "unlock", "commandId": "unlink." + UUID().uuidString])
    DeviceActivityCenter().stopMonitoring([ScreenBreakShared.activityName])
    ScreenBreakShared.clearShield()
    guard !keepCredentials else { return }
    credentials = nil
    remove("recovery")
    info = ["unlinked": true, "reason": reason]
    engine.setChildren([])
  }

  // MARK: Networking

  private func rpc(_ name: String, _ body: [String: Any], retry: Bool = true) async throws -> Any {
    let token = try await accessToken()
    var request = URLRequest(url: URL(string: "\(Self.supabaseURL)/rest/v1/rpc/\(name)")!)
    request.httpMethod = "POST"
    request.timeoutInterval = 20
    request.setValue(Self.anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    if status == 401 && retry {
      _ = try await refresh()
      return try await rpc(name, body, retry: false)
    }
    guard (200..<300).contains(status) else {
      throw SatelliteError.http(status, String(data: data, encoding: .utf8) ?? "")
    }
    if data.isEmpty { return NSNull() }
    return try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
  }

  private func refresh() async throws -> String {
    gate.lock()
    if let running = refreshTask {
      gate.unlock()
      return try await running.value
    }
    let task = Task { try await self.runRefresh() }
    refreshTask = task
    gate.unlock()
    defer {
      gate.lock()
      refreshTask = nil
      gate.unlock()
    }
    return try await task.value
  }

  private func runRefresh() async throws -> String {
    guard let current = credentials else { throw SatelliteError.notLinked }
    var request = URLRequest(url: URL(string: "\(Self.supabaseURL)/auth/v1/token?grant_type=refresh_token")!)
    request.httpMethod = "POST"
    request.timeoutInterval = 20
    request.setValue(Self.anonKey, forHTTPHeaderField: "apikey")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": current.refresh])
    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    if (400..<500).contains(status) {
      // The login was deleted (unlinked by the parent): the device returns to normal.
      let codeText = (json["error_code"] as? String) ?? (json["code"] as? String) ?? ""
      if ["refresh_token_not_found", "user_not_found", "session_not_found", "user_banned"].contains(codeText) {
        throw SatelliteError.revoked
      }
      throw SatelliteError.http(status, codeText)
    }
    guard (200..<300).contains(status), let access = json["access_token"] as? String,
          let refresh = json["refresh_token"] as? String else {
      throw SatelliteError.http(status, "refresh")
    }
    let expires = (json["expires_at"] as? NSNumber)?.doubleValue
      ?? Date().timeIntervalSince1970 + ((json["expires_in"] as? NSNumber)?.doubleValue ?? 3600)
    credentials = Credentials(access: access, refresh: refresh, expiresAt: expires)
    return access
  }

  // MARK: Helpers

  static func parseDate(_ text: String) -> Date? {
    let precise = ISO8601DateFormatter()
    precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = precise.date(from: text) { return date }
    let plain = ISO8601DateFormatter()
    if let date = plain.date(from: text) { return date }
    // Postgres JSON timestamps: "2026-11-25T14:45:01.123456+00:00".
    let pg = DateFormatter()
    pg.locale = Locale(identifier: "en_US_POSIX")
    pg.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXXXX"
    return pg.date(from: text)
  }

  static func row(_ s: ScreenBreakSession) -> [String: Any] {
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
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
