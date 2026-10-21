import SwiftUI
import WidgetKit

// Written by the watch app (WatchThemeSync.refresh) whenever it syncs.
struct WatchStressSnapshot {
    var score: Int?
    var label: String
    static func load() -> WatchStressSnapshot {
        let d = UserDefaults(suiteName: "group.com.superdotspals.wellnest.watch")
        let updated = d?.double(forKey: "stressUpdated") ?? 0
        let fresh = updated > 0 && Date().timeIntervalSince1970 - updated < 24 * 3600
        let score = d?.object(forKey: "stressScore") as? Int
        return WatchStressSnapshot(score: fresh ? score : nil, label: fresh ? (d?.string(forKey: "stressLabel") ?? "") : "")
    }
}

private func color(_ score: Int?) -> Color {
    guard let s = score else { return .gray }
    return s < 35 ? .green : s < 60 ? .blue : s < 80 ? .orange : .pink
}

struct ComplicationEntry: TimelineEntry { let date: Date; let snapshot: WatchStressSnapshot }

struct ComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> ComplicationEntry { ComplicationEntry(date: .now, snapshot: WatchStressSnapshot(score: 28, label: "Great")) }
    func getSnapshot(in context: Context, completion: @escaping (ComplicationEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : ComplicationEntry(date: .now, snapshot: .load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ComplicationEntry>) -> Void) {
        completion(Timeline(entries: [ComplicationEntry(date: .now, snapshot: .load())], policy: .after(.now.addingTimeInterval(1800))))
    }
}

struct ComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ComplicationEntry
    var body: some View {
        let s = entry.snapshot
        switch family {
        case .accessoryInline:
            Text(s.score == nil ? "Stress –" : "Stress \(s.label)")
        case .accessoryRectangular:
            VStack(alignment: .leading) {
                Text("MoodPals").font(.caption2).foregroundStyle(.secondary)
                Text(s.score == nil ? "Open to sync" : s.label).font(.headline).foregroundStyle(color(s.score))
                Gauge(value: Double(s.score ?? 0), in: 0...100) { EmptyView() }.gaugeStyle(.accessoryLinear).tint(color(s.score))
            }
        case .accessoryCorner:
            Image(systemName: "heart.fill").foregroundStyle(color(s.score))
                .widgetLabel { Gauge(value: Double(s.score ?? 0), in: 0...100) { Text("Stress") }.tint(color(s.score)) }
        default:
            Gauge(value: Double(s.score ?? 0), in: 0...100) { Image(systemName: "heart.fill") } currentValueLabel: { Text(s.score.map(String.init) ?? "–") }
                .gaugeStyle(.accessoryCircular).tint(color(s.score))
        }
    }
}

@main
struct StressComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MoodPalsStressComplication", provider: ComplicationProvider()) { entry in
            ComplicationView(entry: entry).containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Stress level")
        .description("Your latest MoodPals stress level.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .accessoryCorner])
    }
}
