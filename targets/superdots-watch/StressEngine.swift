import Foundation
import HealthKit
import WidgetKit

/// Same personal, baseline-relative stress estimate as the iPhone (StressEngine.ts).
/// A wellness signal from the user's own Apple Health readings, not a diagnosis.
enum StressEngine {
    static let baselineDays = 21.0
    static let minBaselineSamples = 8
    static let minBaselineDays = 3

    static func median(_ values: [Double]) -> Double? {
        let x = values.filter(\.isFinite).sorted()
        guard !x.isEmpty else { return nil }
        let m = x.count / 2
        return x.count % 2 == 1 ? x[m] : (x[m - 1] + x[m]) / 2
    }

    private static func clamp(_ n: Double, _ lo: Double, _ hi: Double) -> Double { max(lo, min(hi, n)) }

    static func score(hrv: Double, hrvBaseline: Double, rhr: Double?, rhrBaseline: Double?) -> Int {
        let hrvPart = clamp((1 - hrv / hrvBaseline) / 0.5, -1, 1)
        var rhrPart = 0.0
        if let rhr, let rhrBaseline, rhr > 0, rhrBaseline > 0 {
            rhrPart = clamp((rhr - rhrBaseline) / (0.15 * rhrBaseline), -1, 1)
        }
        return Int(clamp(50 + 40 * hrvPart + 10 * rhrPart, 0, 100).rounded())
    }

    static func level(for score: Int) -> StressLevel {
        score < 35 ? .great : score < 60 ? .normal : score < 80 ? .elevated : .overload
    }

    /// Median HRV of the 21 days before `date`; nil (calibrating) until >= 8 samples over >= 3 days.
    static func hrvBaseline(_ series: [HealthPoint], before date: Date) -> Double? {
        let window = series.filter { $0.date < date && $0.date >= date.addingTimeInterval(-baselineDays * 86400) }
        let days = Set(window.map { Calendar.current.startOfDay(for: $0.date) }).count
        guard window.count >= minBaselineSamples, days >= minBaselineDays else { return nil }
        return median(window.map(\.value))
    }

    /// Resting heart-rate baseline used by the iPhone: readings in the 21 days before the given resting reading.
    static func rhrBaseline(_ series: [HealthPoint], before date: Date, windowEnd: Date) -> Double? {
        median(series.filter { $0.date < date && $0.date >= windowEnd.addingTimeInterval(-baselineDays * 86400) }.map(\.value))
    }

    /// Scores the newest HRV sample exactly like `computeStressPoints` does on the iPhone.
    static func latestPoint(hrv: [HealthPoint], rhr: [HealthPoint]) -> (score: Int, at: Date, sample: HealthPoint)? {
        guard let latest = hrv.max(by: { $0.date < $1.date }),
              let base = hrvBaseline(hrv, before: latest.date) else { return nil }
        let recentRhr = rhr.filter { $0.date <= latest.date && $0.date >= latest.date.addingTimeInterval(-36 * 3600) }
            .max(by: { $0.date < $1.date })
        let rhrBase = recentRhr.flatMap { rhrBaseline(rhr, before: $0.date, windowEnd: latest.date) }
        return (score(hrv: latest.value, hrvBaseline: base, rhr: recentRhr?.value, rhrBaseline: rhrBase), latest.date, latest)
    }
}

enum StressLevel: String {
    case great, normal, elevated, overload
    var label: String { rawValue.capitalized }
    /// Mascot mood per STRESS_LEVELS in StressEngine.ts.
    var mascotMood: String {
        switch self {
        case .great: return "Calm"
        case .normal: return "Joyful"
        case .elevated: return "Anxious"
        case .overload: return "Angry"
        }
    }
    var summary: String {
        switch self {
        case .great: return "Your body signals look relaxed compared with your usual."
        case .normal: return "Your signals are close to your personal baseline."
        case .elevated: return "Your HRV is lower than your usual. A short break could help."
        case .overload: return "Your signals are well outside your usual range. Try to pause and breathe."
        }
    }
}

struct HealthPoint {
    let value: Double
    let date: Date
    var uuid: String = ""
}

/// The newest stress reading, shared with the watch-face complication through the App Group.
struct StressReading: Equatable {
    enum Source: String { case watch, measure, iphone }
    let score: Int
    let at: Date
    let source: Source
    var level: StressLevel { StressEngine.level(for: score) }
    var isFresh: Bool { Date().timeIntervalSince(at) < 24 * 3600 }
}

extension Notification.Name {
    static let moodPalsStressChanged = Notification.Name("moodPalsStressChanged")
}

enum WatchStressStore {
    static let appGroup = "group.com.superdotspals.wellnest.watch"
    private static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    static func load() -> StressReading? {
        guard let d = defaults, let score = d.object(forKey: "stressScore") as? Int else { return nil }
        let updated = d.double(forKey: "stressUpdated")
        guard updated > 0 else { return nil }
        return StressReading(score: score, at: Date(timeIntervalSince1970: updated),
                             source: StressReading.Source(rawValue: d.string(forKey: "stressSource") ?? "") ?? .iphone)
    }

    static var calibrating: Bool {
        get { defaults?.bool(forKey: "stressCalibrating") ?? false }
        set { defaults?.set(newValue, forKey: "stressCalibrating") }
    }

    /// iPhone HealthKit history synced through Supabase, cached for background recomputes.
    static func saveHistory(hrv: [HealthPoint], rhr: [HealthPoint]) {
        func encode(_ points: [HealthPoint]) -> [[Double]] { points.map { [$0.date.timeIntervalSince1970, $0.value] } }
        defaults?.set(encode(hrv), forKey: "phoneHrvHistory")
        defaults?.set(encode(rhr), forKey: "phoneRhrHistory")
    }

    static func loadHistory() -> (hrv: [HealthPoint], rhr: [HealthPoint]) {
        func decode(_ key: String) -> [HealthPoint] {
            (defaults?.array(forKey: key) as? [[Double]] ?? []).compactMap {
                $0.count == 2 ? HealthPoint(value: $0[1], date: Date(timeIntervalSince1970: $0[0])) : nil
            }
        }
        return (decode("phoneHrvHistory"), decode("phoneRhrHistory"))
    }

    /// Keeps whichever reading is newest (watch, Measure now, or the iPhone's computed row).
    @discardableResult
    static func offer(_ reading: StressReading) -> Bool {
        if let current = load(), current.at >= reading.at { return false }
        let d = defaults
        d?.set(reading.score, forKey: "stressScore")
        d?.set(reading.level.label, forKey: "stressLabel")
        d?.set(reading.at.timeIntervalSince1970, forKey: "stressUpdated")
        d?.set(reading.source.rawValue, forKey: "stressSource")
        d?.set(false, forKey: "stressCalibrating")
        WidgetCenter.shared.reloadAllTimelines()
        NotificationCenter.default.post(name: .moodPalsStressChanged, object: nil)
        return true
    }
}

/// Reads the watch's own HealthKit HRV / resting heart rate and keeps the stress score current,
/// including HealthKit background delivery so the complication updates while the app is closed.
final class HealthStressMonitor: @unchecked Sendable {
    static let shared = HealthStressMonitor()
    let store = HKHealthStore()
    let hrvType = HKQuantityType(.heartRateVariabilitySDNN)
    let rhrType = HKQuantityType(.restingHeartRate)
    let heartRateType = HKQuantityType(.heartRate)
    private var observing = false
    private let lock = NSLock()

    var readTypes: Set<HKObjectType> { [hrvType, rhrType, heartRateType] }

    func requestAuthorization() async -> Bool {
        guard !WatchProfile.moodOnly, HKHealthStore.isHealthDataAvailable() else { return false }
        do {
            try await store.requestAuthorization(toShare: [HKObjectType.workoutType()], read: readTypes)
            return true
        } catch {
            NSLog("[WatchStress] HealthKit authorization failed: %@", error.localizedDescription)
            return false
        }
    }

    /// Called at launch: observer queries must be registered before HealthKit can wake the app.
    func startObserving() {
        guard !WatchProfile.moodOnly, HKHealthStore.isHealthDataAvailable() else { return }
        lock.lock(); defer { lock.unlock() }
        guard !observing else { return }
        observing = true
        for type in [hrvType, rhrType] {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completion, error in
                guard let self, error == nil else { completion(); return }
                Task {
                    await self.recompute(upload: true)
                    completion()
                }
            }
            store.execute(query)
            store.enableBackgroundDelivery(for: type, frequency: .hourly) { ok, error in
                if !ok { NSLog("[WatchStress] Background delivery unavailable for %@: %@", type.identifier, error?.localizedDescription ?? "") }
            }
        }
    }

    func samples(_ type: HKQuantityType, unit: HKUnit, since: Date, until: Date = Date()) async -> [HealthPoint] {
        await withCheckedContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: since, end: until, options: [])
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: true)
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 1000, sortDescriptors: [sort]) { _, results, _ in
                let points = (results as? [HKQuantitySample] ?? []).map {
                    HealthPoint(value: $0.quantity.doubleValue(for: unit), date: $0.endDate, uuid: $0.uuid.uuidString)
                }
                continuation.resume(returning: points.filter { $0.value > 0 })
            }
            store.execute(query)
        }
    }

    /// Watch HealthKit samples merged with the cached iPhone history (watch HealthKit only keeps about a week).
    /// iPhone points within 2 minutes of a watch sample are treated as the same reading.
    func history(since: Date) async -> (hrv: [HealthPoint], rhr: [HealthPoint]) {
        async let hrv = samples(hrvType, unit: Self.ms, since: since)
        async let rhr = samples(rhrType, unit: Self.bpm, since: since)
        let (localHrv, localRhr) = await (hrv, rhr)
        let phone = WatchStressStore.loadHistory()
        func merge(_ local: [HealthPoint], _ remote: [HealthPoint]) -> [HealthPoint] {
            let extra = remote.filter { r in r.date >= since && !local.contains { abs($0.date.timeIntervalSince(r.date)) < 120 } }
            return (local + extra).sorted { $0.date < $1.date }
        }
        return (merge(localHrv, phone.hrv), merge(localRhr, phone.rhr))
    }

    static let ms = HKUnit.secondUnit(with: .milli)
    static let bpm = HKUnit.count().unitDivided(by: .minute())

    /// Recomputes the latest score from watch HealthKit data, stores it in the App Group (newest wins)
    /// and optionally uploads it as a `computed` stress_score row.
    @discardableResult
    func recompute(upload: Bool) async -> StressReading? {
        guard !WatchProfile.moodOnly, HKHealthStore.isHealthDataAvailable() else { return nil }
        let since = Date().addingTimeInterval(-(StressEngine.baselineDays + 2) * 86400)
        let (h, r) = await history(since: since)
        guard let point = StressEngine.latestPoint(hrv: h, rhr: r) else {
            WatchStressStore.calibrating = !h.isEmpty && WatchStressStore.load()?.isFresh != true
            return nil
        }
        let reading = StressReading(score: point.score, at: point.at, source: .watch)
        if WatchStressStore.offer(reading), upload {
            // Same key as the iPhone ("stress-hrv-<HealthKit UUID>") so both devices upsert one row.
            await WatchThemeSync.shared.uploadStress(score: point.score, at: point.at, key: "stress-hrv-\(point.sample.uuid)")
        }
        return reading
    }
}
