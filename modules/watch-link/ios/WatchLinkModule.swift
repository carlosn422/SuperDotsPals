import ExpoModulesCore
import WatchConnectivity

public class WatchLinkModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchLink")
    Events("onPairingRequest")

    OnCreate {
      WatchLinkSession.shared.onPairing = { [weak self] pairing in
        self?.sendEvent("onPairingRequest", pairing)
      }
      WatchLinkSession.shared.activate()
    }

    Function("getPendingPairing") { () -> [String: String]? in
      WatchLinkSession.shared.pendingPairing()
    }

    Function("getWatchStatus") { () -> [String: Bool] in
      WatchLinkSession.shared.status()
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
    guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
      return ["paired": false, "installed": false, "reachable": false]
    }
    let session = WCSession.default
    return ["paired": session.isPaired, "installed": session.isWatchAppInstalled, "reachable": session.isReachable]
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

  private static func pairing(from payload: [String: Any]) -> [String: String]? {
    guard let id = payload["pairId"] as? String, let secret = payload["pairSecret"] as? String else { return nil }
    return ["id": id, "secret": secret]
  }

  private func deliver(_ payload: [String: Any]) {
    guard let pairing = Self.pairing(from: payload) else { return }
    DispatchQueue.main.async { self.onPairing?(pairing) }
  }

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    if activationState == .activated { deliver(session.receivedApplicationContext) }
  }
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }
  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) { deliver(applicationContext) }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { deliver(message) }
}
