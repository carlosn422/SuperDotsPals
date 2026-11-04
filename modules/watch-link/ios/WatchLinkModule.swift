import ExpoModulesCore
import WatchConnectivity

public class WatchLinkModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchLink")
    Events("onPairingRequest", "onWatchStatus")

    OnCreate {
      WatchLinkSession.shared.onPairing = { [weak self] pairing in
        self?.sendEvent("onPairingRequest", pairing)
      }
      WatchLinkSession.shared.onStatus = { [weak self] status in
        self?.sendEvent("onWatchStatus", status)
      }
      WatchLinkSession.shared.activate()
    }

    Function("getPendingPairing") { () -> [String: String]? in
      WatchLinkSession.shared.pendingPairing()
    }

    Function("getWatchStatus") { () -> [String: Bool] in
      WatchLinkSession.shared.status()
    }

    /// Sends the account's latest saved mood to the watch so its complication can refresh without opening the app.
    Function("sendMood") { (mood: String, at: Double, user: String) -> Bool in
      WatchLinkSession.shared.sendMood(["mood": mood, "at": at, "user": user])
    }

    /// Asks the MoodPals watch app to start linking; it answers with its pairing request.
    Function("requestPairing") { () -> Bool in
      WatchLinkSession.shared.requestPairing()
    }
  }
}

/// The watch app shares its one-time pairing code (id + secret) through WatchConnectivity.
final class WatchLinkSession: NSObject, WCSessionDelegate {
  static let shared = WatchLinkSession()
  var onPairing: (([String: String]) -> Void)?
  /// Fires when activation completes or the paired watch, app install or reachability changes.
  var onStatus: (([String: Bool]) -> Void)?
  /// Latest mood waiting for the session to activate.
  private var pendingMood: [String: Any]?

  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    if session.delegate == nil { session.delegate = self }
    if session.activationState != .activated { session.activate() }
  }

  func pendingPairing() -> [String: String]? {
    guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return nil }
    return Self.pairing(from: WCSession.default.receivedApplicationContext)
  }

  func status() -> [String: Bool] {
    guard WCSession.isSupported() else {
      return ["supported": false, "activated": false, "paired": false, "installed": false, "reachable": false]
    }
    guard WCSession.default.activationState == .activated else {
      return ["supported": true, "activated": false, "paired": false, "installed": false, "reachable": false]
    }
    let session = WCSession.default
    return ["supported": true, "activated": true, "paired": session.isPaired, "installed": session.isWatchAppInstalled, "reachable": session.isReachable]
  }

  private func statusChanged() {
    let current = status()
    DispatchQueue.main.async { self.onStatus?(current) }
  }

  func requestPairing() -> Bool {
    guard WCSession.isSupported() else { return false }
    let session = WCSession.default
    guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return false }
    let request: [String: Any] = ["requestPairing": Date().timeIntervalSince1970]
    try? session.updateApplicationContext(request)
    if session.isReachable { session.sendMessage(request, replyHandler: nil, errorHandler: nil) }
    return true
  }

  /// Latest mood as application context (kept until the watch app next runs, and newer replaces older),
  /// plus an immediate message when the watch app is reachable, or a complication transfer that can wake
  /// the watch app in the background while a MoodPals complication is on the face. The watch ignores
  /// anything older than the mood it already has.
  func sendMood(_ mood: [String: Any]) -> Bool {
    guard WCSession.isSupported() else { return false }
    let session = WCSession.default
    guard session.activationState == .activated else {
      pendingMood = mood
      activate()
      return false
    }
    pendingMood = nil
    guard session.isPaired, session.isWatchAppInstalled else { return false }
    let payload: [String: Any] = ["moodSync": mood]
    var context = session.applicationContext
    // Keep a pairing request in the shared context only while it can still be answered.
    if let at = context["requestPairing"] as? Double, Date().timeIntervalSince1970 - at > 300 { context["requestPairing"] = nil }
    context["moodSync"] = mood
    try? session.updateApplicationContext(context)
    if session.isReachable {
      session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
    } else if session.isComplicationEnabled && session.remainingComplicationUserInfoTransfers > 0 {
      session.transferCurrentComplicationUserInfo(payload)
    }
    return true
  }

  private static func pairing(from payload: [String: Any]) -> [String: String]? {
    guard let id = payload["pairId"] as? String, let secret = payload["pairSecret"] as? String else { return nil }
    return ["id": id, "secret": secret]
  }

  private func deliver(_ payload: [String: Any]) {
    guard let pairing = Self.pairing(from: payload) else { return }
    DispatchQueue.main.async { self.onPairing?(pairing) }
  }

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    if activationState == .activated {
      deliver(session.receivedApplicationContext)
      DispatchQueue.main.async { if let mood = self.pendingMood { _ = self.sendMood(mood) } }
    }
    statusChanged()
  }
  func sessionWatchStateDidChange(_ session: WCSession) { statusChanged() }
  func sessionReachabilityDidChange(_ session: WCSession) { statusChanged() }
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }
  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) { deliver(applicationContext) }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { deliver(message) }
}
