import SwiftUI
import WidgetKit

private let appGroup = "group.com.superdotspals.wellnest"

struct StressSnapshot {
    var score: Int?
    var level: String
    var updated: Date?
    var energy: Int?
    var hrv: Int?

    // Written by the iPhone app (WidgetBridge.ts) after every Apple Health sync.
    static func load() -> StressSnapshot {
        // ExtensionStorage.set stores objects as JSON data.
        let defaults = UserDefaults(suiteName: appGroup)
        let values = (defaults?.data(forKey: "stressSnapshot")).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            ?? defaults?.dictionary(forKey: "stressSnapshot") ?? [:]
        func int(_ key: String) -> Int? {
            let n = (values[key] as? NSNumber)?.intValue ?? Int(values[key] as? String ?? "")
            return (n ?? -1) >= 0 ? n : nil
        }
        let updated = int("updated").flatMap { $0 > 0 ? Date(timeIntervalSince1970: TimeInterval($0)) : nil }
        let fresh = updated.map { Date().timeIntervalSince($0) < 24 * 3600 } ?? false
        return StressSnapshot(score: fresh ? int("score") : nil, level: fresh ? (values["level"] as? String ?? "") : "",
                              updated: updated, energy: int("energy"), hrv: int("hrv"))
    }
}

func stressColor(_ score: Int?) -> Color {
    guard let s = score else { return .gray }
    if s < 35 { return Color(red: 0.30, green: 0.73, blue: 0.50) }
    if s < 60 { return Color(red: 0.54, green: 0.61, blue: 0.94) }
    if s < 80 { return Color(red: 0.95, green: 0.65, blue: 0.44) }
    return Color(red: 0.93, green: 0.44, blue: 0.53)
}

struct StressEntry: TimelineEntry {
    let date: Date
    let snapshot: StressSnapshot
}

struct StressProvider: TimelineProvider {
    func placeholder(in context: Context) -> StressEntry {
        StressEntry(date: .now, snapshot: StressSnapshot(score: 28, level: "Great", updated: .now, energy: 74, hrv: 52))
    }
    func getSnapshot(in context: Context, completion: @escaping (StressEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : StressEntry(date: .now, snapshot: .load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<StressEntry>) -> Void) {
        completion(Timeline(entries: [StressEntry(date: .now, snapshot: .load())], policy: .after(.now.addingTimeInterval(1800))))
    }
}

struct StressWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: StressEntry

    var body: some View {
        let snap = entry.snapshot
        let color = stressColor(snap.score)
        switch family {
        case .accessoryCircular:
            Gauge(value: Double(snap.score ?? 0), in: 0...100) { Image(systemName: "heart.fill") } currentValueLabel: { Text(snap.score.map(String.init) ?? "–") }
                .gaugeStyle(.accessoryCircular)
        case .accessoryRectangular:
            VStack(alignment: .leading) {
                Text("Stress").font(.caption2).foregroundStyle(.secondary)
                Text(snap.score == nil ? "Open MoodPals" : snap.level).font(.headline)
                if let e = snap.energy { Text("Energy \(e)").font(.caption2) }
            }
        default:
            VStack(alignment: .leading, spacing: 6) {
                HStack { Image(systemName: "waveform.path.ecg").foregroundStyle(color); Text("Stress").font(.caption).bold().foregroundStyle(.secondary) }
                Text(snap.score == nil ? "Sync" : snap.level).font(.system(size: 30, weight: .heavy)).foregroundStyle(color).minimumScaleFactor(0.6)
                HStack(spacing: 4) {
                    ForEach(0..<4) { i in
                        Capsule().fill([Color(red: 0.93, green: 0.44, blue: 0.53), Color(red: 0.95, green: 0.65, blue: 0.44), Color(red: 0.54, green: 0.61, blue: 0.94), Color(red: 0.30, green: 0.73, blue: 0.50)][i]).frame(height: 6)
                    }
                }
                Spacer(minLength: 0)
                if family == .systemMedium, let hrv = snap.hrv { Text("HRV \(hrv) ms").font(.caption).foregroundStyle(.secondary) }
                Text(snap.energy.map { "Energy \($0)" } ?? "Open MoodPals to sync").font(.caption).foregroundStyle(.secondary)
                if let u = snap.updated { Text(u, style: .relative).font(.caption2).foregroundStyle(.tertiary) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

@main
struct StressWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MoodPalsStressWidget", provider: StressProvider()) { entry in
            StressWidgetView(entry: entry).containerBackground(Color(red: 0.89, green: 0.96, blue: 0.92), for: .widget)
        }
        .configurationDisplayName("Stress level")
        .description("Today's stress level and energy from your Apple Health readings.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}
