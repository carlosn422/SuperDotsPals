import SwiftUI
import WatchKit

/// Mood picker: a large preview of the highlighted MoodPal over a row of the other moods as small circular MoodPals.
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
        Option(label: "Angry", mood: "Angry"),
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
    @State private var index: Int
    @State private var crown: Double
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
        withAnimation(.easeInOut(duration: 0.18)) { index = next }
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
                withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { saved = true }
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
            let preview = max(44, min(100, geo.size.height - 98))
            let dot = min(28, (geo.size.width - 12) / CGFloat(Self.options.count) - 2)
            VStack(spacing: 4) {
                if saved {
                    Spacer(minLength: 0)
                    AnimatedMoodMascot(mood: option.mood, size: max(preview, min(100, geo.size.height - 56)), isActive: true)
                        .overlay(alignment: .bottomTrailing) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundStyle(.white, .green)
                        }
                        .transition(.scale.combined(with: .opacity))
                    Text("Mood set to \(option.label)").font(.system(size: 13, weight: .semibold))
                    Spacer(minLength: 0)
                } else {
                    let others = Self.options.indices.filter { $0 != index }
                    let dot = max(24, min(30, (geo.size.width - 4 * CGFloat(others.count - 1)) / CGFloat(others.count)))
                    let preview = max(44, min(100, geo.size.height - dot - 72))
                    AnimatedMoodMascot(mood: option.mood, size: preview, isActive: true)
                        .id(index)
                        .transition(.opacity)
                        .frame(maxWidth: .infinity)
                        .frame(height: preview)
                        .contentShape(Rectangle())
                        .highPriorityGesture(
                            DragGesture(minimumDistance: 15)
                                .onEnded { value in
                                    let dx = value.translation.width
                                    guard abs(dx) > abs(value.translation.height), abs(dx) > 25 else { return }
                                    select(index + (dx < 0 ? 1 : -1))
                                }
                        )
                        .accessibilityLabel("\(option.label) MoodPal preview")
                    Text(failed ? "Couldn't save" : option.label)
                        .font(.system(size: failed ? 11 : 13, weight: .semibold))
                        .foregroundStyle(failed ? .orange : .primary)
                        .lineLimit(1)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 4) {
                            ForEach(others, id: \.self) { i in
                                Button { select(i) } label: {
                                    AnimatedMoodMascot(mood: Self.options[i].mood, size: dot * 0.8, isActive: false)
                                        .frame(width: dot, height: dot)
                                        .background(Circle().fill(Color.white.opacity(0.12)))
                                        .clipShape(Circle())
                                }
                                .buttonStyle(.plain)
                                .transition(.scale.combined(with: .opacity))
                                .accessibilityLabel(Self.options[i].label)
                            }
                        }
                        .frame(minWidth: geo.size.width)
                    }
                    .frame(height: dot)
                    Button(action: setMood) {
                        Group {
                            if saving { ProgressView().tint(.white) } else { Text("Set Mood") }
                        }
                        .font(.system(size: 14, weight: .bold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 32)
                        .background(Capsule().fill(accent))
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                    .accessibilityLabel("Set mood to \(option.label)")
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
