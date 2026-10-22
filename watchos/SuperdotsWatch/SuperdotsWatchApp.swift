import SwiftUI
import WatchKit

final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        // HealthKit background delivery only wakes the app for observer queries registered at launch.
        HealthStressMonitor.shared.startObserving()
        WatchPhoneLink.shared.activate()
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
