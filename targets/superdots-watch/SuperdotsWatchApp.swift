import SwiftUI

@main
struct SuperdotsWatchApp: App {
    @StateObject private var store = WatchStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .tint(store.companion.color)
        }
    }
}
