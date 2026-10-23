import SwiftUI
import WatchKit

struct ContentView: View {
    @EnvironmentObject private var store: WatchStore
    @ObservedObject private var sync = WatchThemeSync.shared
    @State private var measuring = false
    @Environment(\.scenePhase) private var scenePhase
    @State private var choosingMood = false
    @State private var moodPage = 0
    @State private var choosingTheme = false

    private let moods = ["Joyful", "Calm", "Sad", "Angry", "Anxious", "Tired"]
    private var purple: Color { store.theme.accent }

    private var simulatorDemo: Bool {
        #if DEBUG && targetEnvironment(simulator)
        return SimulatorDemo.enabled
        #else
        return false
        #endif
    }

    private func selectMood(_ mood: String) {
        choosingMood = false
        store.setMood(mood, at: Date())
        WKInterfaceDevice.current().play(.click)
        Task {
            do { try await sync.submitMood(mood, store: store) }
            catch { sync.message = "Mood could not sync. Please retry." }
        }
    }

    var body: some View {
        Group {
            if !simulatorDemo && (!sync.connected || sync.needsReconnect || sync.pairingActive) {
                WatchSyncView(sync: sync)
            } else if !simulatorDemo && !sync.moodLoaded {
                VStack(spacing: 10) {
                    if sync.syncWarning == nil {
                        ProgressView().tint(purple)
                        Text("Loading your mood…")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    } else {
                        Image(systemName: "wifi.exclamationmark")
                            .foregroundStyle(.secondary)
                        Text("Could not load your mood")
                            .font(.caption2)
                            .multilineTextAlignment(.center)
                        Button("Try again") {
                            Task { await sync.refresh(store: store) }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(purple)
                        .disabled(sync.busy)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(spacing: 3) {
                    if choosingMood {
                        Text("How do you feel?").font(.system(size: 12, weight: .semibold)).lineLimit(1)
                        Spacer(minLength: 0)
                        ZStack {
                            Button {
                                selectMood(moods[moodPage])
                            } label: {
                                AnimatedMoodMascot(mood: moods[moodPage], size: 100, isActive: false)
                                    .frame(width: 112, height: 112)
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.plain)
                            .id(moodPage)
                            .accessibilityLabel("Select \(moods[moodPage])")
                            HStack {
                                if moodPage > 0 {
                                    Button {
                                        withAnimation(.easeInOut(duration: 0.15)) { moodPage -= 1 }
                                    } label: {
                                        Image(systemName: "chevron.left").font(.system(size: 14, weight: .bold))
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Previous mood")
                                }
                                Spacer()
                                if moodPage < moods.count - 1 {
                                    Button {
                                        withAnimation(.easeInOut(duration: 0.15)) { moodPage += 1 }
                                    } label: {
                                        Image(systemName: "chevron.right").font(.system(size: 14, weight: .bold))
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Next mood")
                                }
                            }
                            .padding(.horizontal, 2)
                        }
                        .frame(height: 112)
                        .contentShape(Rectangle())
                        .highPriorityGesture(
                            DragGesture(minimumDistance: 15, coordinateSpace: .local)
                                .onEnded { value in
                                    if abs(value.translation.width) > abs(value.translation.height) && value.translation.width < -30 && moodPage < moods.count - 1 {
                                        withAnimation(.easeInOut(duration: 0.15)) { moodPage += 1 }
                                    } else if abs(value.translation.width) > abs(value.translation.height) && value.translation.width > 30 && moodPage > 0 {
                                        withAnimation(.easeInOut(duration: 0.15)) { moodPage -= 1 }
                                    }
                                }
                        )
                        Text(moods[moodPage])
                            .font(.system(size: 12, weight: .semibold))
                            .lineLimit(1)
                            .frame(height: 17)
                        Spacer(minLength: 0)
                        Button("Back") { choosingMood = false }
                            .font(.system(size: 12, weight: .semibold))
                            .buttonStyle(.plain)
                            .frame(height: 22)
                    } else {
                        Spacer(minLength: 0)
                        // Re-evaluated every minute so the MoodPal switches back to heart data when the hour is up.
                        TimelineView(.everyMinute) { context in
                        let shownMood = store.displayMood(at: context.date)
                        Button {
                            moodPage = max(0, moods.firstIndex(of: store.displayMood()) ?? 0)
                            withAnimation(.none) { choosingMood = true }
                        } label: {
                            AnimatedMoodMascot(mood: shownMood, size: 96, isActive: scenePhase == .active)
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Current mood \(shownMood). Tap to change.")
                        Text(shownMood).font(.headline)
                        Text(store.moodFromHealth(at: context.date) ? "From your heart data" : "Tap to change mood").font(.caption2).foregroundStyle(.secondary)
                        }
                        StressSummary(reading: store.stress, calibrating: store.stressCalibrating, theme: store.theme)
                        HStack(spacing: 6) {
                            Button {
                                measuring = true
                            } label: {
                                Label("Measure now", systemImage: "heart.circle.fill")
                                    .font(.system(size: 11, weight: .semibold))
                                    .padding(.horizontal, 10)
                                    .frame(height: 26)
                                    .background(Capsule().fill(purple))
                            }
                            .buttonStyle(.plain)
                            Button { choosingTheme = true } label: {
                                Circle().fill(purple).frame(width: 20, height: 20)
                                    .overlay(Circle().stroke(.white, lineWidth: 1.5))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Theme colour \(store.theme.label). Tap to change.")
                        }
                        Spacer(minLength: 0)
                    }
                }
                .padding(.horizontal, 5)
            }
        }
        .tint(purple)
        .background(alignment: .top) {
            RadialGradient(colors: [purple.opacity(0.35), .clear], center: .top, startRadius: 4, endRadius: 150)
                .ignoresSafeArea()
        }
        .overlay {
            if let next = store.applyingTheme { ThemeApplyingView(theme: next) }
        }
        .sheet(isPresented: $measuring) {
            NavigationStack { MeasureNowView() }
        }
        .sheet(isPresented: $choosingTheme) {
            NavigationStack { WatchThemePicker() }.environmentObject(store)
        }
        .task {
            #if DEBUG && targetEnvironment(simulator)
            await SimulatorDemo.seedHealthIfNeeded()
            #endif
            if await HealthStressMonitor.shared.requestAuthorization() {
                HealthStressMonitor.shared.startObserving()
                await HealthStressMonitor.shared.recompute(upload: sync.connected)
            }
            store.reloadStress()
        }
        .task(id: sync.connected) {
            guard sync.connected else { return }
            // The root view stays alive after QR pairing completes.
            // Keep the latest iPhone check-in in sync while the watch is open.
            await sync.refresh(store: store)
            while !Task.isCancelled && sync.connected {
                do { try await Task.sleep(for: .seconds(30)) }
                catch { break }
                if scenePhase == .active { await sync.refresh(store: store) }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && sync.connected && !sync.pairingActive {
                Task { await sync.refresh(store: store) }
            }
        }
    }
}

private struct StressSummary: View {
    let reading: StressReading?
    let calibrating: Bool
    let theme: WatchTheme

    var body: some View {
        Group {
            if let reading, reading.isFresh {
                HStack(spacing: 4) {
                    AnimatedMoodMascot(mood: theme.face(reading.level), size: 16, isActive: false).frame(width: 16, height: 16)
                    Text("Stress \(reading.level.label) · \(reading.score)")
                    Text(reading.at, style: .relative).foregroundStyle(.secondary)
                }
            } else if calibrating {
                Text("Stress: Calibrating")
            } else {
                Text("Stress: no recent reading").foregroundStyle(.secondary)
            }
        }
        .font(.system(size: 10))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
}
