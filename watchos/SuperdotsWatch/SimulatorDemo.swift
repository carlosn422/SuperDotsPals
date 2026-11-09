#if DEBUG && targetEnvironment(simulator)
import Foundation
import HealthKit

/// Debug-only simulator aid (launch argument `-MoodPalsSimulatorDemo`): the watch simulator has no HRV and
/// no paired account, so this seeds sample HealthKit readings and shows the home screen without pairing.
/// Compiled out of device and release builds.
enum SimulatorDemo {
    static var enabled: Bool { ProcessInfo.processInfo.arguments.contains("-MoodPalsSimulatorDemo") }

    static func seedHealthIfNeeded() async {
        guard enabled else { return }
        let monitor = HealthStressMonitor.shared
        let types: Set<HKSampleType> = [monitor.hrvType, monitor.rhrType, monitor.heartRateType, monitor.sleepType]
        do { try await monitor.store.requestAuthorization(toShare: types, read: monitor.readTypes) } catch { return }
        if await monitor.sleepNights(since: Date().addingTimeInterval(-8 * 86400)).isEmpty { await seedSleep(monitor) }
        let existing = await monitor.samples(monitor.hrvType, unit: HealthStressMonitor.ms, since: Date().addingTimeInterval(-21 * 86400))
        guard existing.count < StressEngine.minBaselineSamples else { return }
        var samples: [HKQuantitySample] = []
        func add(_ type: HKQuantityType, _ unit: HKUnit, _ value: Double, _ date: Date) {
            samples.append(HKQuantitySample(type: type, quantity: HKQuantity(unit: unit, doubleValue: value), start: date, end: date))
        }
        let now = Date()
        // Watch HealthKit rejects samples older than earliestPermittedSampleDate (about a week).
        let earliest = max(monitor.store.earliestPermittedSampleDate(), now.addingTimeInterval(-6 * 86400)).addingTimeInterval(3600)
        var date = earliest
        var i = 0
        while date < now.addingTimeInterval(-3 * 3600) {
            add(monitor.hrvType, HealthStressMonitor.ms, 48 + Double(i % 5) * 3, date)
            if i % 3 == 0 { add(monitor.rhrType, HealthStressMonitor.bpm, 60 + Double(i % 4), date) }
            date = date.addingTimeInterval(8 * 3600)
            i += 1
        }
        add(monitor.hrvType, HealthStressMonitor.ms, 41, now.addingTimeInterval(-600))
        add(monitor.rhrType, HealthStressMonitor.bpm, 63, now.addingTimeInterval(-900))
        do { try await monitor.store.save(samples) } catch { NSLog("[SimulatorDemo] Seed failed: %@", error.localizedDescription) }
    }

    /// Five nights of staged sleep, 11 pm to about 6:30 am, with a short awake break.
    private static func seedSleep(_ monitor: HealthStressMonitor) async {
        let earliest = monitor.store.earliestPermittedSampleDate()
        let today = Calendar.current.startOfDay(for: Date())
        var samples: [HKCategorySample] = []
        for night in 0..<5 {
            var start = today.addingTimeInterval(-Double(night) * 86400 - 3600)
            guard start > earliest, start < Date().addingTimeInterval(-10 * 3600) else { continue }
            let stages: [(HKCategoryValueSleepAnalysis, Double)] = [(.asleepCore, 120), (.asleepDeep, 60), (.asleepREM, 60 + Double(night) * 5), (.awake, 10), (.asleepCore, 200)]
            for (stage, minutes) in stages {
                let end = start.addingTimeInterval(minutes * 60)
                samples.append(HKCategorySample(type: monitor.sleepType, value: stage.rawValue, start: start, end: end))
                start = end
            }
        }
        guard !samples.isEmpty else { return }
        do { try await monitor.store.save(samples) } catch { NSLog("[SimulatorDemo] Sleep seed failed: %@", error.localizedDescription) }
    }
}
#endif
