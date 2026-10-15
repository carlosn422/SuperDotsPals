import SwiftUI

/// Same mood-driven frame sequence used by the iPhone app.
/// Images are installed by scripts/install_mascot_animations.py as watchOS assets.
struct AnimatedMoodMascot: View {
    let mood: String
    var size: CGFloat = 100
    var isActive: Bool = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var emotion: String {
        let value = mood.lowercased()
        if ["happy","good","great","joy","excited","proud"].contains(where:value.contains) { return "joy" }
        if ["anger","angry","frustrated","mad","irritated"].contains(where:value.contains) { return "anger" }
        if ["fear","anxious","stress","worried","nervous","overwhelmed"].contains(where:value.contains) { return "fear" }
        if ["sad","tired","down","exhausted","depressed","lonely"].contains(where:value.contains) { return "sadness" }
        return "disgust"
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0/12.0, paused: !isActive || reduceMotion)) { context in
            let elapsed = context.date.timeIntervalSinceReferenceDate
            let index = reduceMotion ? 0 : Int(elapsed * 12) % 36
            let name = String(format: "%@_frame_%03d", emotion, index)
            Group {
                if let image = UIImage(named: name) {
                    Image(uiImage: image).resizable().scaledToFit()
                } else {
                    // Until uploaded animation frames are installed, show a neutral icon.
                    Image(systemName: "face.smiling.fill")
                        .resizable().scaledToFit().foregroundStyle(Color(red: 0.4, green: 0.35, blue: 0.78))
                        .padding(15)
                }
            }
            .frame(width:size,height:size)
        }
        .accessibilityLabel("\(emotion) mood companion")
    }
}
