import SwiftUI
import WidgetKit

// Icon-only watch-face shortcuts; tapping opens the watch app, which logs one tap (SuperdotsWatchApp.onOpenURL).
struct DrinkEntry: TimelineEntry { let date: Date }

struct DrinkProvider: TimelineProvider {
    func placeholder(in context: Context) -> DrinkEntry { DrinkEntry(date: .now) }
    func getSnapshot(in context: Context, completion: @escaping (DrinkEntry) -> Void) { completion(DrinkEntry(date: .now)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DrinkEntry>) -> Void) {
        completion(Timeline(entries: [DrinkEntry(date: .now)], policy: .never))
    }
}

struct DrinkComplicationView: View {
    let icon: String
    let color: Color
    @Environment(\.widgetFamily) private var family
    var body: some View {
        if family == .accessoryCorner {
            Image(systemName: icon).font(.system(size: 20, weight: .semibold)).foregroundStyle(color).widgetAccentable()
        } else {
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: icon).font(.system(size: 22, weight: .semibold)).foregroundStyle(color).widgetAccentable()
            }
        }
    }
}

struct LogWaterComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MoodPalsLogWater", provider: DrinkProvider()) { _ in
            DrinkComplicationView(icon: "drop.fill", color: Color(red: 0.29, green: 0.61, blue: 0.92))
                .containerBackground(.clear, for: .widget)
                .widgetURL(URL(string: "moodpals-watch://log/water"))
                .accessibilityLabel("Log water")
        }
        .configurationDisplayName("Log Water")
        .description("Tap to log water.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner])
    }
}

struct LogCaffeineComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MoodPalsLogCaffeine", provider: DrinkProvider()) { _ in
            DrinkComplicationView(icon: "cup.and.saucer.fill", color: Color(red: 0.77, green: 0.50, blue: 0.31))
                .containerBackground(.clear, for: .widget)
                .widgetURL(URL(string: "moodpals-watch://log/caffeine"))
                .accessibilityLabel("Log caffeine")
        }
        .configurationDisplayName("Log Caffeine")
        .description("Tap to log caffeine.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner])
    }
}
