import SwiftUI
import WatchConnectivity
import UserNotifications

/// Parent remote control for Family Screen Break. The paired iPhone owns the timer and enforcement;
/// this watch only shows the last state the iPhone confirmed and sends commands it must acknowledge.
struct WatchBreakChild: Identifiable, Hashable {
    let id: String
    let name: String
}

struct WatchBreakSession: Equatable {
    let id: String
    let childId: String
    let childName: String
    /// active | restricted | released | canceled
    let status: String
    let startedAt: Date
    let deadline: Date
    let version: Int

    var isRunning: Bool { status == "active" || status == "restricted" }
}

@MainActor
final class WatchScreenBreakStore: ObservableObject {
    static let shared = WatchScreenBreakStore()
    @Published private(set) var children: [WatchBreakChild] = []
    @Published private(set) var session: WatchBreakSession?
    @Published private(set) var allowed = false
    @Published private(set) var authorized = false
    @Published private(set) var selectionCount = 0
    @Published private(set) var addTimeOptions = [5, 10, 15, 30]
    @Published private(set) var confirmedAt: Date?
    /// The command waiting for the iPhone's confirmation.
    @Published private(set) var pending: String?
    @Published var error: String?
    @Published private(set) var openRequest = 0
    private var stateAt: Double = 0
    private let storageKey = "screenBreak.lastState"
    private let warnId = "moodpals.screenBreak.warning"
    private let endId = "moodpals.screenBreak.ended"

    init() {
        if let saved = UserDefaults.standard.dictionary(forKey: storageKey) { apply(saved, persist: false) }
    }

    /// State from the iPhone (context, message, transfer or command reply). Newest wins.
    func apply(_ state: [String: Any], persist: Bool = true) {
        let at = (state["updatedAt"] as? NSNumber)?.doubleValue ?? 0
        guard at >= stateAt else { return }
        stateAt = at
        confirmedAt = Date(timeIntervalSince1970: at)
        children = (state["children"] as? [[String: Any]] ?? []).compactMap { item in
            guard let id = item["id"] as? String, let name = item["name"] as? String else { return nil }
            return WatchBreakChild(id: id, name: name)
        }
        allowed = state["allowed"] as? Bool ?? false
        authorized = state["authorized"] as? Bool ?? false
        selectionCount = (state["selectionCount"] as? NSNumber)?.intValue ?? 0
        if let options = state["addTimeOptions"] as? [NSNumber], !options.isEmpty { addTimeOptions = options.map(\.intValue) }
        if let s = state["session"] as? [String: Any], let id = s["id"] as? String, let childId = s["childId"] as? String,
           let started = (s["startedAt"] as? NSNumber)?.doubleValue, let deadline = (s["deadline"] as? NSNumber)?.doubleValue {
            session = WatchBreakSession(
                id: id, childId: childId, childName: s["childName"] as? String ?? "", status: s["status"] as? String ?? "",
                startedAt: Date(timeIntervalSince1970: started), deadline: Date(timeIntervalSince1970: deadline),
                version: (s["version"] as? NSNumber)?.intValue ?? 1)
        } else {
            session = nil
        }
        if persist { UserDefaults.standard.set(state, forKey: storageKey) }
        scheduleReminders()
    }

    func openFromNotification() {
        openRequest += 1
    }

    /// Asks the iPhone for its current state (used when the screen opens).
    func refresh() async {
        guard pending == nil else { return }
        _ = await send(["action": "state", "commandId": UUID().uuidString], quiet: true)
    }

    @discardableResult
    func command(_ action: String, childId: String? = nil, minutes: Int? = nil) async -> Bool {
        guard pending == nil else { return false }
        var command: [String: Any] = ["action": action, "commandId": UUID().uuidString]
        if let childId { command["childId"] = childId }
        if let minutes { command["minutes"] = minutes }
        // Commands on a session carry the version the parent saw, so a stale tap can't change a newer session.
        if action != "start", let session {
            command["sessionId"] = session.id
            command["expectedVersion"] = session.version
        }
        pending = action
        defer { pending = nil }
        return await send(command, quiet: false)
    }

    private func send(_ command: [String: Any], quiet: Bool) async -> Bool {
        guard WCSession.isSupported() else { return false }
        let wc = WCSession.default
        guard wc.activationState == .activated, wc.isReachable else {
            if !quiet { error = "Can't reach your iPhone. Keep it nearby with Bluetooth on, then try again." }
            return false
        }
        if !quiet { error = nil }
        do {
            let reply: [String: Any] = try await withCheckedThrowingContinuation { continuation in
                wc.sendMessage(["screenBreakCommand": command], replyHandler: { continuation.resume(returning: $0) },
                               errorHandler: { continuation.resume(throwing: $0) })
            }
            guard let result = reply["screenBreakReply"] as? [String: Any] else {
                if !quiet { error = "Update MoodPals on your iPhone to use Screen Break." }
                return false
            }
            if let state = result["state"] as? [String: Any] { apply(state) }
            if result["ok"] as? Bool == true { return true }
            if !quiet { error = result["error"] as? String ?? "Your iPhone couldn't do that." }
            return false
        } catch {
            if !quiet { self.error = "Your iPhone didn't confirm. Check that it's nearby, then try again." }
            return false
        }
    }

    /// The watch keeps its own reminder so the parent hears it even while the child is using the iPhone
    /// (an unlocked iPhone keeps its notifications to itself). Same identifiers as the iPhone's.
    private func scheduleReminders() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [warnId, endId])
        guard let session, session.status == "active" else { return }
        let warnAt = session.deadline.addingTimeInterval(-300)
        if session.deadline.timeIntervalSince(session.startedAt) > 300 && warnAt.timeIntervalSinceNow > 5 {
            add(warnId, title: "\(session.childName)'s screen time ends in 5 minutes.", body: "Tap to add time or end now.", at: warnAt)
        }
        if session.deadline.timeIntervalSinceNow > 1 {
            add(endId, title: "\(session.childName)'s screen time is over", body: "Screen Break is on.", at: session.deadline)
        }
    }

    private func add(_ id: String, title: String, body: String, at date: Date) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.userInfo = ["action": "screenBreak"]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, date.timeIntervalSinceNow), repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }
}

/// Family → children. Opened from the home screen.
struct WatchFamilyView: View {
    @ObservedObject private var store = WatchScreenBreakStore.shared
    @Binding var path: [WatchBreakChild]

    var body: some View {
        List {
            if store.children.isEmpty {
                Text("Add your children in MoodPals on iPhone: More → Family.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            ForEach(store.children) { child in
                NavigationLink(value: child) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(child.name).font(.headline)
                        if let session = store.session, session.childId == child.id, session.isRunning {
                            Text(session.status == "active" ? "Screen time" : "Break on")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Family")
        .navigationDestination(for: WatchBreakChild.self) { ScreenBreakControlView(child: $0) }
        .task { await store.refresh() }
    }
}

struct ScreenBreakControlView: View {
    let child: WatchBreakChild
    @ObservedObject private var store = WatchScreenBreakStore.shared
    @State private var addingTime = false
    @State private var choosingCustom = false
    @State private var customMinutes = 20

    private var mine: WatchBreakSession? {
        guard let session = store.session, session.childId == child.id, session.isRunning else { return nil }
        return session
    }
    private var other: WatchBreakSession? {
        guard let session = store.session, session.childId != child.id, session.status == "active" else { return nil }
        return session
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text(child.name).font(.headline)
                if let session = mine, session.status == "active" {
                    TimelineView(.explicit([session.deadline])) { context in
                        VStack(spacing: 2) {
                            if context.date < session.deadline {
                                Text("Screen time left").font(.caption2).foregroundStyle(.secondary)
                                Text(timerInterval: Date()...session.deadline, countsDown: true)
                                    .font(.system(size: 30, weight: .bold)).monospacedDigit()
                            } else {
                                Text("Time's up").font(.title3.bold())
                            }
                            Text("Ends \(session.deadline.formatted(date: .omitted, time: .shortened))")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    Button("Add Time") { addingTime = true }
                    Button("End Now") { run("endNow") }.tint(.orange)
                    Button("Cancel", role: .destructive) { run("cancel") }
                } else if let session = mine {
                    AnimatedMoodMascot(mood: "Joyful", size: 64)
                    Text("Time for a break!").font(.headline)
                    Text("Ended \(((session.deadline < Date()) ? session.deadline : Date()).formatted(date: .omitted, time: .shortened))")
                        .font(.caption2).foregroundStyle(.secondary)
                    Button("Release Break") { run("release") }
                } else if let other {
                    Text("\(other.childName)'s Screen Break is running on your iPhone.")
                        .font(.caption2).multilineTextAlignment(.center)
                } else if !store.authorized || store.selectionCount == 0 {
                    Text("Finish Screen Break setup in MoodPals on your iPhone.")
                        .font(.caption2).multilineTextAlignment(.center)
                } else {
                    Text("Not running").font(.caption2).foregroundStyle(.secondary)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                        ForEach([15, 30, 45, 60], id: \.self) { minutes in
                            Button("\(minutes) min") { run("start", minutes: minutes) }
                        }
                    }
                    Button("Custom") { choosingCustom = true }
                    if !store.allowed {
                        Text("Screen Break needs MoodPals Plus after the 14-day trial.")
                            .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                }
                if store.pending != nil {
                    HStack(spacing: 6) {
                        ProgressView()
                        Text("Waiting for iPhone…").font(.caption2)
                    }
                }
                if let error = store.error {
                    Text(error).font(.caption2).foregroundStyle(.red).multilineTextAlignment(.center)
                }
            }
            .disabled(store.pending != nil)
        }
        .sheet(isPresented: $addingTime) {
            List(store.addTimeOptions, id: \.self) { minutes in
                Button("+\(minutes) min") {
                    addingTime = false
                    run("addTime", minutes: minutes)
                }
            }
        }
        .sheet(isPresented: $choosingCustom) {
            VStack(spacing: 8) {
                Stepper(value: $customMinutes, in: 5...240, step: 5) {
                    Text("\(customMinutes) min").font(.title3.bold())
                }
                Button("Start") {
                    choosingCustom = false
                    run("start", minutes: customMinutes)
                }
            }
        }
        .task { await store.refresh() }
    }

    private func run(_ action: String, minutes: Int? = nil) {
        Task { await store.command(action, childId: child.id, minutes: minutes) }
    }
}
