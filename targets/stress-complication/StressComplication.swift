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
        guard fresh, let score else { return WatchStressSnapshot(score: nil, label: "") }
        return WatchStressSnapshot(score: score, label: stressLabel(score))
    }
}

// Same bands as StressEngine.ts / the watch app.
private func stressLabel(_ score: Int) -> String {
    score < 35 ? "Great" : score < 60 ? "Normal" : score < 80 ? "Elevated" : "Overload"
}

private func color(_ score: Int?) -> Color {
    guard let s = score else { return .gray }
    return s < 35 ? .green : s < 60 ? .blue : s < 80 ? .orange : .pink
}

// Theme picked on the iPhone or watch (WatchTheme.swift), shared through the App Group.
struct ComplicationTheme {
    var id: String
    var accent: Color
    static func load() -> ComplicationTheme {
        let id = UserDefaults(suiteName: "group.com.superdotspals.wellnest.watch")?.string(forKey: "watchTheme") ?? "bloop"
        let accents: [String: Color] = ["bloop": Color(red: 0.44, green: 0.22, blue: 0.91), "poppy": Color(red: 0.91, green: 0.42, blue: 0.54),
                                        "mochi": Color(red: 0.28, green: 0.55, blue: 0.85), "zuzu": Color(red: 0.89, green: 0.64, blue: 0.15),
                                        "nori": Color(red: 0.23, green: 0.66, blue: 0.52)]
        return ComplicationTheme(id: id, accent: accents[id] ?? accents["bloop"]!)
    }
    /// A theme's own face image ("<theme>_face_<level>") if bundled, otherwise the shared MoodPal face for that level.
    func face(_ score: Int?) -> String {
        let level = score.map { $0 < 35 ? "great" : $0 < 60 ? "normal" : $0 < 80 ? "elevated" : "overload" } ?? "great"
        let custom = "\(id)_face_\(level)"
        return UIImage(named: custom) != nil ? custom : "face_\(level)"
    }
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
        let theme = ComplicationTheme.load()
        switch family {
        case .accessoryInline:
            Text(s.score == nil ? "Stress –" : "Stress \(s.label)")
        case .accessoryRectangular:
            HStack(spacing: 6) {
                Image(theme.face(s.score)).resizable().scaledToFit().frame(width: 38, height: 38)
                VStack(alignment: .leading) {
                    Text("MoodPals").font(.caption2).foregroundStyle(.secondary)
                    Text(s.score == nil ? "Open to sync" : "\(s.label) · \(s.score!)").font(.headline).foregroundStyle(color(s.score))
                    Gauge(value: Double(s.score ?? 0), in: 0...100) { EmptyView() }.gaugeStyle(.accessoryLinear).tint(theme.accent)
                }
            }
        case .accessoryCorner:
            Text(s.score.map(String.init) ?? "–").font(.title3.bold()).foregroundStyle(color(s.score))
                .widgetLabel { Text(s.score == nil ? "Stress" : s.label).foregroundStyle(color(s.score)) }
        default:
            ZStack {
                Gauge(value: Double(s.score ?? 0), in: 0...100) { EmptyView() }.gaugeStyle(.accessoryCircularCapacity).tint(theme.accent)
                Image(theme.face(s.score)).resizable().scaledToFit().padding(7)
            }
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
