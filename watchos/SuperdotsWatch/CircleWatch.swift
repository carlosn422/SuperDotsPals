import SwiftUI

/// A Circle member's emoji reaction to one of my shared moods (`circle_reaction_inbox`).
struct WatchReaction: Identifiable, Hashable {
    let id: String
    let mood: String
    let name: String
    let emoji: String
    let at: Date
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

    /// True while the mood picker or a sheet covers the home screen; animations wait until it clears.
    var hold = false {
        didSet {
            guard hold != oldValue else { return }
            if hold { interruptFloating(requeue: true) } else { playNext() }
        }
    }

    static let fadeInDuration: TimeInterval = 0.25
    static let visibleDuration: TimeInterval = 2.0
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
            let data = try await sync.rpc("circle_reaction_inbox", ["p_unread_only": true, "p_limit": 50])
            rows = Self.parse(data)
        } catch {
            NSLog("[WatchCircle] Inbox failed: %@", error.localizedDescription)
            return
        }
        guard active else { return }
        let acked = Set(pendingReads).union(markedRead)
        let fresh = rows.filter { !acked.contains($0.id) }
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
            self.markRead(next.id)
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

    /// Marks one reaction read; the server call is retried until it succeeds.
    func markRead(_ id: String) {
        guard !markedRead.contains(id) else { return }
        markedRead.insert(id)
        queue.removeAll { $0.id == id }
        unread.removeAll { $0.id == id }
        if !known.contains(id) { known = known + [id] }
        if !pendingReads.contains(id) { pendingReads = pendingReads + [id] }
        Task { await flushReads() }
    }

    private func flushReads() async {
        let ids = pendingReads
        guard !ids.isEmpty, !flushingReads, sync.connected else { return }
        flushingReads = true
        defer { flushingReads = false }
        do {
            _ = try await sync.rpc("circle_mark_reactions_read", ["p_ids": ids])
            pendingReads = pendingReads.filter { !ids.contains($0) }
        } catch {
            NSLog("[WatchCircle] Read sync pending: %@", error.localizedDescription)
        }
    }

    /// A mood picked on the watch. Only the latest unsent change is kept; its event id makes retries idempotent.
    func recordMoodChange(_ mood: String) {
        pendingShares = [PendingShare(event: UUID().uuidString, mood: mood, at: Date())]
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
        markedRead = []
        for key in [knownKey, readsKey, sharesKey] { defaults.removeObject(forKey: key) }
    }

    private static func parse(_ data: Data) -> [WatchReaction] {
        let rows = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []
        return rows.compactMap { row in
            guard let id = row["id"] as? String, let emoji = row["emoji"] as? String else { return nil }
            return WatchReaction(id: id,
                                 mood: row["mood"] as? String ?? "Calm",
                                 name: row["reactor_name"] as? String ?? "A friend",
                                 emoji: emoji,
                                 at: WatchThemeSync.parseTimestamp(row["reacted_at"] as? String) ?? Date())
        }
    }
}

/// Round glass bubble with the sender's name and emoji, floating briefly over the home screen. Never takes touches.
struct FloatingReactionView: View {
    let reaction: WatchReaction

    var body: some View {
        VStack(spacing: 1) {
            Text(reaction.name)
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(maxWidth: GlassBubble.size - 22)
            Text(reaction.emoji)
                .font(.system(size: 44))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(width: GlassBubble.size, height: GlassBubble.size)
        .background(GlassBubble())
        .modifier(FloatIn(duration: WatchCircleStore.floatDuration + WatchCircleStore.fadeDuration))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .offset(y: -34)
        .allowsHitTesting(false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(reaction.name) reacted \(reaction.emoji)")
    }
}

/// Same bubble for the rest of a large batch; tapping it opens Circle.
struct FloatingSummaryView: View {
    let summary: WatchReactionSummary
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            VStack(spacing: 1) {
                Text(summary.emojis.joined(separator: " "))
                    .font(.system(size: 17))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(maxWidth: GlassBubble.size - 18)
                Text("+\(summary.count) more")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text("Open Circle")
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundStyle(.white.opacity(0.75))
                    .lineLimit(1)
            }
            .frame(width: GlassBubble.size, height: GlassBubble.size)
            .background(GlassBubble())
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .modifier(FloatIn(duration: WatchCircleStore.fadeInDuration + WatchCircleStore.summaryVisibleDuration + WatchCircleStore.fadeDuration))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .offset(y: -34)
        .accessibilityLabel("\(summary.count) more reactions. Open Circle.")
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

private struct GlassBubble: View {
    static let tint = Color(red: 0.56, green: 0.40, blue: 1.0)
    static let size: CGFloat = 100

    var body: some View {
        ZStack {
            Circle().fill(.ultraThinMaterial)
            Circle().fill(RadialGradient(colors: [Self.tint.opacity(0.22), Self.tint.opacity(0.5)],
                                         center: .center, startRadius: 0, endRadius: Self.size / 2))
            // Soft glass highlight in the upper left.
            Ellipse()
                .fill(LinearGradient(colors: [.white.opacity(0.35), .white.opacity(0)], startPoint: .top, endPoint: .bottom))
                .frame(width: Self.size * 0.42, height: Self.size * 0.24)
                .rotationEffect(.degrees(-30))
                .offset(x: -Self.size * 0.18, y: -Self.size * 0.27)
            Circle().strokeBorder(LinearGradient(colors: [.white.opacity(0.85), Self.tint.opacity(0.9)],
                                                 startPoint: .topLeading, endPoint: .bottomTrailing),
                                  lineWidth: 1.5)
        }
        .compositingGroup()
        .shadow(color: Self.tint.opacity(0.75), radius: 9)
        .shadow(color: Self.tint.opacity(0.35), radius: 18)
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

/// Unread reactions only; opened or floated ones drop out. Read-only: no replies on Apple Watch.
struct WatchCircleList: View {
    @ObservedObject private var circle = WatchCircleStore.shared

    var body: some View {
        Group {
            if circle.unread.isEmpty {
                VStack(spacing: 4) {
                    Text("All caught up! 💚").font(.headline)
                    Text("No unread responses.").font(.caption2).foregroundStyle(.secondary)
                }
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(circle.unread) { reaction in
                    NavigationLink(value: reaction) {
                        HStack(spacing: 6) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(reaction.name)
                                    .font(.system(size: 15, weight: .semibold))
                                    .lineLimit(1)
                                Text("\(reaction.mood) · \(Self.ago(reaction.at))")
                                    .font(.system(size: 11))
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 2)
                            Text(reaction.emoji).font(.system(size: 22))
                        }
                    }
                    .accessibilityLabel("\(reaction.name) \(reaction.emoji), \(reaction.mood), \(Self.ago(reaction.at))")
                }
            }
        }
        .navigationTitle("Circle")
        .navigationDestination(for: WatchReaction.self) { WatchReactionDetail(reaction: $0) }
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
                AnimatedMoodMascot(mood: reaction.mood, size: 70)
                    .frame(width: 70, height: 70)
                Text(reaction.mood).font(.caption2).foregroundStyle(.secondary)
                Text(reaction.at, style: .relative).font(.caption2).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
        }
        .onAppear { WatchCircleStore.shared.markRead(reaction.id) }
    }
}
