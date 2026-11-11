import SwiftUI
import WatchKit

/// Mood picker: a row of all MoodPals with the highlighted one big in the middle.
/// Tap, swipe or turn the Digital Crown to browse; only Set Mood saves (browsing never changes the mood).
struct MoodPicker: View {
    struct Option: Equatable {
        let label: String
        /// Name stored in wellness_journal and shared with the Circle (same as the iPhone app).
        let mood: String
    }

    static let options: [Option] = [
        Option(label: "Calm", mood: "Calm"),
        Option(label: "Joy", mood: "Joyful"),
        Option(label: "Anxious", mood: "Anxious"),
        Option(label: "Sad", mood: "Sad"),
        Option(label: "Stressed", mood: "Angry"),
        Option(label: "Tired", mood: "Tired"),
    ]

    /// The highlighted option for a saved mood; moods without a picker option start on Calm.
    static func index(for mood: String) -> Int {
        let emotion = MoodArt.emotion(mood)
        return options.firstIndex { MoodArt.emotion($0.mood) == emotion } ?? 0
    }

    let accent: Color
    /// Saves the mood; returns false when it could not be saved.
    let commit: (String) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var index: Int
    @State private var crown: Double
    @GestureState private var dragX: CGFloat = 0
    @State private var saving = false
    @State private var saved = false
    @State private var failed = false
    @FocusState private var crownFocused: Bool

    init(current: String, accent: Color, commit: @escaping (String) async -> Bool) {
        let start = Self.index(for: current)
        _index = State(initialValue: start)
        _crown = State(initialValue: Double(start))
        self.accent = accent
        self.commit = commit
    }

    private var option: Option { Self.options[index] }

    private func select(_ next: Int, haptic: Bool = true) {
        let next = min(max(next, 0), Self.options.count - 1)
        guard next != index, !saving, !saved else { return }
        if reduceMotion { index = next } else { withAnimation(.easeInOut(duration: 0.18)) { index = next } }
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

    /// All moods in one row: the highlighted pal is big in the middle and the others shrink toward the edges.
    /// Dragging slides the row so pals grow as they near the middle; releasing snaps to the nearest one.
    private func carousel(width: CGFloat, big: CGFloat) -> some View {
        let near = big * 0.55, far = big * 0.38
        // Neighbours tuck behind the pal in front of them, like an album selector.
        let step1 = big * 0.6, step2 = big * 0.32
        let position = Double(index) - Double(dragX / step1)
        func size(_ d: Double) -> CGFloat {
            d <= 1 ? big - (big - near) * CGFloat(d) : near - (near - far) * CGFloat(min(d, 2) - 1)
        }
        func offset(_ d: Double) -> CGFloat {
            let a = abs(d)
            let x = step1 * CGFloat(min(a, 1)) + step2 * CGFloat(max(0, a - 1))
            return d < 0 ? -x : x
        }
        return ZStack {
            ForEach(Self.options.indices, id: \.self) { i in
                let d = Double(i) - position
                let distance = min(1, abs(d))
                let side = size(abs(d))
                Button { select(i) } label: {
                    AnimatedMoodMascot(mood: Self.options[i].mood, size: side * 0.86, isActive: i == index)
                        .frame(width: side, height: side)
                        .background(Circle().fill(Color.white.opacity(0.12 * distance)))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .opacity(abs(d) > 2.6 ? 0 : 1 - 0.25 * min(abs(d), 2))
                .offset(x: offset(d))
                .zIndex(-abs(d))
                .accessibilityHidden(true)
            }
        }
        .frame(width: width, height: big)
        .clipped()
        .contentShape(Rectangle())
        .highPriorityGesture(
            DragGesture(minimumDistance: 8)
                .updating($dragX) { value, state, _ in state = value.translation.width }
                .onEnded { value in
                    let steps = Int((-value.translation.width / step1).rounded())
                    select(index + steps)
                }
        )
        .animation(reduceMotion ? nil : .interactiveSpring(response: 0.3, dampingFraction: 0.8), value: dragX)
        .accessibilityElement()
        .accessibilityLabel("Mood")
        .accessibilityValue(option.label)
        .accessibilityHint("Swipe up or down to choose a mood. Set Mood saves it.")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: select(index + 1)
            case .decrement: select(index - 1)
            @unknown default: break
            }
        }
    }

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 4) {
                if saved {
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
                } else {
                    carousel(width: geo.size.width, big: max(50, min(92, geo.size.height - 70, geo.size.width * 0.45)))
                    Text(failed ? "Couldn't save" : option.label)
                        .font(.system(size: failed ? 11 : 13, weight: .semibold))
                        .foregroundStyle(failed ? .orange : .primary)
                        .lineLimit(1)
                    Spacer(minLength: 14)
                    Button(action: setMood) {
                        Group {
                            if saving { ProgressView().tint(.white) } else { Text(failed ? "Try Again" : "Set Mood") }
                        }
                        .font(.system(size: 14, weight: .bold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 32)
                        .background(Capsule().fill(accent))
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                    .accessibilityLabel(failed ? "Couldn't save. Try setting mood to \(option.label) again" : "Set mood to \(option.label)")
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .padding(.horizontal, 4)
        .focusable(!saved)
        .focused($crownFocused)
        .focusEffectDisabled()
        .digitalCrownRotation($crown, from: 0, through: Double(Self.options.count - 1), by: 1,
                              sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
        .onChange(of: crown) { _, value in
            // The crown's detents already play a haptic.
            select(Int(value.rounded()), haptic: false)
        }
        .onAppear { crownFocused = true }
        .interactiveDismissDisabled(saving)
    }
}
