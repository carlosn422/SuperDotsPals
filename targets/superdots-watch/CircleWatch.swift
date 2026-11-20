import SwiftUI
import WatchKit

/// One unread Circle item from `circle_watch_inbox`: a response to my shared mood or a Little Signal sent to me.
struct WatchReaction: Identifiable, Hashable {
    let id: String
    let kind: String
    /// Push `ref` for this item: shared mood id for responses, signal id for Little Signals.
    let refId: String
    /// Shared mood for responses; nil for Little Signals.
    let mood: String?
    let name: String
    let emoji: String
    let label: String?
    let at: Date

    var isSignal: Bool { kind == "signal" }
    /// Pending-read key; signals are prefixed so they're marked read with their own RPC.
    var readKey: String { isSignal ? "s:" + id : id }
    var subtitle: String { label ?? mood.map(MoodLabel.display) ?? (isSignal ? "Little Signal" : "Response") }
}

/// "+N more" bubble shown instead of animating every reaction in a large batch.
struct WatchReactionSummary: Equatable {
    let id = UUID()
    let emojis: [String]
    let count: Int
}

/// Unread Circle reactions on the watch. Polls only while the app is active; a reaction is marked read
/// when its floating animation finishes or when it is opened from the Circle list.
@MainActor
final class WatchCircleStore: ObservableObject {
    static let shared = WatchCircleStore()
    @Published private(set) var unread: [WatchReaction] = []
    /// Reaction currently floating over the home screen.
    @Published private(set) var floating: WatchReaction?
    /// Summary for the rest of a batch after `maxIndividualFloats`; those reactions stay unread.
    @Published private(set) var summary: WatchReactionSummary?
    /// Navigation inside the Circle sheet; set when a notification tap opens a specific item.
    @Published var path: [WatchReaction] = []
    /// Bumped when a notification tap asks the home screen to show Circle.
    @Published private(set) var openRequest = 0
    private var pendingOpenRef: String? {
        didSet { if pendingOpenRef == nil { openingFromNotification = false } }
    }
    /// True while a notification tap waits for its item, so the list shows a spinner instead of "All caught up".
    @Published private(set) var openingFromNotification = false

    /// True while the mood picker or a sheet covers the home screen; animations wait until it clears.
    var hold = false {
        didSet {
            guard hold != oldValue else { return }
            if hold { interruptFloating(requeue: true) } else { playNext() }
        }
    }

    static let fadeInDuration: TimeInterval = 0.25
    static let visibleDuration: TimeInterval = 2.6
    /// Time from appearing until the fade-out starts.
    static let floatDuration: TimeInterval = fadeInDuration + visibleDuration
    static let fadeDuration: TimeInterval = 0.35
    static let maxIndividualFloats = 3
    static let summaryVisibleDuration: TimeInterval = 4.0

    private struct PendingShare: Codable { let event: String; let mood: String; let at: Date }

    private let defaults = UserDefaults.standard
    private let knownKey = "circle.knownReactionIds"
    private let readsKey = "circle.pendingReactionReads"
    private let sharesKey = "circle.pendingMoodShares"
    private var sync: WatchThemeSync { .shared }

    private var active = false
    private var baselined = false
    private var queue: [WatchReaction] = []
    /// Individual floats played back to back in the current batch.
    private var batchPlayed = 0
    private var pollTask: Task<Void, Never>?
    private var floatTask: Task<Void, Never>?
    private var markedRead: Set<String> = []
    private var flushingReads = false
    private var flushingShares = false

    // Ids already seen (baseline, animated or opened) so the same notification never floats twice.
    private var known: [String] {
        get { defaults.stringArray(forKey: knownKey) ?? [] }
        set { defaults.set(Array(newValue.suffix(400)), forKey: knownKey) }
    }
    // Read acknowledgements not yet confirmed by the server.
    private var pendingReads: [String] {
        get { defaults.stringArray(forKey: readsKey) ?? [] }
        set { defaults.set(Array(newValue.suffix(200)), forKey: readsKey) }
    }
    private var pendingShares: [PendingShare] {
        get { (defaults.data(forKey: sharesKey)).flatMap { try? JSONDecoder().decode([PendingShare].self, from: $0) } ?? [] }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: sharesKey) }
    }

    /// Called with `scenePhase == .active` (and a connected account). Leaving active stops polling,
    /// drops the queue and abandons any floating reaction without marking it read.
    func setActive(_ value: Bool) {
        guard value != active else { return }
        NSLog("[WatchCircle] active=%d", value ? 1 : 0)
        active = value
        pollTask?.cancel()
        pollTask = nil
        if value {
            // The first fetch after opening is a baseline: reactions that arrived while closed never float.
            baselined = false
            pollTask = Task {
                while !Task.isCancelled {
                    await self.poll()
                    try? await Task.sleep(for: .seconds(10))
                }
            }
        } else {
            interruptFloating(requeue: false)
            queue.removeAll()
            batchPlayed = 0
        }
    }

    func poll() async {
        guard active, sync.connected else { return }
        await flushReads()
        await flushMoodShares()
        let rows: [WatchReaction]
        do {
            let data = try await sync.rpc("circle_watch_inbox", ["p_unread_only": true, "p_limit": 50])
            rows = Self.parse(data)
        } catch {
            NSLog("[WatchCircle] Inbox failed: %@", error.localizedDescription)
            return
        }
        guard active else { return }
        let acked = Set(pendingReads).union(markedRead)
        let fresh = rows.filter { !acked.contains($0.readKey) }
        unread = fresh
        let ids = Set(fresh.map(\.id))
        // Read elsewhere (e.g. on the iPhone) before it could float: never animate it.
        queue.removeAll { !ids.contains($0.id) }
        var seen = known
        let seenSet = Set(seen)
        let new = fresh.filter { !seenSet.contains($0.id) }
        if baselined {
            queue += new.sorted { $0.at < $1.at }
        }
        if !new.isEmpty { seen += new.map(\.id); known = seen }
        if !baselined || !new.isEmpty {
            NSLog("[WatchCircle] Inbox: %ld unread, %ld new%@", fresh.count, new.count, baselined ? "" : " (baseline)")
        }
        baselined = true
        playNext()
        if pendingOpenRef != nil { await resolvePendingOpen() }
    }

    private func playNext() {
        guard active, !hold, floating == nil, summary == nil, floatTask == nil else { return }
        guard !queue.isEmpty else { batchPlayed = 0; return }
        if batchPlayed >= Self.maxIndividualFloats {
            showSummary()
            return
        }
        let next = queue.removeFirst()
        batchPlayed += 1
        floating = next
        floatTask = Task {
            do {
                try await Task.sleep(for: .seconds(Self.floatDuration))
                self.floating = nil
                try await Task.sleep(for: .seconds(Self.fadeDuration + 0.05))
            } catch { return }
            self.floatTask = nil
            // Finished playing while the app stayed active: the reaction has been seen.
            guard self.active else { return }
            self.markRead(next)
            try? await Task.sleep(for: .seconds(0.3))
            self.playNext()
        }
    }

    /// Leaves the rest of the batch unread in Circle (never animated) behind one tappable summary bubble.
    private func showSummary() {
        let rest = queue
        queue.removeAll()
        var emojis: [String] = []
        for reaction in rest where emojis.count < 3 && !emojis.contains(reaction.emoji) { emojis.append(reaction.emoji) }
        summary = WatchReactionSummary(emojis: emojis, count: rest.count)
        floatTask = Task {
            do {
                try await Task.sleep(for: .seconds(Self.fadeInDuration + Self.summaryVisibleDuration))
                self.summary = nil
                try await Task.sleep(for: .seconds(Self.fadeDuration + 0.05))
            } catch { return }
            self.floatTask = nil
            self.batchPlayed = 0
            self.playNext()
        }
    }

    private func interruptFloating(requeue: Bool) {
        floatTask?.cancel()
        floatTask = nil
        if let current = floating, requeue {
            queue.insert(current, at: 0)
            batchPlayed = max(0, batchPlayed - 1)
        }
        floating = nil
        // A summary is not replayed; its reactions are still unread in Circle.
        if summary != nil {
            summary = nil
            batchPlayed = 0
        }
    }

    /// Marks one item read; the server call is retried until it succeeds.
    func markRead(_ item: WatchReaction) {
        let key = item.readKey
        guard !markedRead.contains(key) else { return }
        markedRead.insert(key)
        queue.removeAll { $0.id == item.id }
        unread.removeAll { $0.id == item.id }
        if !known.contains(item.id) { known = known + [item.id] }
        if !pendingReads.contains(key) { pendingReads = pendingReads + [key] }
        Task { await flushReads() }
    }

    /// Notification tap: show Circle, then the item the push was about once it's found.
    /// The ref is kept until found, so a cold launch resolves it after the account loads and the first poll runs.
    func openFromNotification(ref: String?) {
        path = []
        openRequest += 1
        pendingOpenRef = (ref?.isEmpty == false) ? ref : nil
        openingFromNotification = pendingOpenRef != nil
        Task {
            for _ in 0..<20 where pendingOpenRef != nil {
                if await resolvePendingOpen() { return }
                try? await Task.sleep(for: .seconds(1))
            }
            // Keep the ref so the first poll after a slow account load still opens it.
            openingFromNotification = false
        }
    }

    @discardableResult
    private func resolvePendingOpen() async -> Bool {
        guard let ref = pendingOpenRef else { return true }
        guard sync.connected else { return false }
        let match: (WatchReaction) -> Bool = { $0.id == ref || $0.refId == ref }
        var item = unread.first(where: match)
        if item == nil, let data = try? await sync.rpc("circle_watch_inbox", ["p_unread_only": false, "p_limit": 50]) {
            item = Self.parse(data).first(where: match)
            // Server answered without it: stop retrying.
            if item == nil { pendingOpenRef = nil; return true }
        }
        guard let item, pendingOpenRef == ref else { return false }
        pendingOpenRef = nil
        path = [item]
        return true
    }

    private func flushReads() async {
        let keys = pendingReads
        guard !keys.isEmpty, !flushingReads, sync.connected else { return }
        flushingReads = true
        defer { flushingReads = false }
        let signals = keys.filter { $0.hasPrefix("s:") }.map { String($0.dropFirst(2)) }
        let reactions = keys.filter { !$0.hasPrefix("s:") }
        do {
            if !reactions.isEmpty { _ = try await sync.rpc("circle_mark_reactions_read", ["p_ids": reactions]) }
            if !signals.isEmpty { _ = try await sync.rpc("circle_mark_signals_read", ["p_ids": signals]) }
            pendingReads = pendingReads.filter { !keys.contains($0) }
        } catch {
            NSLog("[WatchCircle] Read sync pending: %@", error.localizedDescription)
        }
    }

    /// A mood picked on the watch. Only the latest unsent change is kept; its event id makes retries idempotent.
    func recordMoodChange(_ mood: String, event: String = UUID().uuidString) {
        pendingShares = [PendingShare(event: event, mood: mood, at: Date())]
    }

    /// Shares queued watch moods with every Circle group that allows them (same recipients as the iPhone).
    func flushMoodShares() async {
        guard !flushingShares, sync.connected else { return }
        let fresh = pendingShares.filter { Date().timeIntervalSince($0.at) < 24 * 3600 }
        guard let share = fresh.first else {
            if !pendingShares.isEmpty { pendingShares = [] }
            return
        }
        flushingShares = true
        defer { flushingShares = false }
        do {
            _ = try await sync.rpc("circle_share_mood_auto", ["p_mood": share.mood, "p_event_id": share.event])
            pendingShares = pendingShares.filter { $0.event != share.event }
            NSLog("[WatchCircle] Shared %@ with Circle", share.mood)
        } catch {
            NSLog("[WatchCircle] Mood share pending: %@", error.localizedDescription)
        }
    }

    func reset() {
        setActive(false)
        unread = []
        path = []
        markedRead = []
        for key in [knownKey, readsKey, sharesKey] { defaults.removeObject(forKey: key) }
    }

    private static func parse(_ data: Data) -> [WatchReaction] {
        let rows = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []
        return rows.compactMap { row in
            guard let id = row["id"] as? String, let emoji = row["emoji"] as? String else { return nil }
            return WatchReaction(id: id,
                                 kind: row["kind"] as? String ?? "reaction",
                                 refId: row["ref_id"] as? String ?? id,
                                 mood: row["mood"] as? String,
                                 name: row["name"] as? String ?? "A friend",
                                 emoji: emoji,
                                 label: row["label"] as? String,
                                 at: WatchThemeSync.parseTimestamp(row["at"] as? String) ?? Date())
        }
    }
}

/// The emoji alone floats up the screen in a few swaying copies: no bubble and no name.
/// Who sent it and what it means are in Circle. Never takes touches.
struct FloatingReactionView: View {
    let reaction: WatchReaction

    var body: some View {
        FloatingEmojiBurst(emojis: [reaction.emoji], duration: WatchCircleStore.floatDuration + WatchCircleStore.fadeDuration)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(reaction.name): \(reaction.subtitle) \(reaction.emoji)")
    }
}

/// The rest of a large batch floats up together the same way; it stays unread in Circle.
struct FloatingSummaryView: View {
    let summary: WatchReactionSummary

    var body: some View {
        FloatingEmojiBurst(emojis: summary.emojis,
                           duration: WatchCircleStore.fadeInDuration + WatchCircleStore.summaryVisibleDuration + WatchCircleStore.fadeDuration)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(summary.count) more from your Circle")
    }
}

struct FloatingEmojiBurst: View {
    let emojis: [String]
    let duration: TimeInterval
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start = Date()
    @State private var particles: [Particle] = []

    private struct Particle {
        let emoji: String
        let x: CGFloat
        let delay: Double
        let size: CGFloat
        let sway: CGFloat
        let phase: Double
    }

    var body: some View {
        GeometryReader { geo in
            if reduceMotion {
                Text(emojis.first ?? "")
                    .font(.system(size: 56))
                    .position(x: geo.size.width / 2, y: geo.size.height / 2)
                    .modifier(FloatIn(duration: duration))
            } else {
                TimelineView(.animation) { context in
                    let t = context.date.timeIntervalSince(start)
                    ZStack {
                        ForEach(particles.indices, id: \.self) { i in
                            let p = particles[i]
                            let local = max(0, t - p.delay)
                            let progress = CGFloat(min(1, local / max(0.5, duration - p.delay)))
                            let travel = geo.size.height + p.size * 2
                            let fade: CGFloat = local <= 0 ? 0 : progress < 0.12 ? progress / 0.12 : progress > 0.7 ? max(0, (1 - progress) / 0.3) : 1
                            Text(p.emoji)
                                .font(.system(size: p.size))
                                .scaleEffect(0.7 + 0.3 * min(1, progress * 4))
                                .position(x: geo.size.width * p.x + CGFloat(sin(local * 2.6 + p.phase)) * p.sway,
                                          y: geo.size.height + p.size - progress * travel)
                                .opacity(Double(fade))
                        }
                    }
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .onAppear {
            start = Date()
            // Three fixed lanes, a new emoji every 0.3 s cycling through them, so copies never overlap:
            // neighbours are a third of the screen apart and the same lane only repeats 0.9 s later.
            let lanes: [CGFloat] = [0.22, 0.5, 0.78]
            var order = lanes.shuffled()
            particles = (0..<6).map { i in
                if i > 0 && i % lanes.count == 0 {
                    let last = order.last
                    repeat { order.shuffle() } while order.first == last
                }
                return Particle(emoji: emojis[i % max(1, emojis.count)],
                                x: order[i % lanes.count],
                                delay: Double(i) * 0.3,
                                size: CGFloat.random(in: 26...34),
                                sway: 4,
                                phase: Double.random(in: 0...(2 * .pi)))
            }
        }
    }
}

/// Fades in while growing from 0.85 and drifts up 10pt; Reduce Motion fades only.
private struct FloatIn: ViewModifier {
    let duration: TimeInterval
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false
    @State private var risen = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(reduceMotion || shown ? 1 : 0.85)
            .opacity(shown ? 1 : 0)
            .offset(y: reduceMotion ? 0 : (risen ? -10 : 0))
            .onAppear {
                withAnimation(.easeOut(duration: WatchCircleStore.fadeInDuration)) { shown = true }
                guard !reduceMotion else { return }
                withAnimation(.easeOut(duration: duration)) { risen = true }
            }
    }
}

/// Small home-screen button that opens the read-only Circle list.
struct CircleButton: View {
    let unread: Int
    let accent: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "person.2.fill")
                .font(.system(size: 10, weight: .semibold))
                .frame(width: 26, height: 26)
                .background(Circle().fill(accent.opacity(0.35)))
                .overlay(alignment: .topTrailing) {
                    if unread > 0 {
                        Text(unread > 9 ? "9+" : "\(unread)")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 3)
                            .frame(minWidth: 14, minHeight: 14)
                            .background(Capsule().fill(Color.red))
                            .offset(x: 5, y: -4)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(unread > 0 ? "Circle, \(unread) unread" : "Circle")
    }
}

/// Unread responses and Little Signals (opened or floated ones drop out), plus friends' moods to respond to.
/// Family watches only read: they get no Moods section.
struct WatchCircleList: View {
    @ObservedObject private var circle = WatchCircleStore.shared
    @ObservedObject private var replies = WatchMoodReplies.shared

    var body: some View {
        Group {
            if circle.openingFromNotification {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if circle.unread.isEmpty && replies.moods.isEmpty {
                VStack(spacing: 4) {
                    Text("All caught up! 💚").font(.headline)
                    Text("No new signals or responses.").font(.caption2).foregroundStyle(.secondary)
                }
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    if !circle.unread.isEmpty {
                        Section("New") {
                            ForEach(circle.unread) { reaction in
                                NavigationLink(value: reaction) {
                                    HStack(spacing: 6) {
                                        VStack(alignment: .leading, spacing: 1) {
                                            Text(reaction.name)
                                                .font(.system(size: 15, weight: .semibold))
                                                .lineLimit(1)
                                            Text("\(reaction.subtitle) · \(Self.ago(reaction.at))")
                                                .font(.system(size: 11))
                                                .foregroundStyle(.secondary)
                                                .lineLimit(1)
                                        }
                                        Spacer(minLength: 2)
                                        Text(reaction.emoji).font(.system(size: 22))
                                    }
                                }
                                .accessibilityLabel("\(reaction.name) \(reaction.emoji), \(reaction.subtitle), \(Self.ago(reaction.at))")
                            }
                        }
                    }
                    if !replies.moods.isEmpty {
                        Section("Moods") {
                            ForEach(replies.moods) { mood in
                                // The stack's path is typed [WatchReaction], so a value link for a mood would be ignored.
                                NavigationLink {
                                    WatchMoodReplyView(mood: mood)
                                } label: {
                                    HStack(spacing: 6) {
                                        VStack(alignment: .leading, spacing: 1) {
                                            Text(mood.name)
                                                .font(.system(size: 15, weight: .semibold))
                                                .lineLimit(1)
                                            Text("\(MoodLabel.display(mood.mood)) · \(Self.ago(mood.sharedAt))")
                                                .font(.system(size: 11))
                                                .foregroundStyle(.secondary)
                                                .lineLimit(1)
                                        }
                                        Spacer(minLength: 2)
                                        if let mine = mood.myEmoji {
                                            Text(mine).font(.system(size: 22))
                                        } else {
                                            Image(systemName: "face.smiling").foregroundStyle(.secondary)
                                        }
                                    }
                                }
                                .accessibilityLabel("\(mood.name) is feeling \(MoodLabel.display(mood.mood)). \(mood.myEmoji == nil ? "Respond" : "You responded \(mood.myEmoji!)")")
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Circle")
        .navigationDestination(for: WatchReaction.self) { WatchReactionDetail(reaction: $0) }
        .task { await replies.refresh() }
    }

    static func ago(_ date: Date, now: Date = Date()) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(date)))
        if seconds < 60 { return "now" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)d"
    }
}

struct WatchReactionDetail: View {
    let reaction: WatchReaction

    var body: some View {
        ScrollView {
            VStack(spacing: 4) {
                Text(reaction.name).font(.headline).lineLimit(1)
                Text(reaction.emoji).font(.system(size: 36))
                if let label = reaction.label {
                    Text(label).font(.system(size: 15, weight: .semibold, design: .rounded))
                        .multilineTextAlignment(.center)
                }
                if let mood = reaction.mood {
                    AnimatedMoodMascot(mood: mood, size: 70)
                        .frame(width: 70, height: 70)
                    Text("Your \(MoodLabel.display(mood).lowercased()) mood").font(.caption2).foregroundStyle(.secondary)
                } else {
                    Text("Little Signal").font(.caption2).foregroundStyle(.secondary)
                }
                Text(reaction.at, style: .relative).font(.caption2).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
        }
        .onAppear { WatchCircleStore.shared.markRead(reaction) }
    }
}


// MARK: - Respond to a friend's mood (own watch only; family watches can't respond)

struct WatchFriendMood: Identifiable, Hashable {
    let id: String
    let name: String
    let mood: String
    let sharedAt: Date
    var myEmoji: String?
}

/// Mirrors MOOD_REACTIONS / PLUS_MOOD_REACTIONS / REACTION_LABELS in LittleSignalsData.ts.
enum WatchMoodReactions {
    static let free: [String: [String]] = [
        "Joyful": ["❤️", "🫶", "💪", "🫂"], "Calm": ["❤️", "🫶", "🌿", "🫂"], "Sad": ["❤️", "🫂", "🫶", "🌿"],
        "Angry": ["🫂", "🫶", "🌿", "❤️"], "Anxious": ["🫂", "🌿", "🫶", "❤️"], "Tired": ["🌙", "🫂", "❤️", "🫶"],
    ]
    static let plusExtra: [String: [String]] = [
        "Joyful": ["🤩", "🥳", "🎉", "🔥", "🌟", "🙌", "💃", "🌈"],
        "Calm": ["🪷", "🧘", "🌊", "🍃", "🕊️", "☁️", "🌸", "😌"],
        "Sad": ["💙", "🤗", "🧸", "🌻", "🌈", "🕯️", "💐", "☕"],
        "Angry": ["🧊", "🌬️", "🫧", "🤝", "🧘", "🌊", "🦾", "🕊️"],
        "Anxious": ["🦋", "🌬️", "🫧", "🤝", "🧘", "☁️", "🐢", "🍵"],
        "Tired": ["😴", "💤", "🛌", "🦥", "☕", "🍵", "🌌", "⭐"],
    ]
    static let labels: [String: String] = [
        "❤️": "Thinking of you", "🫶": "Here for you", "💪": "You've got this", "🫂": "Sending a hug", "🌿": "Take a breath",
        "🌙": "Rest well", "🤩": "You're amazing", "🥳": "Celebrating with you", "🎉": "So happy for you", "🔥": "You're on fire",
        "🌟": "Proud of you", "🙌": "Love this", "💃": "Dance it out", "🌈": "Better days ahead", "🪷": "Inner peace",
        "🧘": "Stay centered", "🌊": "Go with the flow", "🍃": "Peace to you", "🕊️": "Sending peace", "☁️": "Take it easy",
        "🌸": "So peaceful", "😌": "Love this calm", "💙": "You're not alone", "🤗": "Sending a hug", "🧸": "Sending comfort",
        "🌻": "Brighter days ahead", "🕯️": "Holding space for you", "💐": "Flowers for you", "☕": "Coffee's on me",
        "🧊": "Cool down", "🌬️": "Breathe it out", "🫧": "Let it go", "🤝": "I've got your back", "🦾": "Stronger than this",
        "🦋": "You'll get through this", "🐢": "One step at a time", "🍵": "Tea time", "😴": "Get some sleep", "💤": "Sweet dreams",
        "🛌": "Rest up", "🦥": "Slow down", "🌌": "Peaceful night", "⭐": "You did enough today",
    ]
    static func free(for mood: String) -> [String] { free[mood] ?? free["Calm"]! }
    static func plus(for mood: String) -> [String] { plusExtra[mood] ?? plusExtra["Calm"]! }
}

@MainActor
final class WatchMoodReplies: ObservableObject {
    static let shared = WatchMoodReplies()
    @Published private(set) var moods: [WatchFriendMood] = []
    @Published private(set) var plus = false
    @Published private(set) var sending: String?
    private var sync: WatchThemeSync { .shared }

    func refresh() async {
        guard !sync.moodOnly, sync.connected, !sync.accountId.isEmpty else { moods = []; return }
        let uid = sync.accountId
        let now = ISO8601DateFormatter().string(from: Date())
        do {
            async let shared = sync.restRequest("/rest/v1/circle_shared_moods?select=id,owner_id,mood,shared_at&owner_id=neq.\(uid)&stopped_at=is.null&expires_at=gt.\(now)&order=shared_at.desc&limit=30", method: "GET")
            async let mine = sync.restRequest("/rest/v1/circle_reactions?select=shared_mood_id,emoji&reactor_id=eq.\(uid)", method: "GET")
            async let friends = sync.rpc("circle_friends", [:])
            async let family = sync.rpc("circle_family_names", [:])
            async let entitlement = sync.restRequest("/rest/v1/plus_entitlements?select=is_active,expires_at&user_id=eq.\(uid)&limit=1", method: "GET")
            let (sharedData, mineData, friendData, familyData, plusData) = try await (shared, mine, friends, family, entitlement)
            var names: [String: String] = [:]
            for row in Self.rows(familyData) { if let id = row["profile_id"] as? String, let n = row["display_name"] as? String { names[id] = n } }
            for row in Self.rows(friendData) { if let id = row["friend_id"] as? String, let n = row["display_name"] as? String { names[id] = n } }
            var reacted: [String: String] = [:]
            for row in Self.rows(mineData) { if let id = row["shared_mood_id"] as? String, let e = row["emoji"] as? String { reacted[id] = e } }
            moods = Self.rows(sharedData).compactMap { row in
                guard let id = row["id"] as? String, let mood = row["mood"] as? String else { return nil }
                let owner = row["owner_id"] as? String ?? ""
                return WatchFriendMood(id: id, name: names[owner] ?? "A friend", mood: mood,
                                       sharedAt: WatchThemeSync.parseTimestamp(row["shared_at"] as? String) ?? Date(),
                                       myEmoji: reacted[id])
            }
            plus = Self.rows(plusData).contains { row in
                guard row["is_active"] as? Bool == true else { return false }
                guard let expires = WatchThemeSync.parseTimestamp(row["expires_at"] as? String) else { return true }
                return expires > Date()
            }
        } catch {
            NSLog("[WatchCircle] Moods failed: %@", error.localizedDescription)
        }
    }

    /// Same upsert as the iPhone; the server checks the emoji is allowed for this account (free list or Plus).
    func react(_ mood: WatchFriendMood, emoji: String) async -> Bool {
        guard sending == nil, !sync.moodOnly else { return false }
        sending = mood.id
        defer { sending = nil }
        let row: [String: Any] = ["shared_mood_id": mood.id, "reactor_id": sync.accountId, "emoji": emoji, "style": "standard",
                                  "updated_at": ISO8601DateFormatter().string(from: Date())]
        do {
            let body = try JSONSerialization.data(withJSONObject: [row])
            _ = try await sync.restRequest("/rest/v1/circle_reactions?on_conflict=shared_mood_id,reactor_id", method: "POST", body: body,
                                           headers: ["Prefer": "resolution=merge-duplicates,return=minimal"])
            if let i = moods.firstIndex(where: { $0.id == mood.id }) { moods[i].myEmoji = emoji }
            return true
        } catch {
            NSLog("[WatchCircle] Reaction failed: %@", error.localizedDescription)
            return false
        }
    }

    private static func rows(_ data: Data) -> [[String: Any]] {
        (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []
    }
}

struct WatchMoodReplyView: View {
    let mood: WatchFriendMood
    @ObservedObject private var replies = WatchMoodReplies.shared
    @Environment(\.dismiss) private var dismiss
    @State private var note: String?

    private var current: String? { replies.moods.first { $0.id == mood.id }?.myEmoji ?? mood.myEmoji }
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 3)

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                AnimatedMoodMascot(mood: mood.mood, size: 54).frame(width: 54, height: 54)
                Text("\(mood.name) · \(MoodLabel.display(mood.mood))")
                    .font(.footnote.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                LazyVGrid(columns: columns, spacing: 6) {
                    ForEach(WatchMoodReactions.free(for: mood.mood), id: \.self) { cell($0, locked: false) }
                    ForEach(WatchMoodReactions.plus(for: mood.mood), id: \.self) { cell($0, locked: !replies.plus) }
                }
                if let note {
                    Text(note).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
            }
        }
        .navigationTitle("Respond")
    }

    private func cell(_ emoji: String, locked: Bool) -> some View {
        Button { send(emoji, locked: locked) } label: {
            Text(emoji)
                .font(.system(size: 26))
                .opacity(locked ? 0.4 : 1)
                .frame(maxWidth: .infinity, minHeight: 42)
                .background(RoundedRectangle(cornerRadius: 12)
                    .fill(current == emoji ? Color(red: 0.30, green: 0.73, blue: 0.50).opacity(0.4) : Color.white.opacity(0.12)))
                .overlay(alignment: .topTrailing) {
                    if locked {
                        Image(systemName: "lock.fill").font(.system(size: 8, weight: .bold)).padding(4).foregroundStyle(.white.opacity(0.8))
                    }
                }
        }
        .buttonStyle(.plain)
        .disabled(replies.sending != nil)
        .accessibilityLabel((WatchMoodReactions.labels[emoji] ?? emoji) + (locked ? ", Plus" : ""))
    }

    private func send(_ emoji: String, locked: Bool) {
        if locked {
            WKInterfaceDevice.current().play(.failure)
            note = "Get MoodPals Plus on your iPhone for 12 emojis for every mood."
            return
        }
        Task { @MainActor in
            if await replies.react(mood, emoji: emoji) {
                WKInterfaceDevice.current().play(.success)
                note = "Sent \(emoji)"
                try? await Task.sleep(for: .seconds(0.8))
                dismiss()
            } else {
                WKInterfaceDevice.current().play(.failure)
                note = "Couldn't send. Check your connection and try again."
            }
        }
    }
}
