import SwiftUI
import WatchKit

final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        // HealthKit background delivery only wakes the app for observer queries registered at launch.
        HealthStressMonitor.shared.startObserving()
        WatchPhoneLink.shared.activate()
        Self.scheduleMoodRefresh()
    }

    /// Background app refresh reconciles the complication's mood with the account about every 30 minutes
    /// (watchOS decides the actual time). One small request per wake; nothing runs continuously.
    static func scheduleMoodRefresh() {
        WKApplication.shared().scheduleBackgroundRefresh(withPreferredDate: Date().addingTimeInterval(30 * 60), userInfo: nil) { error in
            if let error { NSLog("[WatchSync] Background refresh not scheduled: %@", error.localizedDescription) }
        }
    }

    func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
        for task in backgroundTasks {
            switch task {
            case let task as WKApplicationRefreshBackgroundTask:
                Task { @MainActor in
                    await WatchThemeSync.shared.backgroundReconcile()
                    Self.scheduleMoodRefresh()
                    task.setTaskCompletedWithSnapshot(false)
                }
            case let task as WKWatchConnectivityRefreshBackgroundTask:
                WatchPhoneLink.shared.handle(task)
            default:
                task.setTaskCompletedWithSnapshot(false)
            }
        }
    }
}

@main
struct SuperdotsWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var appDelegate
    @StateObject private var store = WatchStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .tint(store.companion.color)
        }
    }
}
