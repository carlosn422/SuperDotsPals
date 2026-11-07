import SwiftUI
import WatchKit

/// Circular mood picker: the previewed MoodPal is large and animated in the center, the other moods sit around it.
/// Tapping an outer MoodPal (or turning the Digital Crown) swaps it with the center one; the bottom-right checkmark saves.
struct MoodPicker: View {
    struct Option: Equatable {
        let label: String
        /// Name stored in wellness_journal and shared with the Circle (same as the iPhone app).
        let mood: String
        let color: Color
    }

    static let options: [Option] = [
        Option(label: "Calm", mood: "Calm", color: Color(red: 0.30, green: 0.78, blue: 0.55)),
        Option(label: "Joy", mood: "Joyful", color: Color(red: 1.00, green: 0.80, blue: 0.25)),
        Option(label: "Anxious", mood: "Anxious", color: Color(red: 0.66, green: 0.48, blue: 0.96)),
        Option(label: "Sad", mood: "Sad", color: Color(red: 0.36, green: 0.60, blue: 0.98)),
        Option(label: "Angry", mood: "Angry", color: Color(red: 0.96, green: 0.36, blue: 0.32)),
        Option(label: "Tired", mood: "Tired", color: Color(red: 0.62, green: 0.66, blue: 0.80)),
    ]

    /// Outer positions in degrees (0 = right, 90 = down); the bottom stays clear for the center label.
    private static let ringAngles: [Double] = [-90, -30, 30, 150, 210]

    /// The option for a saved mood; moods without a picker option start on Calm.
    static func index(for mood: String) -> Int {
        let emotion = MoodArt.emotion(mood)
        return options.firstIndex { MoodArt.emotion($0.mood) == emotion } ?? 0
    }

    let accent: Color
    /// Saves the mood; returns false when it could not be saved.
    let commit: (String) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Option shown in the center.
    @State private var center: Int
    /// Option at each outer position (same order as `ringAngles`).
    @State private var ring: [Int]
    @State private var crown: Double
    @State private var saving = false
    @State private var saved = false
    @State private var failed = false
    @FocusState private var crownFocused: Bool

    init(current: String, accent: Color, commit: @escaping (String) async -> Bool) {
        let start = Self.index(for: current)
        _center = State(initialValue: start)
        _ring = State(initialValue: Self.options.indices.filter { $0 != start })
        _crown = State(initialValue: Double(start))
        self.accent = accent
        self.commit = commit
    }

    private var option: Option { Self.options[center] }

    /// Moves `next` to the center and the previous center mood into the position `next` left.
    private func preview(_ next: Int, haptic: Bool = true) {
        guard next != center, !saving, !saved, let slot = ring.firstIndex(of: next) else { return }
        let swap = {
            ring[slot] = center
            center = next
        }
        if reduceMotion { swap() } else { withAnimation(.spring(response: 0.34, dampingFraction: 0.8)) { swap() } }
        failed = false
        if Double(next) != crown { crown = Double(next) }
        if haptic { WKInterfaceDevice.current().play(.click) }
    }

    private func setMood() {
        guard !saving, !saved else { return }
        saving = true
        failed = false
        let mood = option.mood
        Task {
            let ok = await commit(mood)
            saving = false
            if ok {
                WKInterfaceDevice.current().play(.success)
                if reduceMotion { saved = true } else {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { saved = true }
                }
                try? await Task.sleep(for: .seconds(1.2))
                dismiss()
            } else {
                failed = true
                WKInterfaceDevice.current().play(.failure)
            }
        }
    }

    var body: some View {
        GeometryReader { geo in
            if saved {
                VStack(spacing: 4) {
                    Spacer(minLength: 0)
                    AnimatedMoodMascot(mood: option.mood, size: max(44, min(100, geo.size.height - 56)), isActive: true)
                        .overlay(alignment: .bottomTrailing) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundStyle(.white, .green)
                        }
                        .transition(.scale.combined(with: .opacity))
                    Text("Mood set to \(option.label)").font(.system(size: 13, weight: .semibold))
                    Spacer(minLength: 0)
                }
                .frame(width: geo.size.width, height: geo.size.height)
            } else {
                // The original oversized animation frames overlapped because the ring radius
                // was smaller than the sum of the center and outer mascot radii.
                // Reserve the footer, then fit a non-overlapping orbit inside the available square:
                // middle = 44% and outer = 28% => middle + 2*outer == side.
                let footerHeight: CGFloat = 40
                let ringHeight = max(90, geo.size.height - footerHeight)
                let side = min(geo.size.width, ringHeight)
                let outer = side * 0.28
                let middle = side * 0.44
                let radius = (side - outer) / 2

                VStack(spacing: 0) {
                    ZStack {
                        Circle()
                            .fill(option.color.opacity(0.32))
                            .frame(width: middle * 1.12, height: middle * 1.12)
                            .blur(radius: middle * 0.18)
                            .accessibilityHidden(true)
                        ForEach(Self.options.indices, id: \.self) { i in
                            mascot(i, outer: outer, middle: middle, radius: radius)
                        }
                        Text(failed ? "Couldn't save — try again" : option.label)
                            .font(.system(size: failed ? 10 : 14, weight: .semibold))
                            .foregroundStyle(failed ? .orange : .primary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .offset(y: middle / 2 + 10)
                            .accessibilityHidden(true)
                    }
                    .frame(width: geo.size.width, height: ringHeight)

                    HStack {
                        Button { dismiss() } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 34, height: 34)
                                .background(Circle().fill(Color.white.opacity(0.2)))
                        }
                        .buttonStyle(.plain)
                        .disabled(saving)
                        .accessibilityLabel("Cancel mood selection")
                        Spacer(minLength: 0)
                        Button(action: setMood) {
                            Group {
                                if saving {
                                    ProgressView().tint(.white)
                                } else {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 16, weight: .bold))
                                        .foregroundStyle(.white)
                                }
                            }
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(Color.green))
                        }
                        .buttonStyle(.plain)
                        .disabled(saving)
                        .accessibilityLabel(failed ? "Retry saving \(option.label)" : "Save \(option.label) mood")
                    }
                    .padding(.horizontal, 8)
                    .frame(height: footerHeight)
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }
        }
        .padding(.horizontal, 4)
        .focusable(!saved)
        .focused($crownFocused)
        .focusEffectDisabled()
        .digitalCrownRotation($crown, from: 0, through: Double(Self.options.count - 1), by: 1,
                              sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
        .onChange(of: crown) { _, value in
            // The crown's detents already play a haptic.
            preview(Int(value.rounded()), haptic: false)
        }
        .onAppear { crownFocused = true }
        // watchOS supplies an automatic upper-left X for sheets. Replace it with an
        // invisible, non-interactive toolbar item so only our bottom-left Cancel remains.
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("") {}
                    .opacity(0)
                    .disabled(true)
                    .allowsHitTesting(false)
            }
        }
        .interactiveDismissDisabled(saving)
    }

    /// One MoodPal, in the center or at its outer position. Only the center one plays its animation.
    @ViewBuilder
    private func mascot(_ i: Int, outer: CGFloat, middle: CGFloat, radius: CGFloat) -> some View {
        let isCenter = i == center
        let angle = (ring.firstIndex(of: i).map { Self.ringAngles[$0] } ?? 0) * .pi / 180
        let size = isCenter ? middle : outer
        Button { preview(i) } label: {
            ZStack {
                Circle()
                    .fill(Color.white.opacity(isCenter ? 0 : 0.12))
                    .frame(width: size, height: size)
                // Fill the tappable bubble, but clip *after* scaling so no mascot
                // can render outside its own orbit slot or overlap the center.
                AnimatedMoodMascot(mood: Self.options[i].mood, size: size, isActive: isCenter)
                    .scaleEffect(isCenter ? 1.12 : 1.30)
                    .frame(width: size, height: size)
                    .clipShape(Circle())
            }
            .frame(width: size, height: size)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .offset(x: isCenter ? 0 : cos(angle) * radius, y: isCenter ? 0 : sin(angle) * radius)
        .zIndex(isCenter ? 1 : 0)
        .accessibilityLabel(isCenter ? "\(Self.options[i].label), selected" : Self.options[i].label)
        .accessibilityHint(isCenter ? "Use the bottom-right checkmark to save this mood." : "Previews this mood. Use the bottom-right checkmark to save.")
    }
}
