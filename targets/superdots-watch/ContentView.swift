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
    @State private var showingDrinks = false

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
                NavigationStack {
                VStack(spacing: 3) {
                    Group {
                        Spacer(minLength: 0)
                        // Re-evaluated every minute so the MoodPal switches back to heart data when the hour is up.
                        TimelineView(.everyMinute) { context in
                        let shownMood = store.displayMood(at: context.date)
                        Button {
                            choosingMood = true
                        } label: {
                            AnimatedMoodMascot(mood: shownMood, size: WKInterfaceDevice.current().screenBounds.height < 220 ? 72 : 92, isActive: scenePhase == .active)
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Current mood \(MoodLabel.display(shownMood)). Tap to change.")
                        }
                        if !sync.moodOnly {
                            StressSummary(reading: store.stress, hrv: store.latestHRV, heartRate: store.latestHeartRate)
                                .padding(.bottom, 10)
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
                .toolbar {
                    if !sync.moodOnly {
                        ToolbarItem(placement: .topBarLeading) {
                            Button { showingDrinks = true } label: {
                                Image(systemName: "drop.fill").foregroundStyle(DrinksView.waterColor)
                            }
                            .accessibilityLabel("Water and caffeine")
                        }
                    }
                }
                }
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
        .sheet(isPresented: $showingDrinks) {
            DrinksView()
        }
        .sheet(isPresented: $choosingTheme) {
            NavigationStack { WatchThemePicker() }.environmentObject(store)
        }
        .sheet(isPresented: $showingCircle, onDismiss: { circle.path = [] }) {
            NavigationStack(path: $circle.path) { WatchCircleList() }
        }
        .onChange(of: circle.openRequest, initial: true) { _, request in
            guard request > 0 else { return }
            choosingMood = false; measuring = false; choosingTheme = false; showingDrinks = false
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
        .onChange(of: choosingMood || measuring || choosingTheme || showingCircle || showingDrinks || store.applyingTheme != nil, initial: true) { _, covered in
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
        .task {
            // Latest heart rate from the last 2 hours, shown above the stress bar.
            guard !sync.moodOnly else { return }
            while !Task.isCancelled {
                let monitor = HealthStressMonitor.shared
                let points = await monitor.samples(monitor.heartRateType, unit: HealthStressMonitor.bpm, since: Date().addingTimeInterval(-7200))
                store.latestHeartRate = points.last?.value
                do { try await Task.sleep(for: .seconds(60)) } catch { break }
            }
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
    let hrv: Double?
    let heartRate: Double?

    private var vitals: String? {
        let parts = [heartRate.map { "♥ \(Int($0.rounded()))" }, hrv.map { "HRV \(Int($0.rounded())) ms" }].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: "  ·  ")
    }

    var body: some View {
        if let reading, reading.isFresh {
            VStack(spacing: 4) {
                if let vitals {
                    Text("\(reading.level.label) · \(vitals)")
                        .font(.system(size: 13, weight: .semibold)).monospacedDigit()
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
                StressBar(score: reading.score, level: reading.level)
            }
            .accessibilityElement()
            .accessibilityLabel(["Stress \(reading.level.label)", heartRate.map { "heart rate \(Int($0.rounded())) beats per minute" }, hrv.map { "HRV \(Int($0.rounded())) milliseconds" }].compactMap { $0 }.joined(separator: ", "))
        }
    }
}

/// Overload (left) to Great (right) in four segments, like the iPhone scale, with a ring at the current score.
private struct StressBar: View {
    let score: Int
    let level: StressLevel
    // Same colours as STRESS_LEVELS on the iPhone, in LEVEL_ORDER.
    static let colors = [Color(red: 0.93, green: 0.44, blue: 0.53), Color(red: 0.95, green: 0.65, blue: 0.44),
                         Color(red: 0.54, green: 0.61, blue: 0.94), Color(red: 0.30, green: 0.73, blue: 0.50)]
    var body: some View {
        GeometryReader { geo in
            let position = min(max(Double(100 - score), 2), 96) / 100
            let ring = Self.colors[[.overload, .elevated, .normal, .great].firstIndex(of: level) ?? 3]
            ZStack(alignment: .leading) {
                HStack(spacing: 4) {
                    ForEach(0..<4, id: \.self) { Capsule().fill(Self.colors[$0]).frame(height: 8) }
                }
                Circle().fill(.white)
                    .overlay(Circle().stroke(ring, lineWidth: 3.5))
                    .frame(width: 15, height: 15)
                    .offset(x: geo.size.width * position - 7.5)
            }
            .frame(maxHeight: .infinity)
        }
        .frame(height: 15)
        .padding(.horizontal, 14)
    }
}
