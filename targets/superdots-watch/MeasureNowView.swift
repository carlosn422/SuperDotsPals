import SwiftUI
import HealthKit
import WatchKit

/// "Measure now": a ~60 s guided breathing session (HKWorkoutSession, mind & body) that collects heart rate
/// and picks up a fresh HRV sample when Apple Watch records one, then scores it like the iPhone.
@MainActor
final class StressMeasurement: NSObject, ObservableObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    enum Phase: Equatable { case idle, measuring, analyzing, result, calibrating, failed(String) }
    struct Result: Equatable {
        let score: Int
        let heartRate: Int?
        let hrv: Int
        let hrvFresh: Bool
        var level: StressLevel { StressEngine.level(for: score) }
    }

    static let duration: TimeInterval = 60
    @Published var phase: Phase = .idle
    @Published var elapsed: TimeInterval = 0
    @Published var heartRate: Double?
    @Published var result: Result?
    private let monitor = HealthStressMonitor.shared
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var heartRates: [Double] = []
    private var startedAt = Date()
    private var timer: Task<Void, Never>?

    func start() async {
        guard HKHealthStore.isHealthDataAvailable() else { phase = .failed("Health data isn't available on this watch."); return }
        guard await monitor.requestAuthorization() else { phase = .failed("Allow Health access in Settings to measure."); return }
        heartRates = []; heartRate = nil; result = nil; elapsed = 0
        startedAt = Date()
        let config = HKWorkoutConfiguration()
        config.activityType = .mindAndBody
        config.locationType = .indoor
        do {
            let session = try HKWorkoutSession(healthStore: monitor.store, configuration: config)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: monitor.store, workoutConfiguration: config)
            session.delegate = self
            builder.delegate = self
            self.session = session; self.builder = builder
            session.startActivity(with: startedAt)
            try await builder.beginCollection(at: startedAt)
        } catch {
            NSLog("[Measure] Could not start session: %@", error.localizedDescription)
            // Still score from the latest readings if a session can't start (e.g. another workout is running).
        }
        phase = .measuring
        WKInterfaceDevice.current().play(.start)
        timer = Task { [weak self] in
            while let self, !Task.isCancelled, self.elapsed < Self.duration {
                try? await Task.sleep(for: .milliseconds(250))
                self.elapsed = Date().timeIntervalSince(self.startedAt)
            }
            if let self, !Task.isCancelled { await self.finish() }
        }
    }

    func cancel() {
        timer?.cancel(); timer = nil
        endSession()
        phase = .idle
    }

    private func endSession() {
        guard let session else { return }
        session.end()
        // Nothing is saved to Apple Health: the session only keeps the heart-rate sensor active.
        builder?.discardWorkout()
        self.session = nil; self.builder = nil
    }

    private func finish() async {
        endSession()
        phase = .analyzing
        WKInterfaceDevice.current().play(.success)
        let now = Date()
        let since = now.addingTimeInterval(-(StressEngine.baselineDays + 2) * 86400)
        async let series = monitor.history(since: since)
        async let sessionHR = monitor.samples(monitor.heartRateType, unit: HealthStressMonitor.bpm, since: startedAt, until: now)
        let ((hrv, rhr), hr) = await (series, sessionHR)
        // Prefer an HRV sample recorded during/just before this session; otherwise the newest one from the last 24 h.
        guard let latestHRV = hrv.last(where: { now.timeIntervalSince($0.date) < 24 * 3600 }) else {
            phase = .failed("No recent HRV yet. Apple Watch records HRV in the background; wear it snugly and try again later.")
            return
        }
        let hrvFresh = latestHRV.date >= startedAt.addingTimeInterval(-300)
        guard let baseline = StressEngine.hrvBaseline(hrv, before: latestHRV.date) else { phase = .calibrating; return }
        let sessionRates = heartRates.isEmpty ? hr.map(\.value) : heartRates
        let currentRate = StressEngine.median(sessionRates)
        let rhrInput = currentRate ?? rhr.last(where: { now.timeIntervalSince($0.date) < 36 * 3600 })?.value
        let rhrBase = StressEngine.median(rhr.filter { $0.date >= now.addingTimeInterval(-StressEngine.baselineDays * 86400) }.map(\.value))
        let score = StressEngine.score(hrv: latestHRV.value, hrvBaseline: baseline, rhr: rhrInput, rhrBaseline: rhrBase)
        result = Result(score: score, heartRate: currentRate.map { Int($0.rounded()) }, hrv: Int(latestHRV.value.rounded()), hrvFresh: hrvFresh)
        phase = .result
        if WatchStressStore.offer(StressReading(score: score, at: now, source: .measure)) {
            await WatchThemeSync.shared.uploadStress(score: score, at: now, key: "watch-measure-\(Int(now.timeIntervalSince1970))")
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {}
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        NSLog("[Measure] Session failed: %@", error.localizedDescription)
    }
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let type = HKQuantityType(.heartRate)
        guard collectedTypes.contains(type),
              let bpm = workoutBuilder.statistics(for: type)?.mostRecentQuantity()?.doubleValue(for: HealthStressMonitor.bpm) else { return }
        Task { @MainActor in
            self.heartRate = bpm
            self.heartRates.append(bpm)
        }
    }
}

struct MeasureNowView: View {
    @StateObject private var measurement = StressMeasurement()
    @Environment(\.dismiss) private var dismiss
    private let purple = WatchTheme.loadSaved().accent

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                switch measurement.phase {
                case .idle:
                    AnimatedMoodMascot(mood: "Calm", size: 80, isActive: false)
                    Text("Measure now").font(.headline)
                    Text("Sit still and breathe with the square for one minute.")
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Button("Start") { Task { await measurement.start() } }
                        .buttonStyle(.borderedProminent).tint(purple)
                case .measuring:
                    BreathingPacer(elapsed: measurement.elapsed)
                    Text(measurement.heartRate.map { "\(Int($0.rounded())) bpm" } ?? "Reading heart rate…")
                        .font(.caption).monospacedDigit()
                    ProgressView(value: min(measurement.elapsed, StressMeasurement.duration), total: StressMeasurement.duration).tint(purple)
                    Button("Cancel", role: .cancel) { measurement.cancel(); dismiss() }.font(.caption2)
                case .analyzing:
                    ProgressView().tint(purple)
                    Text("Checking your readings…").font(.caption2)
                case .result:
                    if let r = measurement.result { ResultCard(result: r) }
                    Button("Done") { dismiss() }.buttonStyle(.borderedProminent).tint(purple)
                case .calibrating:
                    AnimatedMoodMascot(mood: "Calm", size: 70, isActive: false)
                    Text("Calibrating").font(.headline)
                    Text("MoodPals needs about 3 days of HRV readings to learn your usual. Keep wearing your watch.")
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Button("Done") { dismiss() }
                case .failed(let message):
                    Image(systemName: "heart.text.square").font(.title2).foregroundStyle(.secondary)
                    Text(message).font(.caption2).multilineTextAlignment(.center)
                    Button("Done") { dismiss() }
                }
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle("Measure")
        .onDisappear { if measurement.phase == .measuring { measurement.cancel() } }
    }
}

/// Same look as the iPhone breathing: a short line glides around a rounded square.
/// Six breaths a minute: 4 s in over the top and right, 6 s out over the bottom and left.
private struct BreathingPacer: View {
    let elapsed: TimeInterval
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start = Date()
    private let green = Color(red: 0.30, green: 0.73, blue: 0.50)
    private let trail = 0.14

    private func position(_ t: TimeInterval) -> Double {
        let c = t.truncatingRemainder(dividingBy: 10)
        if reduceMotion { return c < 4 ? 0.5 : 1.0 }
        return c < 4 ? 0.5 * c / 4 : 0.5 + 0.5 * (c - 4) / 6
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { context in
            let t = reduceMotion ? elapsed : context.date.timeIntervalSince(start)
            let p = position(t)
            VStack(spacing: 4) {
                ZStack {
                    BreathSquare().stroke(green.opacity(0.25), lineWidth: 7)
                    BreathSquare().trim(from: max(0, p - trail), to: p)
                        .stroke(Color.white, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                    if p < trail {
                        BreathSquare().trim(from: 1 - (trail - p), to: 1)
                            .stroke(Color.white, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                    }
                }
                .frame(width: 92, height: 92)
                Text(t.truncatingRemainder(dividingBy: 10) < 4 ? "Breathe in" : "Breathe out").font(.caption.weight(.semibold))
            }
        }
        .onAppear { start = Date().addingTimeInterval(-elapsed) }
    }
}

private struct ResultCard: View {
    let result: StressMeasurement.Result
    var body: some View {
        VStack(spacing: 4) {
            AnimatedMoodMascot(mood: WatchTheme.loadSaved().face(result.level), size: 78)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(result.level.label).font(.headline).foregroundStyle(stressTint(result.score))
                Text("\(result.score)").font(.title3.weight(.bold)).monospacedDigit()
            }
            Text(result.level.summary).font(.caption2).multilineTextAlignment(.center)
            Text([result.heartRate.map { "\($0) bpm" }, "HRV \(result.hrv) ms\(result.hrvFresh ? "" : " (latest)")"].compactMap { $0 }.joined(separator: " · "))
                .font(.system(size: 10)).foregroundStyle(.secondary)
            Text("Wellness estimate, not a medical measurement.").font(.system(size: 9)).foregroundStyle(.secondary)
        }
    }
}

func stressTint(_ score: Int?) -> Color {
    guard let s = score else { return .gray }
    if s < 35 { return Color(red: 0.30, green: 0.73, blue: 0.50) }
    if s < 60 { return Color(red: 0.54, green: 0.61, blue: 0.94) }
    if s < 80 { return Color(red: 0.95, green: 0.65, blue: 0.44) }
    return Color(red: 0.93, green: 0.44, blue: 0.53)
}
