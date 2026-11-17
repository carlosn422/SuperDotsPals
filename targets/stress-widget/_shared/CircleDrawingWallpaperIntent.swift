import AppIntents
import SwiftUI
import UIKit
import UniformTypeIdentifiers

// Shortcuts action: the selected Circle's latest drawing as a full-screen image, for Set Wallpaper Photo
// (Circle → Drawing → Lock Screen Wallpaper in the app explains the automation).
@available(iOS 16.0, *)
struct GetCircleDrawingIntent: AppIntent {
    static var title: LocalizedStringResource = "Get Circle Drawing"
    static var description = IntentDescription("The latest drawing from the Circle on your MoodPals widget, sized for your Lock Screen.")
    static var openAppWhenRun = false

    struct NoDrawing: Error, CustomLocalizedStringResourceConvertible {
        var localizedStringResource: LocalizedStringResource { "Pick a Circle in MoodPals first: Circle → Drawing → Show on my widget." }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<IntentFile> {
        let drawing = await withCheckedContinuation { c in DrawingSnapshot.fetchLatest { c.resume(returning: $0) } }
        guard let drawing else { throw NoDrawing() }
        return .result(value: IntentFile(data: drawingWallpaperPNG(drawing), filename: "MoodPals Drawing.png", type: .png))
    }
}

// Drawn with Core Graphics so it also works when Shortcuts runs the action with MoodPals in the background.
// The canvas background fills the screen; the ink is enlarged into the area below the clock and above the Lock Screen buttons.
@MainActor
func drawingWallpaperPNG(_ drawing: DrawingSnapshot) -> Data {
    let size = UIScreen.main.bounds.size
    let format = UIGraphicsImageRendererFormat()
    format.scale = UIScreen.main.scale
    return UIGraphicsImageRenderer(size: size, format: format).pngData { ctx in
        let cg = ctx.cgContext
        UIColor(drawing.background).setFill()
        cg.fill(CGRect(origin: .zero, size: size))
        let area = CGRect(x: size.width * 0.08, y: size.height * 0.30, width: size.width * 0.84, height: size.height * 0.54)
        let f = drawing.inkFrame
        let k = min(area.width / f.width, area.height / f.height)
        let o = CGPoint(x: area.minX + (area.width - f.width * k) / 2 - f.minX * k, y: area.minY + (area.height - f.height * k) / 2 - f.minY * k)
        cg.setLineCap(.round)
        cg.setLineJoin(.round)
        for s in drawing.strokes {
            cg.addPath(drawingStrokePath(s.points, scale: k, offset: o).cgPath)
            cg.setStrokeColor(UIColor(s.color).withAlphaComponent(s.opacity).cgColor)
            cg.setLineWidth(max(1, s.width * k))
            cg.strokePath()
        }
    }
}
