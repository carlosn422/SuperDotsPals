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
    @Published var currentMood: String = "Calm"\n    @Published var sessionsCompleted: Int = 0

    let sampleHRV = 61
    let sampleRestingHeartRate = 67
    let sampleStress = 26
    let readings = [42, 48, 51, 45, 62, 56, 68, 61, 73, 64, 70, 61]
        .enumerated().map { SampleReading(hour: $0.offset + 7, hrv: Double($0.element)) }

    init() {
        companion = Dot(rawValue: UserDefaults.standard.string(forKey: "chosen_dot") ?? "") ?? .bloop
    }
}
