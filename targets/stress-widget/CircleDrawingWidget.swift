import SwiftUI
import WidgetKit

// Shows the latest drawing of the Circle each user picked in MoodPals (Circle → Drawing → Show on my widget).
// The app writes it to the App Group (WidgetBridge.ts publishDrawingSnapshot) and reloads this widget whenever it
// changes; the timeline also asks Supabase for a newer version so drawings arrive while the app is closed.
struct DrawingEntry: TimelineEntry {
    let date: Date
    let drawing: DrawingSnapshot?
}

struct DrawingProvider: TimelineProvider {
    func placeholder(in context: Context) -> DrawingEntry { DrawingEntry(date: .now, drawing: nil) }
    func getSnapshot(in context: Context, completion: @escaping (DrawingEntry) -> Void) {
        completion(DrawingEntry(date: .now, drawing: DrawingSnapshot.cached()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DrawingEntry>) -> Void) {
        DrawingSnapshot.fetchLatest { drawing in
            completion(Timeline(entries: [DrawingEntry(date: .now, drawing: drawing)], policy: .after(.now.addingTimeInterval(20 * 60))))
        }
    }
}

private func drawingURL(_ d: DrawingSnapshot?) -> URL? { URL(string: "wellnest://drawing/" + (d?.groupId ?? "")) }

struct CircleDrawingWidgetView: View {
    let entry: DrawingEntry
    var body: some View {
        if let d = entry.drawing {
            DrawingArtworkView(drawing: d)
        } else {
            Image(systemName: "scribble.variable")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(Color(red: 0.20, green: 0.70, blue: 0.49).opacity(0.45))
        }
    }
}

struct CircleDrawingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MoodPalsCircleDrawing", provider: DrawingProvider()) { entry in
            CircleDrawingWidgetView(entry: entry)
                .containerBackground(entry.drawing?.background ?? .white, for: .widget)
                .widgetURL(drawingURL(entry.drawing))
        }
        .configurationDisplayName("Circle Drawing")
        .description("The latest drawing from the Circle you choose in MoodPals.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}
