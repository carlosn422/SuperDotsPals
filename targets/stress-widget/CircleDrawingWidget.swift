import SwiftUI
import WidgetKit

// Shows the latest drawing of the Circle each user picked in MoodPals (Circle → Drawing → Show on my widget).
// The app writes it to the App Group (WidgetBridge.ts publishDrawingSnapshot) and reloads these widgets whenever it
// changes; the timeline also asks Supabase for a newer version so drawings arrive while the app is closed.
private let drawingAppGroup = "group.com.superdotspals.wellnest"
private let drawingCanvasSize: CGFloat = 1000

struct DrawingStroke {
    let brush: String
    let color: Color
    let width: CGFloat
    let points: [CGPoint]

    var opacity: Double {
        switch brush {
        case "marker": return 0.9
        case "pencil": return 0.6
        case "highlighter": return 0.35
        default: return 1
        }
    }
}

struct DrawingSnapshot {
    let groupId: String
    let background: Color
    let version: Int
    let strokes: [DrawingStroke]

    static func parse(_ v: [String: Any]) -> DrawingSnapshot? {
        guard let groupId = (v["groupId"] ?? v["group_id"]) as? String else { return nil }
        let strokes = (v["strokes"] as? [[String: Any]] ?? []).compactMap { s -> DrawingStroke? in
            let p = (s["p"] as? [NSNumber] ?? []).map { CGFloat(truncating: $0) }
            guard p.count >= 2 else { return nil }
            let points = stride(from: 0, to: p.count - 1, by: 2).map { CGPoint(x: p[$0], y: p[$0 + 1]) }
            return DrawingStroke(brush: s["b"] as? String ?? "pen", color: Color(hex: s["c"] as? String ?? "") ?? .black,
                                 width: CGFloat(truncating: s["w"] as? NSNumber ?? 10), points: points)
        }
        return DrawingSnapshot(groupId: groupId, background: Color(hex: v["background"] as? String ?? "") ?? .white,
                               version: (v["version"] as? NSNumber)?.intValue ?? 0, strokes: strokes)
    }

    static func cached() -> DrawingSnapshot? {
        guard let json = UserDefaults(suiteName: drawingAppGroup)?.string(forKey: "drawingSnapshot"),
              let v = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] else { return nil }
        return parse(v)
    }

    // Asks for the selected Circle's canvas; strokes only come back when the version changed.
    static func fetchLatest(completion: @escaping (DrawingSnapshot?) -> Void) {
        let defaults = UserDefaults(suiteName: drawingAppGroup)
        let cached = cached()
        guard let authJSON = defaults?.string(forKey: "drawingWidgetAuth"),
              let auth = (try? JSONSerialization.jsonObject(with: Data(authJSON.utf8))) as? [String: String],
              let base = auth["url"], let key = auth["key"], let token = auth["token"],
              let url = URL(string: base + "/rest/v1/rpc/circle_drawing_widget_latest") else { return completion(cached) }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = "POST"
        req.setValue(key, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = ["p_token": token]
        if let cached { body["p_version"] = cached.version }
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: req) { data, response, _ in
            guard (response as? HTTPURLResponse)?.statusCode == 200, let data,
                  let rows = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else { return completion(cached) }
            guard let row = rows.first else {
                // Widget turned off, canvas removed, or no longer in the Circle.
                defaults?.removeObject(forKey: "drawingSnapshot")
                return completion(nil)
            }
            if row["strokes"] == nil || row["strokes"] is NSNull, let cached, cached.groupId == (row["group_id"] as? String) { return completion(cached) }
            var v = row
            v["groupId"] = row["group_id"]
            let cache: [String: Any] = ["groupId": row["group_id"] ?? "", "background": row["background"] ?? "#FFFFFF",
                                        "version": row["version"] ?? 0, "strokes": row["strokes"] ?? [Any]()]
            if let fresh = try? JSONSerialization.data(withJSONObject: cache) {
                defaults?.set(String(decoding: fresh, as: UTF8.self), forKey: "drawingSnapshot")
            }
            completion(parse(v))
        }.resume()
    }
}

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

private func strokePath(_ pts: [CGPoint], scale k: CGFloat, offset o: CGPoint) -> Path {
    var path = Path()
    let pt = { (p: CGPoint) in CGPoint(x: o.x + p.x * k, y: o.y + p.y * k) }
    guard let first = pts.first else { return path }
    path.move(to: pt(first))
    if pts.count == 1 { path.addLine(to: pt(CGPoint(x: first.x + 0.1, y: first.y))); return path }
    if pts.count > 2 {
        for i in 1..<(pts.count - 1) {
            let mid = CGPoint(x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2)
            path.addQuadCurve(to: pt(mid), control: pt(pts[i]))
        }
    }
    path.addLine(to: pt(pts[pts.count - 1]))
    return path
}

// The artwork only, centred and scaled to fit; no labels, icons or overlays.
struct DrawingArtworkView: View {
    let drawing: DrawingSnapshot
    var tint: Color? = nil
    var minWidth: CGFloat = 1
    // Zoom to the drawn area instead of the whole canvas (used where the widget is tiny).
    var fitInk = false
    // Shown inside a circle: widen the frame so the ink's corners stay within the inscribed circle.
    var round = false

    private var frame: CGRect {
        let full = CGRect(x: 0, y: 0, width: drawingCanvasSize, height: drawingCanvasSize)
        guard fitInk else { return full }
        var box = CGRect.null
        for s in drawing.strokes {
            for p in s.points { box = box.union(CGRect(x: p.x, y: p.y, width: 0, height: 0).insetBy(dx: -s.width / 2, dy: -s.width / 2)) }
        }
        guard !box.isNull else { return full }
        let side = max(box.width, box.height, 200) * (round ? 1.42 : 1)
        return CGRect(x: box.midX - side / 2, y: box.midY - side / 2, width: side, height: side)
    }

    var body: some View {
        GeometryReader { geo in
            let f = frame
            let side = min(geo.size.width, geo.size.height)
            let k = side / f.width
            let o = CGPoint(x: (geo.size.width - side) / 2 - f.minX * k, y: (geo.size.height - side) / 2 - f.minY * k)
            ZStack {
                ForEach(Array(drawing.strokes.enumerated()), id: \.offset) { _, s in
                    strokePath(s.points, scale: k, offset: o)
                        .stroke((tint ?? s.color).opacity(s.opacity), style: StrokeStyle(lineWidth: max(minWidth, s.width * k), lineCap: .round, lineJoin: .round))
                }
            }
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

// Lock Screen: the selected Circle's strokes in the system's Lock Screen tint; tapping opens the canvas.
struct CircleDrawingLockView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DrawingEntry
    var body: some View {
        let circular = family == .accessoryCircular
        ZStack {
            if circular { AccessoryWidgetBackground() }
            if let d = entry.drawing, !d.strokes.isEmpty {
                DrawingArtworkView(drawing: d, tint: .primary, minWidth: 1.5, fitInk: true, round: circular)
                    .padding(circular ? 4 : 2)
            } else {
                Image(systemName: "scribble.variable").font(.system(size: 22, weight: .semibold))
            }
        }
        .clipShape(circular ? AnyShape(Circle()) : AnyShape(Rectangle()))
        .widgetAccentable()
    }
}

struct CircleDrawingLockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MoodPalsCircleDrawingLock", provider: DrawingProvider()) { entry in
            CircleDrawingLockView(entry: entry)
                .containerBackground(.clear, for: .widget)
                .widgetURL(drawingURL(entry.drawing))
        }
        .configurationDisplayName("Circle Drawing")
        .description("Your Circle’s latest drawing. Tap to draw together.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular])
    }
}
