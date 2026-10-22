import Foundation
import SwiftUI

enum Dot: String, CaseIterable, Identifiable {
    case bloop, poppy, mochi, zuzu, nori
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var color: Color {
        switch self {
        case .bloop: return Color(red: 0.45, green: 0.22, blue: 0.91)
        case .poppy: return Color(red: 0.91, green: 0.42, blue: 0.54)
        case .mochi: return Color(red: 0.28, green: 0.55, blue: 0.85)
        case .zuzu: return Color(red: 0.89, green: 0.64, blue: 0.15)
        case .nori: return Color(red: 0.23, green: 0.66, blue: 0.52)
        }
    }
}

struct SampleReading: Identifiable {
    let id = UUID()
    let hour: Int
    let hrv: Double
}

@MainActor
final class WatchStore: ObservableObject {
    // Brand colors are consistent; the mood controls the animated mascot, not the theme.
    @Published var companion: Dot = .bloop
    @Published var currentMood: String = "Calm"
    @Published var latestHRV: Double? = nil
    @Published var latestRestingHeartRate: Double? = nil
    @Published var latestSteps: Double? = nil
    @Published var latestSleepMinutes: Double? = nil
    @Published var sessionsCompleted: Int = 0
    @Published var hrvHistory: [(value: Double, date: Date)] = []
    @Published var restingHeartHistory: [(value: Double, date: Date)] = []

    /// Newest stress reading from the watch, a Measure now session, or the iPhone (App Group, newest wins).
    @Published var stress: StressReading? = WatchStressStore.load()
    @Published var stressCalibrating = WatchStressStore.calibrating
    @Published var theme: WatchTheme = WatchTheme.loadSaved()

    func applyTheme(_ id: String) {
        theme = WatchTheme.named(id)
        WatchTheme.save(theme.id)
    }

    func reloadStress() {
        stress = WatchStressStore.load()
        stressCalibrating = WatchStressStore.calibrating
    }

    // Use existing animated mascot frames. This describes physiological signals,
    // not an inferred emotional mood or a medical diagnosis.
    var wellnessMood: String { currentMood }

    private var stressObserver: NSObjectProtocol?

    init() {
        companion = .bloop
        stressObserver = NotificationCenter.default.addObserver(forName: .moodPalsStressChanged, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.reloadStress() }
        }
    }
}
