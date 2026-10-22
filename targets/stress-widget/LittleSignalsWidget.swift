import SwiftUI
import WidgetKit

private let circleAppGroup = "group.com.superdotspals.wellnest"

struct CircleSignal: Hashable {
    var name: String
    var initials: String
    var color: Color
    var emoji: String
    var label: String
    var at: Date?
}

struct CircleSnapshot {
    var signals: [CircleSignal]
    var unseen: Int
    var todayCount: Int
    var friendCount: Int
    var hideMood: Bool
    var mascot: String
    var moodLabel: String

    static let empty = CircleSnapshot(signals: [], unseen: 0, todayCount: 0, friendCount: 0, hideMood: true, mascot: "mascot_disgust", moodLabel: "")

    // Written by the iPhone app (WidgetBridge.ts publishCircleSnapshot) whenever My Circle refreshes.
    static func load() -> CircleSnapshot {
        let defaults = UserDefaults(suiteName: circleAppGroup)
        guard let values = (defaults?.data(forKey: "circleSnapshot")).flatMap({ try? JSONSerialization.jsonObject(with: $0) as? [String: Any] })
            ?? defaults?.dictionary(forKey: "circleSnapshot") else { return .empty }
        func int(_ key: String) -> Int { (values[key] as? NSNumber)?.intValue ?? 0 }
        let showNames = (values["showNames"] as? NSNumber)?.boolValue ?? true
        let signals = (values["signals"] as? [[String: Any]] ?? []).map { s -> CircleSignal in
            let at = (s["at"] as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue) }
            return CircleSignal(name: showNames ? (s["name"] as? String ?? "A friend") : "Someone",
                                initials: showNames ? (s["initials"] as? String ?? "?") : "♥",
                                color: Color(hex: s["color"] as? String ?? "") ?? Color(red: 0.48, green: 0.78, blue: 0.64),
                                emoji: s["emoji"] as? String ?? "💚", label: s["label"] as? String ?? "", at: at)
        }
        let hideMood = (values["hideMood"] as? NSNumber)?.boolValue ?? true
        let mood = values["mood"] as? String ?? ""
        return CircleSnapshot(signals: signals, unseen: int("unseen"), todayCount: int("todayCount"), friendCount: int("friendCount"),
                              hideMood: hideMood, mascot: (!hideMood && !mood.isEmpty) ? (values["mascot"] as? String ?? "mascot_disgust") : "mascot_disgust",
                              moodLabel: hideMood ? "" : mood)
    }
}

extension Color {
    init?(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
}

struct CircleEntry: TimelineEntry {
    let date: Date
    let snapshot: CircleSnapshot
}

struct CircleProvider: TimelineProvider {
    func placeholder(in context: Context) -> CircleEntry {
        CircleEntry(date: .now, snapshot: CircleSnapshot(
            signals: [CircleSignal(name: "Jamie", initials: "J", color: Color(red: 0.48, green: 0.78, blue: 0.64), emoji: "🤗", label: "Sending a hug", at: .now),
                      CircleSignal(name: "Mom", initials: "M", color: Color(red: 0.72, green: 0.61, blue: 0.92), emoji: "☀️", label: "Sending sunshine", at: .now)],
            unseen: 2, todayCount: 2, friendCount: 4, hideMood: true, mascot: "mascot_disgust", moodLabel: ""))
    }
    func getSnapshot(in context: Context, completion: @escaping (CircleEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : CircleEntry(date: .now, snapshot: .load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<CircleEntry>) -> Void) {
        completion(Timeline(entries: [CircleEntry(date: .now, snapshot: .load())], policy: .after(.now.addingTimeInterval(1800))))
    }
}

private let ink = Color(red: 0.11, green: 0.17, blue: 0.20)
private let mint = Color(red: 0.20, green: 0.70, blue: 0.49)

struct CircleAvatar: View {
    let signal: CircleSignal
    var size: CGFloat = 26
    var body: some View {
        Text(signal.initials).font(.system(size: size * 0.45, weight: .heavy)).foregroundStyle(.white)
            .frame(width: size, height: size).background(Circle().fill(signal.color))
    }
}

struct LittleSignalsSmallView: View {
    let snap: CircleSnapshot
    var body: some View {
        if let s = snap.signals.first {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    CircleAvatar(signal: s)
                    Text(s.name).font(.caption).bold().foregroundStyle(ink).lineLimit(1)
                    Spacer(minLength: 0)
                    if snap.unseen > 0 { Text("\(snap.unseen)").font(.caption2).bold().foregroundStyle(.white).padding(.horizontal, 6).padding(.vertical, 2).background(Capsule().fill(mint)) }
                }
                Spacer(minLength: 0)
                Text(s.emoji).font(.system(size: 38))
                Text(s.label).font(.caption).bold().foregroundStyle(ink).lineLimit(2)
                if let at = s.at { Text(at, style: .relative).font(.caption2).foregroundStyle(.secondary) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text("Little Signals").font(.caption).bold().foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Text("🫶").font(.system(size: 38))
                Text(snap.friendCount > 0 ? "Send a little support" : "Invite someone to your circle").font(.caption).bold().foregroundStyle(ink).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct LittleSignalsMediumView: View {
    let snap: CircleSnapshot
    var body: some View {
        HStack(spacing: 10) {
            VStack(spacing: 2) {
                Image(snap.mascot).resizable().scaledToFit().frame(width: 84, height: 84)
                Text(snap.moodLabel.isEmpty ? "My Circle" : "You · \(snap.moodLabel)").font(.caption2).bold().foregroundStyle(.secondary).lineLimit(1)
            }
            .frame(width: 96)
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text("Little Signals").font(.caption).bold().foregroundStyle(ink)
                    Spacer(minLength: 0)
                    if snap.todayCount > 0 { Text("\(snap.todayCount) today").font(.caption2).foregroundStyle(.secondary) }
                }
                if snap.signals.isEmpty {
                    Text("No signals yet").font(.caption).foregroundStyle(.secondary)
                } else {
                    ForEach(snap.signals.prefix(3), id: \.self) { s in
                        HStack(spacing: 6) {
                            Text(s.emoji).font(.system(size: 15))
                            Text("\(s.name) · \(s.label)").font(.caption).foregroundStyle(ink).lineLimit(1)
                        }
                    }
                }
                Spacer(minLength: 0)
                HStack(spacing: 6) {
                    Link(destination: URL(string: "wellnest://circle/send")!) {
                        Text("❤️ Send").font(.caption2).bold().foregroundStyle(mint).padding(.horizontal, 10).padding(.vertical, 5).background(Capsule().fill(mint.opacity(0.15)))
                    }
                    Link(destination: URL(string: "wellnest://circle/today")!) {
                        Text("Open").font(.caption2).bold().foregroundStyle(mint).padding(.horizontal, 10).padding(.vertical, 5).background(Capsule().fill(mint.opacity(0.15)))
                    }
                }
            }
        }
    }
}

struct LittleSignalsWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CircleEntry
    var body: some View {
        switch family {
        case .systemMedium: LittleSignalsMediumView(snap: entry.snapshot)
        default: LittleSignalsSmallView(snap: entry.snapshot)
        }
    }
}

struct LittleSignalsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MoodPalsLittleSignals", provider: CircleProvider()) { entry in
            LittleSignalsWidgetView(entry: entry)
                .containerBackground(.white, for: .widget)
                .widgetURL(URL(string: "wellnest://circle/today"))
        }
        .configurationDisplayName("Little Signals")
        .description("The latest Little Signals from your circle.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
