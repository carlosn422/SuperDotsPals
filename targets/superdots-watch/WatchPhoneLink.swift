import WatchConnectivity
import WatchKit

/// Shares the watch's one-time pairing request with the MoodPals iPhone app,
/// so a signed-in iPhone links the watch without typing the code.
/// Also receives the account's latest mood from the iPhone (modules/watch-link `sendMood`).
final class WatchPhoneLink: NSObject, WCSessionDelegate {
    static let shared = WatchPhoneLink()
    private var pending: [String: Any]?
    /// Called when the iPhone's "Link" button asks this watch to start linking.
    var onPairingRequested: (() -> Void)?
    private var lastRequest: Double = 0
    /// watchOS wakes the app with these to deliver iPhone transfers; complete them once nothing is pending.
    private var connectivityTasks: [WKWatchConnectivityRefreshBackgroundTask] = []

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
        // The latest mood context from the iPhone, in case it arrived while the app was not running.
        if activationState == .activated { handleMood(session.receivedApplicationContext) }
        DispatchQueue.main.async {
            self.send()
            self.finishBackgroundTasksIfIdle()
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        handleRequest(message)
        handleMood(message)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        handleRequest(applicationContext)
        handleMood(applicationContext)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        handleMood(userInfo)
    }

    func handle(_ task: WKWatchConnectivityRefreshBackgroundTask) {
        DispatchQueue.main.async {
            self.connectivityTasks.append(task)
            self.activate()
            self.finishBackgroundTasksIfIdle()
            // Never hold a background task past watchOS's budget.
            DispatchQueue.main.asyncAfter(deadline: .now() + 15) { self.finishBackgroundTasks() }
        }
    }

    private func finishBackgroundTasksIfIdle() {
        guard WCSession.default.activationState == .activated, !WCSession.default.hasContentPending else { return }
        // Let the mood write and the widget reload request finish first.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.finishBackgroundTasks() }
    }

    private func finishBackgroundTasks() {
        let tasks = connectivityTasks
        connectivityTasks = []
        tasks.forEach { $0.setTaskCompletedWithSnapshot(false) }
    }

    /// `["moodSync": ["mood": String, "at": seconds since 1970, "user": account id, "healthAt": seconds (optional)]]`, newest wins.
    /// `healthAt` is when the iPhone's Apple Health refresh ended the hold on the picked mood.
    private func handleMood(_ payload: [String: Any]) {
        guard let sync = payload["moodSync"] as? [String: Any] else { return }
        guard let mood = sync["mood"] as? String, (1...40).contains(mood.count),
              let at = (sync["at"] as? NSNumber)?.doubleValue, at > 0,
              at <= Date().timeIntervalSince1970 + 300,
              let user = sync["user"] as? String, !user.isEmpty else {
            NSLog("[WatchSync] Mood from iPhone rejected: invalid payload")
            return
        }
        Task { @MainActor in
            defer { self.finishBackgroundTasksIfIdle() }
            guard WatchThemeSync.shared.isSignedIn(as: user) else {
                NSLog("[WatchSync] Mood from iPhone ignored: different or no account on this watch")
                return
            }
            if let healthAt = (sync["healthAt"] as? NSNumber)?.doubleValue, healthAt > 0,
               healthAt <= Date().timeIntervalSince1970 + 300,
               WatchMoodStore.followHealth(at: Date(timeIntervalSince1970: healthAt)) {
                NSLog("[WatchSync] iPhone set the MoodPal to follow Apple Health")
            }
            if WatchMoodStore.save(mood, at: Date(timeIntervalSince1970: at), if: .newer) != nil {
                NSLog("[WatchSync] Mood from iPhone applied: %@", mood)
            } else {
                NSLog("[WatchSync] Mood from iPhone ignored (not newer): %@", mood)
            }
        }
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
