import WatchConnectivity

/// Shares the watch's one-time pairing code with the MoodPals iPhone app,
/// so a signed-in iPhone links the watch without scanning the QR code.
final class WatchPhoneLink: NSObject, WCSessionDelegate {
    static let shared = WatchPhoneLink()
    private var pending: [String: Any]?

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
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

    func sessionReachabilityDidChange(_ session: WCSession) {
        guard session.isReachable else { return }
        DispatchQueue.main.async { self.send() }
    }
}
