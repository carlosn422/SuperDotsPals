import SwiftUI
import WidgetKit

/// Watch themes are colours (keep in sync with WatchThemesScreen.tsx and StressComplication.swift).
/// Each stress level shows a MoodPal face; a future character theme only needs its own `faces`.
struct WatchTheme: Identifiable, Equatable {
    let id: String
    let label: String
    let accent: Color
    /// AnimatedMoodMascot mood shown for each stress level (same mapping as STRESS_LEVELS in StressEngine.ts).
    var faces: [StressLevel: String] = [.great: "Calm", .normal: "Joyful", .elevated: "Anxious", .overload: "Angry"]

    func face(_ level: StressLevel) -> String { faces[level] ?? level.mascotMood }

    static let all: [WatchTheme] = [
        WatchTheme(id: "purple", label: "Purple", accent: Color(red: 0.44, green: 0.22, blue: 0.91)),
        WatchTheme(id: "pink", label: "Pink", accent: Color(red: 0.91, green: 0.42, blue: 0.54)),
        WatchTheme(id: "blue", label: "Blue", accent: Color(red: 0.28, green: 0.55, blue: 0.85)),
        WatchTheme(id: "gold", label: "Gold", accent: Color(red: 0.89, green: 0.64, blue: 0.15)),
        WatchTheme(id: "green", label: "Green", accent: Color(red: 0.23, green: 0.66, blue: 0.52)),
        WatchTheme(id: "teal", label: "Teal", accent: Color(red: 0.17, green: 0.70, blue: 0.69)),
        WatchTheme(id: "orange", label: "Orange", accent: Color(red: 0.94, green: 0.48, blue: 0.25)),
        WatchTheme(id: "red", label: "Red", accent: Color(red: 0.88, green: 0.31, blue: 0.37)),
    ]
    private static let legacy = ["bloop": "purple", "poppy": "pink", "mochi": "blue", "zuzu": "gold", "nori": "green"]
    static func named(_ id: String?) -> WatchTheme {
        let key = id.map { legacy[$0] ?? $0 }
        return all.first { $0.id == key } ?? all[0]
    }

    // Shared with the complication through the watch App Group.
    private static let key = "watchTheme"
    static func loadSaved() -> WatchTheme { named(UserDefaults(suiteName: WatchStressStore.appGroup)?.string(forKey: key)) }
    static func save(_ id: String) {
        UserDefaults(suiteName: WatchStressStore.appGroup)?.set(id, forKey: key)
        WidgetCenter.shared.reloadAllTimelines()
    }
}

/// Colour-only theme picker.
struct WatchThemePicker: View {
    @EnvironmentObject private var store: WatchStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 10) {
                ForEach(WatchTheme.all) { theme in
                    Button {
                        store.applyTheme(theme.id)
                        Task { try? await WatchThemeSync.shared.saveTheme(theme.id) }
                        dismiss()
                    } label: {
                        ZStack {
                            Circle().fill(theme.accent).frame(width: 34, height: 34)
                            if theme.id == store.theme.id { Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(.white) }
                        }
                        .overlay(Circle().stroke(.white, lineWidth: theme.id == store.theme.id ? 2 : 0).frame(width: 40, height: 40))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(theme.label + (theme.id == store.theme.id ? ", selected" : ""))
                }
            }
            .padding(.top, 6)
        }
        .navigationTitle("Colour")
    }
}

/// Shown while a new theme (picked here or on the iPhone) is being applied.
struct ThemeApplyingView: View {
    let theme: WatchTheme
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            RadialGradient(colors: [theme.accent.opacity(0.55), .clear], center: .top, startRadius: 4, endRadius: 170).ignoresSafeArea()
            VStack(spacing: 10) {
                ProgressView().tint(theme.accent).scaleEffect(1.2)
                Text("Updating your theme…").font(.system(size: 13, weight: .semibold))
                Circle().fill(theme.accent).frame(width: 18, height: 18)
            }
        }
        .transition(.opacity)
    }
}
