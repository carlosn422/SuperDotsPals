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
                    Text("You're doing dot-tastic!").font(.headline).multilineTextAlignment(.center)
                    Text("Your mood companion: \\(store.currentMood)").font(.caption2).foregroundStyle(.secondary)

                    HStack(spacing: 8) {
                        metric("HRV", value: "\(store.sampleHRV)", unit: "ms")
                        metric("Resting HR", value: "\(store.sampleRestingHeartRate)", unit: "bpm")
                    }
                    VStack(spacing: 6) {
                        HStack {
                            Label("Stress", systemImage: "heart.text.square")
                            Spacer()
                            Text("Low · \(store.sampleStress)/100").font(.caption2)
                        }
                        ProgressView(value: Double(store.sampleStress), total: 100)
                            .tint(store.companion.color)
                    }.font(.caption).padding(10).background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 13))
                    NavigationLink { TrendsView() } label: { Label("HRV trends", systemImage: "chart.xyaxis.line") }
                    NavigationLink { BreathingView() } label: { Label("Take a breath", systemImage: "wind") }
                    NavigationLink { CompanionPicker(sync: themeSync) } label: { Label("My Superdot", systemImage: "paintpalette") }
                    NavigationLink { WatchSyncView(sync: themeSync) } label: { Label("Mood sync", systemImage: "arrow.triangle.2.circlepath") }
                    Text(themeSync.connected ? "Mood sync connected" : "Connect to sync your latest mood")
                        .font(.system(size: 10)).foregroundStyle(.secondary)
                    Text("SAMPLE DATA · NOT MEDICAL ADVICE").font(.system(size: 9)).foregroundStyle(.secondary)
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
    @EnvironmentObject var store: WatchStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("HRV today").font(.headline)
                Text("61 ms average · sample").font(.caption).foregroundStyle(.secondary)
                Chart(store.readings) { reading in
                    LineMark(x: .value("Hour", reading.hour), y: .value("HRV", reading.hrv))
                        .foregroundStyle(store.companion.color)
                    PointMark(x: .value("Hour", reading.hour), y: .value("HRV", reading.hrv))
                        .foregroundStyle(store.companion.color)
                }
                .chartYScale(domain: 30...80)
                .frame(height: 130)
                Text("HRV changes naturally over time. This display uses fictional measurements.")
                    .font(.caption2).foregroundStyle(.secondary)
            }.padding(.horizontal, 6)
        }
        .navigationTitle("Trends")
    }
}

