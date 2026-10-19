import SwiftUI
import UIKit

/// Plays the 12 FPS watch-specific PNG assets. Missing or temporarily unavailable
/// frames never cause the mascot to flash to a system symbol.
struct AnimatedMoodMascot: View {
    let mood: String
    var size: CGFloat = 100
    var isActive: Bool = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var lastImage: UIImage?
    @State private var lastEmotion = ""

    private let framesPerSecond = 12.0
    private let frameCount = 36

    private var emotion: String {
        let value = mood.lowercased()
        if ["happy","good","great","joy","excited","proud"].contains(where: value.contains) { return "joy" }
        if ["anger","angry","frustrated","mad","irritated"].contains(where: value.contains) { return "anger" }
        if ["fear","anxious","stress","worried","nervous","overwhelmed"].contains(where: value.contains) { return "fear" }
        if ["tired","sleepy","exhausted","fatigued"].contains(where: value.contains) { return "tired" }
        if ["sad","down","depressed","lonely"].contains(where: value.contains) { return "sadness" }
        return "disgust"
    }

    private func frame(_ index: Int) -> UIImage? {
        UIImage(named: String(format: "%@_frame_%03d", emotion, index))
    }

    var body: some View {
        // The frame sequence is local; network synchronization must not gate rendering.
        TimelineView(.animation(minimumInterval: 1.0 / framesPerSecond,
                                paused: !isActive || reduceMotion)) { context in
            let index = reduceMotion ? 0 :
                Int(context.date.timeIntervalSinceReferenceDate * framesPerSecond) % frameCount
            let image = frame(index) ?? lastImage ?? frame(0)
            Group {
                if let image {
                    Image(uiImage: image).resizable().scaledToFit()
                        .onAppear { lastImage = image; lastEmotion = emotion }
                        .onChange(of: index) { _, _ in
                            // Only retain a successfully loaded frame.
                            if let current = frame(index) { lastImage = current }
                        }
                } else {
                    // Assets were not bundled. Show a stable placeholder, not
                    // a rapidly alternating placeholder/mascot.
                    Image(systemName: "face.smiling.fill")
                        .resizable().scaledToFit()
                        .foregroundStyle(.purple.opacity(0.7))
                        .padding(15)
                }
            }
            .frame(width: size, height: size)
        }
        .onChange(of: emotion) { _, next in
            lastEmotion = next
            lastImage = UIImage(named: "\(next)_frame_000")
        }
        .onAppear {
            lastEmotion = emotion
            lastImage = frame(0)
        }
        .accessibilityLabel("\(mood) MoodPal")
    }
}
