import SwiftUI
import WidgetKit

/// A watch theme: a character, an accent colour and one face per stress level.
/// The launch themes reuse the existing MoodPal animations; a new character only needs its own faces.
struct WatchTheme: Identifiable, Equatable {
    let id: String
    let name: String
    let accent: Color
    let tint: Color
    /// AnimatedMoodMascot mood shown for each stress level (same mapping as STRESS_LEVELS in StressEngine.ts).
    var faces: [StressLevel: String] = [.great: "Calm", .normal: "Joyful", .elevated: "Anxious", .overload: "Angry"]

    func face(_ level: StressLevel) -> String { faces[level] ?? level.mascotMood }

    static let all: [WatchTheme] = [
        WatchTheme(id: "bloop", name: "Bloop", accent: Color(red: 0.44, green: 0.22, blue: 0.91), tint: Color(red: 0.93, green: 0.90, blue: 1.00)),
        WatchTheme(id: "poppy", name: "Poppy", accent: Color(red: 0.91, green: 0.42, blue: 0.54), tint: Color(red: 1.00, green: 0.91, blue: 0.93)),
        WatchTheme(id: "mochi", name: "Mochi", accent: Color(red: 0.28, green: 0.55, blue: 0.85), tint: Color(red: 0.89, green: 0.95, blue: 1.00)),
        WatchTheme(id: "zuzu", name: "Zuzu", accent: Color(red: 0.89, green: 0.64, blue: 0.15), tint: Color(red: 1.00, green: 0.96, blue: 0.81)),
        WatchTheme(id: "nori", name: "Nori", accent: Color(red: 0.23, green: 0.66, blue: 0.52), tint: Color(red: 0.88, green: 0.97, blue: 0.93)),
    ]
    static func named(_ id: String?) -> WatchTheme { all.first { $0.id == id } ?? all[0] }

    // Shared with the complication through the watch App Group.
    private static let key = "watchTheme"
    static func loadSaved() -> WatchTheme { named(UserDefaults(suiteName: WatchStressStore.appGroup)?.string(forKey: key)) }
    static func save(_ id: String) {
        UserDefaults(suiteName: WatchStressStore.appGroup)?.set(id, forKey: key)
        WidgetCenter.shared.reloadAllTimelines()
    }
}

struct WatchThemePicker: View {
    @EnvironmentObject private var store: WatchStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List(WatchTheme.all) { theme in
            Button {
                store.applyTheme(theme.id)
                Task { try? await WatchThemeSync.shared.saveTheme(theme.id) }
                dismiss()
            } label: {
                HStack(spacing: 8) {
                    AnimatedMoodMascot(mood: theme.face(.great), size: 28, isActive: false)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(theme.tint))
                    Text(theme.name)
                    Spacer()
                    if theme.id == store.theme.id { Image(systemName: "checkmark").foregroundStyle(theme.accent) }
                }
            }
        }
        .navigationTitle("Theme")
    }
}
