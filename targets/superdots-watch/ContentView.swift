import SwiftUI
import WatchKit

struct ContentView: View {
    @EnvironmentObject private var store: WatchStore
    @ObservedObject private var sync = WatchThemeSync.shared
    @State private var measuring = false
    @Environment(\.scenePhase) private var scenePhase
    @State private var choosingMood = false
    @State private var shareAttempt: (mood: String, event: String)?
    @State private var choosingTheme = false
    @ObservedObject private var circle = WatchCircleStore.shared
    @State private var showingCircle = false

    private var purple: Color { store.theme.accent }

    private var simulatorDemo: Bool {
        #if DEBUG && targetEnvironment(simulator)
        return SimulatorDemo.enabled
        #else
        return false
        #endif
    }

    /// Set Mood: backend first, then local + complication state, then the Circle share (one event id per commit).
    private func commitMood(_ mood: String) async -> Bool {
        // Try Again after a failed or timed-out save reuses the same event id, so it can't share twice.
        if shareAttempt?.mood != mood { shareAttempt = (mood, UUID().uuidString) }
        let event = shareAttempt!.event
        if sync.connected {
            do { try await sync.submitMood(mood, store: store) }
            catch {
                sync.message = "Mood could not sync. Please retry."
                return false
            }
        } else if simulatorDemo {
            store.setMood(mood, at: Date(), if: .always)
        } else {
            return false
        }
        // Only a mood picked here notifies the Circle; sync and restore never do.
        circle.recordMoodChange(mood, event: event)
        shareAttempt = nil
        Task { await circle.flushMoodShares() }
        return true
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
                    Group {
                        Spacer(minLength: 0)
                        // Re-evaluated every minute so the MoodPal switches back to heart data when the hour is up.
                        TimelineView(.everyMinute) { context in
                        let shownMood = store.displayMood(at: context.date)
                        Button {
                            choosingMood = true
                        } label: {
                            AnimatedMoodMascot(mood: shownMood, size: 96, isActive: scenePhase == .active)
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Current mood \(shownMood). Tap to change.")
                        Text(shownMood).font(.headline)
                        Text(store.moodFromHealth(at: context.date) ? "From your heart data" : "Tap to change mood").font(.caption2).foregroundStyle(.secondary)
                        }
                        if !sync.moodOnly {
                            StressSummary(reading: store.stress, calibrating: store.stressCalibrating, theme: store.theme)
                        }
                        HStack(spacing: 6) {
                            if !sync.moodOnly {
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
                            }
                            Button { choosingTheme = true } label: {
                                Circle().fill(purple).frame(width: 20, height: 20)
                                    .overlay(Circle().stroke(.white, lineWidth: 1.5))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Theme colour \(store.theme.label). Tap to change.")
                            if sync.connected {
                                CircleButton(unread: circle.unread.count, accent: purple) { showingCircle = true }
                            }
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
        .sheet(isPresented: $choosingMood) {
            MoodPicker(current: store.displayMood(), accent: purple, commit: commitMood)
        }
        .sheet(isPresented: $choosingTheme) {
            NavigationStack { WatchThemePicker() }.environmentObject(store)
        }
        .sheet(isPresented: $showingCircle, onDismiss: { circle.path = [] }) {
            NavigationStack(path: $circle.path) { WatchCircleList() }
        }
        .onChange(of: circle.openRequest, initial: true) { _, request in
            guard request > 0 else { return }
            choosingMood = false; measuring = false; choosingTheme = false
            showingCircle = true
        }
        .overlay {
            ZStack {
                if let reaction = circle.floating {
                    FloatingReactionView(reaction: reaction)
                        .transition(.asymmetric(insertion: .identity, removal: .opacity))
                }
                if let summary = circle.summary {
                    FloatingSummaryView(summary: summary) { showingCircle = true }
                        .transition(.asymmetric(insertion: .identity, removal: .opacity))
                }
            }
            .animation(.easeIn(duration: WatchCircleStore.fadeDuration), value: circle.floating?.id)
            .animation(.easeIn(duration: WatchCircleStore.fadeDuration), value: circle.summary?.id)
        }
        // Circle reactions only float while the app is open in the foreground.
        .onChange(of: scenePhase == .active && sync.connected && !sync.pairingActive, initial: true) { _, isActive in
            circle.setActive(isActive)
        }
        .onChange(of: choosingMood || measuring || choosingTheme || showingCircle || store.applyingTheme != nil, initial: true) { _, covered in
            circle.hold = covered
        }
        .task {
            #if DEBUG && targetEnvironment(simulator)
            await SimulatorDemo.seedHealthIfNeeded()
            #endif
            if !sync.moodOnly, await HealthStressMonitor.shared.requestAuthorization() {
                HealthStressMonitor.shared.startObserving()
                await HealthStressMonitor.shared.recompute(upload: sync.connected)
            }
            store.reloadStress()
        }
        .task(id: sync.connected) {
            guard sync.connected else { return }
            // The root view stays alive after pairing completes.
            // Keep the latest iPhone check-in in sync while the watch is open.
            await sync.refresh(store: store)
            if scenePhase == .active { await sync.reportLocation() }
            while !Task.isCancelled && sync.connected {
                do { try await Task.sleep(for: .seconds(30)) }
                catch { break }
                if scenePhase == .active { await sync.refresh(store: store) }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && sync.connected && !sync.pairingActive {
                Task {
                    await sync.refresh(store: store)
                    await sync.reportLocation()
                }
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
