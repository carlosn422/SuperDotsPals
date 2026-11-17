import ActivityKit
import SwiftUI
import WidgetKit

// The selected Circle's latest drawing on the Lock Screen, in full color. The server starts or updates it with an
// ActivityKit push when a member taps Done (supabase/functions/drawing-live-push), so MoodPals doesn't need to be open.
// Keep in sync with modules/drawing-live/ios/DrawingLiveModule.swift: ActivityKit matches the type by name.
struct CircleDrawingAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var v: Int      // canvas version
        var bg: String  // canvas background, #RRGGBB
        var d: String   // strokes packed by drawing-live-push (see decodeLiveStrokes)
    }
    var group: String
}

private let liveBrushes = ["pen", "marker", "pencil", "highlighter"]

// Per stroke: r, g, b, width, brush, point count (2 bytes), then x, y per point on a 0–255 grid of the 1000 canvas.
func decodeLiveStrokes(_ d: String) -> [DrawingStroke] {
    guard let data = Data(base64Encoded: d) else { return [] }
    let b = [UInt8](data)
    var i = 0, out: [DrawingStroke] = []
    while i + 7 <= b.count {
        let color = Color(red: Double(b[i]) / 255, green: Double(b[i + 1]) / 255, blue: Double(b[i + 2]) / 255)
        let width = CGFloat(b[i + 3]), brush = liveBrushes[min(Int(b[i + 4]), 3)]
        let n = Int(b[i + 5]) << 8 | Int(b[i + 6])
        i += 7
        guard i + n * 2 <= b.count else { break }
        let k = drawingCanvasSize / 255
        let pts = (0..<n).map { CGPoint(x: CGFloat(b[i + $0 * 2]) * k, y: CGFloat(b[i + $0 * 2 + 1]) * k) }
        i += n * 2
        if !pts.isEmpty { out.append(DrawingStroke(brush: brush, color: color, width: width, points: pts)) }
    }
    return out
}

func liveColor(_ hex: String) -> Color {
    var h = hex
    if h.hasPrefix("#") { h.removeFirst() }
    guard h.count == 6, let v = UInt32(h, radix: 16) else { return .white }
    return Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
}

// The drawn area enlarged to fill the space; no labels or overlays.
struct LiveDrawingView: View {
    let state: CircleDrawingAttributes.ContentState
    var inset: CGFloat = 6

    var body: some View {
        let snapshot = DrawingSnapshot(groupId: "", background: liveColor(state.bg), version: state.v, strokes: decodeLiveStrokes(state.d))
        GeometryReader { geo in
            let area = CGRect(origin: .zero, size: geo.size).insetBy(dx: inset, dy: inset)
            let f = snapshot.inkFrame
            let k = min(area.width / f.width, area.height / f.height)
            let o = CGPoint(x: area.minX + (area.width - f.width * k) / 2 - f.minX * k,
                            y: area.minY + (area.height - f.height * k) / 2 - f.minY * k)
            ZStack {
                ForEach(Array(snapshot.strokes.enumerated()), id: \.offset) { _, s in
                    drawingStrokePath(s.points, scale: k, offset: o)
                        .stroke(s.color.opacity(s.opacity), style: StrokeStyle(lineWidth: max(1.5, s.width * k), lineCap: .round, lineJoin: .round))
                }
            }
        }
    }
}

struct CircleDrawingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CircleDrawingAttributes.self) { context in
            LiveDrawingView(state: context.state, inset: 10)
                .frame(maxWidth: .infinity)
                .frame(height: 160)
                .activityBackgroundTint(liveColor(context.state.bg))
                .activitySystemActionForegroundColor(.primary)
                .widgetURL(URL(string: "wellnest://drawing/" + context.attributes.group))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) {
                    LiveDrawingView(state: context.state)
                        .frame(height: 120)
                        .background(liveColor(context.state.bg), in: RoundedRectangle(cornerRadius: 14))
                }
            } compactLeading: {
                LiveDrawingView(state: context.state, inset: 1)
                    .frame(width: 22, height: 22)
                    .background(liveColor(context.state.bg), in: Circle())
            } compactTrailing: {
                Image(systemName: "scribble.variable")
            } minimal: {
                LiveDrawingView(state: context.state, inset: 1)
                    .frame(width: 22, height: 22)
                    .background(liveColor(context.state.bg), in: Circle())
            }
            .widgetURL(URL(string: "wellnest://drawing/" + context.attributes.group))
        }
    }
}
