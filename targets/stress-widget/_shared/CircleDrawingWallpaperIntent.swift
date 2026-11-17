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
        let size = UIScreen.main.bounds.size
        let renderer = ImageRenderer(content: DrawingWallpaperView(drawing: drawing).frame(width: size.width, height: size.height))
        renderer.scale = UIScreen.main.scale
        guard let png = renderer.uiImage?.pngData() else { throw NoDrawing() }
        return .result(value: IntentFile(data: png, filename: "MoodPals Drawing.png", type: .png))
    }
}

// The canvas background with the handwriting enlarged into the area below the clock and above the Lock Screen buttons.
struct DrawingWallpaperView: View {
    let drawing: DrawingSnapshot
    var body: some View {
        GeometryReader { geo in
            ZStack {
                drawing.background
                DrawingArtworkView(drawing: drawing, fitInk: true)
                    .padding(.horizontal, geo.size.width * 0.08)
                    .padding(.top, geo.size.height * 0.30)
                    .padding(.bottom, geo.size.height * 0.16)
            }
        }
    }
}
