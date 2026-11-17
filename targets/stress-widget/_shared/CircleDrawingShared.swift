import SwiftUI

// Shared by the app (Shortcuts wallpaper action) and the widget extension: the selected Circle's latest drawing,
// cached in the App Group by WidgetBridge.ts and refreshed from circle_drawing_widget_latest().
let drawingAppGroup = "group.com.superdotspals.wellnest"
let drawingCanvasSize: CGFloat = 1000

struct DrawingStroke: Sendable {
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

struct DrawingSnapshot: Sendable {
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
            return DrawingStroke(brush: s["b"] as? String ?? "pen", color: drawingColor(s["c"] as? String) ?? .black,
                                 width: CGFloat(truncating: s["w"] as? NSNumber ?? 10), points: points)
        }
        return DrawingSnapshot(groupId: groupId, background: drawingColor(v["background"] as? String) ?? .white,
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

private func drawingColor(_ hex: String?) -> Color? {
    guard var h = hex?.trimmingCharacters(in: .whitespaces) else { return nil }
    if h.hasPrefix("#") { h.removeFirst() }
    guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
    return Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
}

func drawingStrokePath(_ pts: [CGPoint], scale k: CGFloat, offset o: CGPoint) -> Path {
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
    // Zoom to the drawn area instead of the whole canvas (used for the Lock Screen wallpaper).
    var fitInk = false

    private var frame: CGRect {
        let full = CGRect(x: 0, y: 0, width: drawingCanvasSize, height: drawingCanvasSize)
        guard fitInk else { return full }
        var box = CGRect.null
        for s in drawing.strokes {
            for p in s.points { box = box.union(CGRect(x: p.x, y: p.y, width: 0, height: 0).insetBy(dx: -s.width / 2, dy: -s.width / 2)) }
        }
        guard !box.isNull else { return full }
        let w = max(box.width, 120), h = max(box.height, 120)
        return CGRect(x: box.midX - w / 2, y: box.midY - h / 2, width: w, height: h)
    }

    var body: some View {
        GeometryReader { geo in
            let f = frame
            let k = min(geo.size.width / f.width, geo.size.height / f.height)
            let o = CGPoint(x: (geo.size.width - f.width * k) / 2 - f.minX * k, y: (geo.size.height - f.height * k) / 2 - f.minY * k)
            ZStack {
                ForEach(Array(drawing.strokes.enumerated()), id: \.offset) { _, s in
                    drawingStrokePath(s.points, scale: k, offset: o)
                        .stroke(s.color.opacity(s.opacity), style: StrokeStyle(lineWidth: max(1, s.width * k), lineCap: .round, lineJoin: .round))
                }
            }
        }
    }
}
