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
        let id = UserDefaults(suiteName: "group.com.superdotspals.wellnest.watch")?.string(forKey: "watchTheme") ?? "purple"
        let legacy = ["bloop": "purple", "poppy": "pink", "mochi": "blue", "zuzu": "gold", "nori": "green"]
        let key = legacy[id] ?? id
        let accents: [String: Color] = ["purple": Color(red: 0.44, green: 0.22, blue: 0.91), "pink": Color(red: 0.91, green: 0.42, blue: 0.54),
                                        "blue": Color(red: 0.28, green: 0.55, blue: 0.85), "gold": Color(red: 0.89, green: 0.64, blue: 0.15),
                                        "green": Color(red: 0.23, green: 0.66, blue: 0.52), "teal": Color(red: 0.17, green: 0.70, blue: 0.69),
                                        "orange": Color(red: 0.94, green: 0.48, blue: 0.25), "red": Color(red: 0.88, green: 0.31, blue: 0.37)]
        return ComplicationTheme(id: key, accent: accents[key] ?? accents["purple"]!)
    }
    /// A theme's own face image ("<theme>_face_<level>") if bundled, otherwise the shared MoodPal face for that level.
    func face(_ score: Int?) -> String {
        let level = score.map { $0 < 35 ? "great" : $0 < 60 ? "normal" : $0 < 80 ? "elevated" : "overload" } ?? "great"
        let custom = "\(id)_face_\(level)"
        return UIImage(named: custom) != nil ? custom : "face_\(level)"
    }
}

/// Latest mood check-in written by the watch app (WatchMoodStore).
struct ComplicationMood {
    var name: String
    var image: String
    static func load() -> ComplicationMood {
        let mood = UserDefaults(suiteName: "group.com.superdotspals.wellnest.watch")?.string(forKey: "currentMood") ?? "Calm"
        let v = mood.lowercased()
        let key: String
        if ["happy","good","great","joy","excited","proud"].contains(where: v.contains) { key = "joy" }
        else if ["anger","angry","frustrated","mad","irritated"].contains(where: v.contains) { key = "anger" }
        else if ["fear","anxious","stress","worried","nervous","overwhelmed"].contains(where: v.contains) { key = "fear" }
        else if ["tired","sleepy","exhausted","fatigued"].contains(where: v.contains) { key = "tired" }
        else if ["sad","down","depressed","lonely"].contains(where: v.contains) { key = "sadness" }
        else { key = "disgust" }
        return ComplicationMood(name: ["disgust","disgusted"].contains(v) ? "Calm" : mood.capitalized, image: "mood_\(key)")
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

/// "Mood": your current MoodPal.
struct MoodComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ComplicationEntry
    var body: some View {
        let theme = ComplicationTheme.load()
        let mood = ComplicationMood.load()
        switch family {
        case .accessoryInline:
            Text("Feeling \(mood.name)")
        case .accessoryCorner:
            Image(mood.image).resizable().scaledToFit().padding(2)
                .widgetLabel { Text(mood.name).foregroundStyle(theme.accent) }
        default:
            ZStack {
                AccessoryWidgetBackground()
                Image(mood.image).resizable().scaledToFit().padding(4)
            }
        }
    }
}

/// "Mood & Stress": MoodPal, mood name and stress bar.
struct MoodStressComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ComplicationEntry
    var body: some View {
        let s = entry.snapshot
        let theme = ComplicationTheme.load()
        let mood = ComplicationMood.load()
        switch family {
        case .accessoryInline:
            Text(s.score == nil ? "Feeling \(mood.name)" : "\(mood.name) · Stress \(s.label)")
        case .accessoryRectangular:
            HStack(spacing: 6) {
                Image(mood.image).resizable().scaledToFit().frame(width: 40, height: 40)
                VStack(alignment: .leading) {
                    Text(mood.name).font(.headline).foregroundStyle(theme.accent)
                    Text(s.score == nil ? "Stress –" : "\(s.label) · \(s.score!)").font(.caption2).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
                    Gauge(value: Double(s.score ?? 0), in: 0...100) { EmptyView() }.gaugeStyle(.accessoryLinear).tint(theme.accent)
                }
            }
        default:
            ZStack {
                Gauge(value: Double(s.score ?? 0), in: 0...100) { EmptyView() }.gaugeStyle(.accessoryCircularCapacity).tint(theme.accent)
                Image(mood.image).resizable().scaledToFit().padding(6)
            }
        }
    }
}

/// "Stress score": the number with a ring.
struct StressScoreComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ComplicationEntry
    var body: some View {
        let s = entry.snapshot
        let theme = ComplicationTheme.load()
        switch family {
        case .accessoryInline:
            Text(s.score == nil ? "Stress –" : "Stress \(s.score!) \(s.label)")
        case .accessoryCorner:
            Text(s.score.map(String.init) ?? "–").font(.title3.bold()).foregroundStyle(theme.accent)
                .widgetLabel { Text(s.score == nil ? "Stress" : s.label).foregroundStyle(theme.accent) }
        default:
            Gauge(value: Double(s.score ?? 0), in: 0...100) { Text("Stress") } currentValueLabel: { Text(s.score.map(String.init) ?? "–") }
                .gaugeStyle(.accessoryCircular).tint(theme.accent)
        }
    }
}

struct MoodComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MoodPalsMoodComplication", provider: ComplicationProvider()) { entry in
            MoodComplicationView(entry: entry).containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Mood")
        .description("Your current MoodPal.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryInline])
    }
}

struct StressComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MoodPalsStressComplication", provider: ComplicationProvider()) { entry in
            MoodStressComplicationView(entry: entry).containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Mood & Stress")
        .description("Your MoodPal, mood and stress level.")
        .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}

struct StressScoreComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MoodPalsStressScore", provider: ComplicationProvider()) { entry in
            StressScoreComplicationView(entry: entry).containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Stress score")
        .description("Your latest stress score.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryInline])
    }
}

@main
struct MoodPalsComplications: WidgetBundle {
    var body: some Widget {
        MoodComplication()
        StressComplication()
        StressScoreComplication()
    }
}
