import SwiftUI
import WatchKit
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

/// Family → members. Opened from the home screen.
struct WatchFamilyView: View {
    @ObservedObject private var store = WatchScreenBreakStore.shared
    @Binding var path: [WatchBreakChild]

    var body: some View {
        List {
            if store.children.isEmpty {
                Text("Add family members in MoodPals on your iPhone, in the Family tab.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            ForEach(store.children) { child in
                NavigationLink(value: child) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(child.name).font(.headline)
                        if let session = store.session, session.childId == child.id, session.isRunning {
                            Text(session.status == "active" && session.deadline > Date() ? "Screen Break active" : "Time's up")
                                .font(.caption2).foregroundStyle(session.status == "active" ? BreakStyle.green : BreakStyle.amber)
                        }
                    }
                }
            }
        }
        .tint(BreakStyle.green)
        .navigationTitle("Family")
        .navigationDestination(for: WatchBreakChild.self) { ScreenBreakControlView(child: $0) }
        .task { await store.refresh() }
    }
}

// MARK: - Style (MoodPals green for main actions, soft fills, muted red for destructive)

enum BreakStyle {
    static let green = Color(red: 0.30, green: 0.73, blue: 0.50)
    static let amber = Color(red: 0.95, green: 0.65, blue: 0.44)
    static let red = Color(red: 0.84, green: 0.36, blue: 0.47)
    static let fill = Color.white.opacity(0.14)
}

struct BreakButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, destructive }
    var kind: Kind

    func makeBody(configuration: Configuration) -> some View {
        StyledLabel(configuration: configuration, kind: kind)
    }

    private struct StyledLabel: View {
        let configuration: ButtonStyleConfiguration
        let kind: Kind
        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            configuration.label
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Capsule().fill(fill))
                .opacity(!isEnabled ? 0.45 : configuration.isPressed ? 0.75 : 1)
                .contentShape(Capsule())
        }

        private var fill: Color {
            switch kind {
            case .primary: return BreakStyle.green
            case .secondary: return BreakStyle.fill
            case .destructive: return BreakStyle.red.opacity(0.85)
            }
        }
    }
}

// MARK: - Circular duration dial (Digital Crown or drag)

struct DurationDial: View {
    @Binding var minutes: Int
    let range: ClosedRange<Int>
    var step = 5
    var prefix = ""
    @State private var crown: Double = 0
    @FocusState private var focused: Bool

    private var fraction: Double {
        Double(minutes - range.lowerBound) / Double(max(1, range.upperBound - range.lowerBound))
    }
    private var hoursText: String {
        let h = minutes / 60, m = minutes % 60
        return h == 0 ? "min" : (m == 0 ? "\(h) hr" : "\(h) hr \(m) min")
    }

    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)
            let line = max(6, size * 0.075)
            ZStack {
                Circle().stroke(BreakStyle.fill, lineWidth: line)
                Circle()
                    .trim(from: 0, to: max(0.001, fraction))
                    .stroke(BreakStyle.green, style: StrokeStyle(lineWidth: line, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Circle()
                    .fill(Color.white)
                    .frame(width: line * 1.5, height: line * 1.5)
                    .offset(y: -(size - line) / 2)
                    .rotationEffect(.degrees(360 * fraction))
                VStack(spacing: 0) {
                    Text("\(prefix)\(minutes)")
                        .font(.system(size: size * 0.3, weight: .bold))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    Text(minutes >= 60 ? hoursText : "min")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .padding(.horizontal, line * 2)
            }
            .frame(width: size, height: size)
            .position(x: geo.size.width / 2, y: geo.size.height / 2)
            .contentShape(Circle())
            .gesture(DragGesture(minimumDistance: 4).onChanged { value in
                let dx = value.location.x - geo.size.width / 2, dy = geo.size.height / 2 - value.location.y
                var f = atan2(dx, dy) / (2 * .pi)
                if f < 0 { f += 1 }
                set(range.lowerBound + Int((f * Double(range.upperBound - range.lowerBound)).rounded()), haptic: true)
            })
        }
        .focusable()
        .focused($focused)
        .digitalCrownRotation($crown, from: Double(range.lowerBound), through: Double(range.upperBound), by: Double(step),
                              sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true)
        .onAppear { crown = Double(minutes); focused = true }
        .onChange(of: crown) { _, value in set(Int(value.rounded()), haptic: false) }
        .accessibilityElement()
        .accessibilityLabel("Duration")
        .accessibilityValue("\(prefix)\(minutes) minutes")
        .accessibilityAdjustableAction { direction in
            set(minutes + (direction == .increment ? step : -step), haptic: false)
        }
    }

    private func set(_ value: Int, haptic: Bool) {
        let snapped = min(range.upperBound, max(range.lowerBound, Int((Double(value) / Double(step)).rounded()) * step))
        if Int(crown.rounded()) != snapped { crown = Double(snapped) }
        guard snapped != minutes else { return }
        minutes = snapped
        // The crown plays its own detent haptics; drags get a light click.
        if haptic { WKInterfaceDevice.current().play(.click) }
    }
}

// MARK: - Lock

struct BreakLock: View {
    let locked: Bool
    var tint: Color = BreakStyle.green
    var size: CGFloat = 30
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var breathe = false

    var body: some View {
        Image(systemName: locked ? "lock.fill" : "lock.open.fill")
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(tint)
            .contentTransition(.symbolEffect(.replace))
            .scaleEffect(breathe ? 1.06 : 1)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.35), value: locked)
            .onAppear { startBreathing() }
            .onChange(of: locked) { _, _ in startBreathing() }
            .accessibilityHidden(true)
    }

    private func startBreathing() {
        guard !reduceMotion, locked else { breathe = false; return }
        withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) { breathe = true }
    }
}

// MARK: - Member screen

struct ScreenBreakControlView: View {
    let child: WatchBreakChild
    @ObservedObject private var store = WatchScreenBreakStore.shared
    @AppStorage("screenBreak.lastMinutes") private var lastMinutes = 30
    @State private var minutes = 30
    @State private var managing = false
    @State private var justEnded = false

    private var mine: WatchBreakSession? {
        guard let session = store.session, session.childId == child.id, session.isRunning else { return nil }
        return session
    }
    private var other: WatchBreakSession? {
        guard let session = store.session, session.childId != child.id, session.isRunning else { return nil }
        return session
    }

    var body: some View {
        Group {
            if justEnded {
                BreakEndedView()
            } else if let session = mine {
                ActiveBreakView(session: session) { managing = true }
            } else if let other {
                note("\(other.childName)'s Screen Break is running. One Screen Break runs at a time.")
            } else if !store.authorized || store.selectionCount == 0 {
                note("Finish Screen Break setup in MoodPals on your iPhone.")
            } else if !store.allowed {
                note("Your free trial has ended. Get MoodPals Plus on your iPhone to start a Screen Break.")
            } else {
                VStack(spacing: 6) {
                    DurationDial(minutes: $minutes, range: 5...180)
                    Button(store.pending == "start" ? "Starting…" : "Start Break") { start() }
                        .buttonStyle(BreakButtonStyle(kind: .primary))
                    StatusLine()
                }
                .disabled(store.pending != nil)
            }
        }
        .navigationTitle(child.name)
        .navigationDestination(isPresented: $managing) {
            ManageBreakView(child: child, close: { managing = false }, ended: finishEnd)
        }
        .onAppear { minutes = min(180, max(5, (lastMinutes / 5) * 5)) }
        .onChange(of: mine == nil) { _, gone in if gone { managing = false } }
        .task { await store.refresh() }
    }

    private func note(_ text: String) -> some View {
        ScrollView {
            VStack(spacing: 8) {
                Text(text).font(.footnote).multilineTextAlignment(.center)
                StatusLine()
            }
        }
    }

    private func start() {
        let chosen = minutes
        Task { @MainActor in
            if await store.command("start", childId: child.id, minutes: chosen) { lastMinutes = chosen }
        }
    }

    private func finishEnd() {
        managing = false
        justEnded = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) { justEnded = false }
    }
}

/// Waiting and error text shared by the Screen Break screens.
private struct StatusLine: View {
    @ObservedObject private var store = WatchScreenBreakStore.shared

    var body: some View {
        if store.pending != nil {
            HStack(spacing: 6) {
                ProgressView().frame(width: 16, height: 16)
                Text("Waiting for iPhone…").font(.caption2).foregroundStyle(.secondary)
            }
        } else if let error = store.error {
            Text(error).font(.caption2).foregroundStyle(BreakStyle.red).multilineTextAlignment(.center)
        }
    }
}

/// Countdown from the iPhone's deadline: correct after the app is closed and reopened, with no running timer.
private struct ActiveBreakView: View {
    let session: WatchBreakSession
    let onManage: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var closed = false

    var body: some View {
        TimelineView(.explicit([session.deadline])) { context in
            let timeUp = session.status == "restricted" || context.date >= session.deadline
            VStack(spacing: 4) {
                BreakLock(locked: closed, tint: timeUp ? BreakStyle.amber : BreakStyle.green)
                if timeUp {
                    Text("Time's Up").font(.title2.bold())
                    Text("Apps are paused on your iPhone.")
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                } else {
                    Text(timerInterval: min(context.date, session.deadline)...session.deadline, countsDown: true)
                        .font(.system(size: 34, weight: .bold))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .multilineTextAlignment(.center)
                    Text("Screen Break Active").font(.caption2).foregroundStyle(BreakStyle.green)
                }
                Spacer(minLength: 2)
                Button("Manage", action: onManage).buttonStyle(BreakButtonStyle(kind: .secondary))
            }
        }
        .onAppear {
            if reduceMotion { closed = true } else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { closed = true } }
        }
    }
}

private struct BreakEndedView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var open = false

    var body: some View {
        VStack(spacing: 6) {
            BreakLock(locked: !open, size: 36)
            Text("Break Ended").font(.headline)
            Text("Apps are open again.").font(.caption2).foregroundStyle(.secondary)
        }
        .onAppear {
            if reduceMotion { open = true } else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { open = true } }
        }
    }
}

private struct ManageBreakView: View {
    let child: WatchBreakChild
    let close: () -> Void
    let ended: () -> Void
    @ObservedObject private var store = WatchScreenBreakStore.shared
    @State private var adding = false
    @State private var confirming = false

    private var session: WatchBreakSession? {
        guard let session = store.session, session.childId == child.id, session.isRunning else { return nil }
        return session
    }

    var body: some View {
        VStack(spacing: 8) {
            Button("Add Time") { adding = true }.buttonStyle(BreakButtonStyle(kind: .primary))
            Button("End Break") { confirming = true }.buttonStyle(BreakButtonStyle(kind: .destructive))
            StatusLine()
        }
        .disabled(store.pending != nil)
        .navigationTitle("Manage")
        .navigationDestination(isPresented: $adding) { AddTimeView(child: child, done: close) }
        .confirmationDialog("End \(child.name)'s Screen Break?", isPresented: $confirming, titleVisibility: .visible) {
            Button("End Break", role: .destructive) { end() }
            Button("Keep Going", role: .cancel) {}
        } message: {
            Text("Paused apps open again on your iPhone.")
        }
    }

    /// Ends the session: stops the timer if time is left, or lifts the pause if time is up.
    private func end() {
        Task { @MainActor in
            for _ in 0..<2 {
                guard let current = session else { ended(); return }
                let action = current.status == "restricted" ? "release" : "cancel"
                if await store.command(action, childId: child.id) { ended(); return }
                // The iPhone may have just reached the deadline; retry once against the state it returned.
                guard let latest = session, latest.version != current.version || latest.status != current.status else { return }
                store.error = nil
            }
        }
    }
}

private struct AddTimeView: View {
    let child: WatchBreakChild
    let done: () -> Void
    @ObservedObject private var store = WatchScreenBreakStore.shared
    @State private var minutes = 15

    var body: some View {
        VStack(spacing: 6) {
            DurationDial(minutes: $minutes, range: 5...120, prefix: "+")
            Button(store.pending == "addTime" ? "Adding…" : "Add Time") { add() }
                .buttonStyle(BreakButtonStyle(kind: .primary))
            StatusLine()
        }
        .disabled(store.pending != nil)
        .navigationTitle("Add Time")
    }

    private func add() {
        let extra = minutes
        Task { @MainActor in if await store.command("addTime", childId: child.id, minutes: extra) { done() } }
    }
}
