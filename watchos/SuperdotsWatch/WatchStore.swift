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

    // Compare against the individual's own history, rather than fixed population thresholds.
    // A score is intentionally withheld until enough days of real measurements exist.
    var strainScore: Double? {
        let now = Date()
        let recentHRV = hrvHistory.filter { now.timeIntervalSince($0.date) < 72 * 3600 }
        let historicHRV = hrvHistory.filter { now.timeIntervalSince($0.date) < 30 * 86400 }
        let distinctDays = Set(historicHRV.map { Calendar.current.startOfDay(for: $0.date) })
        guard distinctDays.count >= 7, historicHRV.count >= 7,
              let current = recentHRV.max(by: { $0.date < $1.date })?.value else { return nil }
        let sorted = historicHRV.map(\.value).sorted()
        let baseline = sorted[sorted.count / 2]
        guard baseline > 0 else { return nil }
        // Decreases in HRV can suggest physiological strain but cannot prove emotional stress.
        let hrvComponent = min(100, max(0, 50 + (baseline - current) / baseline * 120))
        let historicalRest = restingHeartHistory.filter { now.timeIntervalSince($0.date) < 30 * 86400 }
        let restDays = Set(historicalRest.map { Calendar.current.startOfDay(for: $0.date) })
        guard restDays.count >= 7,
              let recentRest = historicalRest.max(by: { $0.date < $1.date }),
              now.timeIntervalSince(recentRest.date) < 72 * 3600 else { return hrvComponent }
        let restSorted = historicalRest.map(\.value).sorted()
        let restBaseline = restSorted[restSorted.count / 2]
        guard restBaseline > 0 else { return hrvComponent }
        let restingComponent = min(100,max(0,50 + (recentRest.value - restBaseline) / restBaseline * 120))
        return hrvComponent * 0.7 + restingComponent * 0.3
    }

    var strainLabel: String {
        guard let score = strainScore else { return "Not enough data" }
        if score < 30 { return "Low strain" }
        if score < 60 { return "Typical" }
        if score < 80 { return "Elevated" }
        return "High strain"
    }

    // Use existing animated mascot frames. This describes physiological signals,
    // not an inferred emotional mood or a medical diagnosis.
    var wellnessMood: String {
        guard let score = strainScore else { return currentMood }
        if score < 30 { return "Joyful" }
        if score < 60 { return "Calm" }
        if score < 80 { return "Anxious" }
        return "Overwhelmed"
    }

    init() {
        companion = .bloop
    }
}
