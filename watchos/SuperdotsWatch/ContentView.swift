import SwiftUI
import Charts

struct ContentView: View {
    @EnvironmentObject var store: WatchStore
    @StateObject private var themeSync = WatchThemeSync()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 13) {
                    Text("superdots.").font(.headline.bold()).foregroundStyle(store.companion.color)
                    MascotView(dot: store.companion, size: 100)
                    Text("You're doing dot-tastic!").font(.headline).multilineTextAlignment(.center)
                    Text("Your tiny wellness buddy").font(.caption2).foregroundStyle(.secondary)

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
                    NavigationLink { WatchSyncView(sync: themeSync) } label: { Label("Theme sync", systemImage: "arrow.triangle.2.circlepath") }
                    Text(themeSync.connected ? "Cloud theme sync connected" : "Watch theme saved locally")
                        .font(.system(size: 10)).foregroundStyle(.secondary)
                    Text("SAMPLE DATA · NOT MEDICAL ADVICE").font(.system(size: 9)).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 5)
            }
        }
        .task { await themeSync.refresh(store:store) }
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

struct CompanionPicker: View {
    @EnvironmentObject var store: WatchStore
    @ObservedObject var sync: WatchThemeSync

    var body: some View {
        List(Dot.allCases) { dot in
            Button {
                Task { await sync.update(companion: dot,store:store) }
            } label: {
                HStack(spacing: 10) {
                    MascotView(dot: dot, size: 36)
                        .frame(width: 42, height: 42)
                    Text(dot.title).font(.subheadline.weight(.semibold))
                    Spacer(minLength: 4)
                    if store.companion == dot { Image(systemName: "checkmark.circle.fill").foregroundStyle(dot.color) }
                }
                .frame(minHeight: 49)
                .contentShape(Rectangle())
            }
        }
        .navigationTitle("My Superdot")
    }
}
