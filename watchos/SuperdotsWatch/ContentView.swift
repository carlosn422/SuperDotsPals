import SwiftUI
import Charts

struct ContentView: View {
    @EnvironmentObject var store: WatchStore
    @StateObject private var themeSync = WatchThemeSync()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 13) {
                    Text("superdots.").font(.headline.bold()).foregroundStyle(store.companion.color)
                    AnimatedMoodMascot(mood: store.currentMood, size: 100, isActive: scenePhase == .active)
                    Text("Your wellness companion").font(.headline).multilineTextAlignment(.center)
                    Text("Your mood companion: \\(store.currentMood)").font(.caption2).foregroundStyle(.secondary)

                    Text("Health readings will appear after real Apple Health data is connected.")
                        .font(.caption2).foregroundStyle(.secondary)
                    NavigationLink { BreathingView() } label: { Label("Take a breath", systemImage: "wind") }
                    NavigationLink { WatchSyncView(sync: themeSync) } label: { Label("Mood sync", systemImage: "arrow.triangle.2.circlepath") }
                    Text(themeSync.connected ? "Mood sync connected" : "Connect to sync your latest mood")
                        .font(.system(size: 10)).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 5)
            }
        }
        .task { await themeSync.refresh(store:store) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await themeSync.refresh(store:store) } }
        }
    }

    private func metric(_ title: String, value: String, unit: String) -> some View {
        VStack(spacing: 3) {
            Text(title).font(.system(size: 10)).foregroundStyle(.secondary)
            Text(value).font(.title3.bold()).foregroundStyle(store.companion.color)
            Text(unit).font(.system(size: 9)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 13))
    }
}

struct TrendsView: View {
    var body: some View {
        Text("Real HRV trends will appear after Apple Health is connected on your iPhone.")
            .font(.caption).foregroundStyle(.secondary)
            .navigationTitle("Trends")
    }
}
