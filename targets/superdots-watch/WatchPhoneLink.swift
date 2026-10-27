import WatchConnectivity

/// Shares the watch's one-time pairing request with the MoodPals iPhone app,
/// so a signed-in iPhone links the watch without typing the code.
final class WatchPhoneLink: NSObject, WCSessionDelegate {
    static let shared = WatchPhoneLink()
    private var pending: [String: Any]?
    /// Called when the iPhone's "Link" button asks this watch to start linking.
    var onPairingRequested: (() -> Void)?
    private var lastRequest: Double = 0

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// A Family Setup watch has no paired iPhone of its own, so the MoodPals companion is never installed.
    func isFamilyWatch() async -> Bool {
        guard WCSession.isSupported() else { return true }
        for _ in 0..<20 where WCSession.default.activationState != .activated {
            try? await Task.sleep(for: .milliseconds(100))
        }
        let session = WCSession.default
        return session.activationState == .activated && !session.isCompanionAppInstalled
    }

    func offer(id: String, secret: String) {
        pending = ["pairId": id, "pairSecret": secret]
        send()
    }

    func linked() {
        pending = nil
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        try? WCSession.default.updateApplicationContext(["linked": true])
    }

    private func send() {
        guard WCSession.isSupported(), let pending else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        try? session.updateApplicationContext(pending)
        if session.isReachable { session.sendMessage(pending, replyHandler: nil, errorHandler: nil) }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async { self.send() }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        handleRequest(message)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        handleRequest(applicationContext)
    }

    private func handleRequest(_ payload: [String: Any]) {
        guard let at = payload["requestPairing"] as? Double else { return }
        DispatchQueue.main.async {
            guard at > self.lastRequest else { return }
            self.lastRequest = at
            if self.pending != nil { self.send() } else { self.onPairingRequested?() }
        }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        guard session.isReachable else { return }
        DispatchQueue.main.async { self.send() }
    }
}
