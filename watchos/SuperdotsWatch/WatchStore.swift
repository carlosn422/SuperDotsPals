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
    @AppStorage("chosen_dot") private var savedDot = Dot.bloop.rawValue
    @Published var companion: Dot = .bloop {
        didSet { savedDot = companion.rawValue }
    }
    @Published var currentMood: String = "Calm"
    @Published var latestHRV: Double? = nil
    @Published var latestRestingHeartRate: Double? = nil
    @Published var sessionsCompleted: Int = 0

    init() {
        companion = Dot(rawValue: UserDefaults.standard.string(forKey: "chosen_dot") ?? "") ?? .bloop
    }
}
