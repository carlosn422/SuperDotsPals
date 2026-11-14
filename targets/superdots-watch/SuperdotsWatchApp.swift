import SwiftUI
import WatchKit
import UserNotifications

final class WatchAppDelegate: NSObject, WKApplicationDelegate, UNUserNotificationCenterDelegate {
    override init() {
        super.init()
        // Set before launch finishes so a tap that launched the app is delivered here.
        UNUserNotificationCenter.current().delegate = self
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    /// Circle pushes (`{action:"circle",route,ref}`; Expo nests custom data under "body") open the watch Circle screen.
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let data = (info["body"] as? [String: Any]) ?? (info as? [String: Any]) ?? [:]
        guard data["action"] as? String == "circle" else { return }
        let ref = data["ref"] as? String
        await MainActor.run { WatchCircleStore.shared.openFromNotification(ref: ref) }
    }

    func applicationDidFinishLaunching() {
        // HealthKit background delivery only wakes the app for observer queries registered at launch.
        HealthStressMonitor.shared.startObserving()
        WatchPhoneLink.shared.activate()
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
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
                // Watch-face "Log Water" / "Log Caffeine" shortcuts.
                .onOpenURL { url in
                    guard url.scheme == "moodpals-watch", url.host == "log" else { return }
                    Task { await WatchDrinks.shared.log(url.lastPathComponent) }
                }
        }
    }
}
