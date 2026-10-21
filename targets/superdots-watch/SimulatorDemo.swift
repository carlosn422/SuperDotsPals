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
        let types: Set<HKSampleType> = [monitor.hrvType, monitor.rhrType, monitor.heartRateType]
        do { try await monitor.store.requestAuthorization(toShare: types, read: monitor.readTypes) } catch { return }
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
}
#endif
