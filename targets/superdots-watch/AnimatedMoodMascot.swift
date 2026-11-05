import SwiftUI
import UIKit

enum WatchHardware {
    /// Series 5, SE (1st generation) and older have too little memory to play the 36-frame mascots, so they show frame 0.
    static let isOlderModel: Bool = {
        var info = utsname()
        uname(&info)
        let machine = withUnsafeBytes(of: &info.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
        let model = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] ?? machine
        guard model.hasPrefix("Watch"), let major = Int(model.dropFirst(5).prefix { $0.isNumber }) else { return false }
        return major <= 5
    }()
}

/// Plays the 36 watch frames over the same loop length as the iPhone animation. Missing or temporarily unavailable
/// frames never cause the mascot to flash to a system symbol.
struct AnimatedMoodMascot: View {
    let mood: String
    var size: CGFloat = 100
    var isActive: Bool = true
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
    private var reduceMotion: Bool { accessibilityReduceMotion || WatchHardware.isOlderModel }
    @State private var lastImage: UIImage?
    @State private var lastEmotion = ""

    // The iPhone plays every source frame at 29.97 FPS (MascotAnimationAssets.ts); the watch's 36 frames
    // are sampled evenly from those, so stretch them over the same loop duration per mood.
    private var sourceFrameCount: Double {
        switch emotion {
        case "joy": return 300
        case "disgust": return 192
        default: return 240
        }
    }
    private var framesPerSecond: Double { Double(frameCount) / (sourceFrameCount / (30000.0 / 1001.0)) }
    private let frameCount = 36

    private var emotion: String { MoodArt.emotion(mood) }

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
            if lastImage == nil {
                NSLog("[WatchMascot] Missing bundled asset: %@_frame_000", emotion)
            } else {
                NSLog("[WatchMascot] Local frames available for %@", emotion)
            }
        }
        .accessibilityLabel("\(mood) MoodPal")
    }
}
