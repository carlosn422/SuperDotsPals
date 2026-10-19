import SwiftUI
import WatchKit

struct ContentView: View {
    @EnvironmentObject private var store: WatchStore
    @StateObject private var sync = WatchThemeSync()
    @Environment(\.scenePhase) private var scenePhase
    @State private var choosingMood = false
    @State private var moodPage = 0

    private let moods = ["Joyful", "Calm", "Sad", "Angry", "Anxious", "Tired"]
    private let purple = Color(red: 0.47, green: 0.38, blue: 0.91)

    var body: some View {
        Group {
            if !sync.connected || sync.needsReconnect || sync.pairingActive {
                WatchSyncView(sync: sync)
            } else if !sync.moodLoaded {
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
                VStack(spacing: 6) {
                    if choosingMood {
                        Text("How do you feel?").font(.caption).fontWeight(.semibold)
                        ZStack {
                            TabView(selection: $moodPage) {
                                ForEach(0..<3, id: \.self) { page in
                                    HStack(spacing: 5) {
                                        ForEach((page * 2)..<min((page + 1) * 2, moods.count), id: \.self) { index in
                                            let mood = moods[index]
                                            Button {
                                                choosingMood = false
                                                store.currentMood = mood
                                                WKInterfaceDevice.current().play(.click)
                                                Task {
                                                    do { try await sync.submitMood(mood, store: store) }
                                                    catch { sync.message = "Mood could not sync. Please retry." }
                                                }
                                            } label: {
                                                VStack(spacing: 2) {
                                                    AnimatedMoodMascot(mood: mood, size: 76, isActive: false)
                                                    Text(mood).font(.system(size: 11, weight: .medium))
                                                }
                                                .frame(maxWidth: .infinity)
                                            }
                                            .buttonStyle(.plain)
                                            .accessibilityLabel("Select \(mood)")
                                        }
                                    }
                                    .padding(.horizontal, 17)
                                    .tag(page)
                                }
                            }
                            .tabViewStyle(.page(indexDisplayMode: .never))
                            HStack {
                                if moodPage > 0 {
                                    Button {
                                        withAnimation { moodPage -= 1 }
                                    } label: {
                                        Image(systemName: "chevron.left")
                                            .font(.system(size: 12, weight: .bold))
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Previous moods")
                                }
                                Spacer()
                                if moodPage < 2 {
                                    Button {
                                        withAnimation { moodPage += 1 }
                                    } label: {
                                        Image(systemName: "chevron.right")
                                            .font(.system(size: 12, weight: .bold))
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Next moods")
                                }
                            }
                        }
                        .frame(height: 120)
                        Button("Back") { choosingMood = false }.font(.caption2).buttonStyle(.plain)
                    } else {
                        Spacer(minLength: 0)
                        Button {
                            moodPage = max(0, moods.firstIndex(of: store.currentMood).map { $0 / 2 } ?? 0)
                            choosingMood = true
                        } label: {
                            AnimatedMoodMascot(mood: store.currentMood, size: 125, isActive: scenePhase == .active)
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Current mood \(store.currentMood). Tap to change.")
                        Text(store.currentMood).font(.headline)
                        Text("Tap to change mood").font(.caption2).foregroundStyle(.secondary)
                        Spacer(minLength: 0)
                    }
                }
                .padding(.horizontal, 5)
            }
        }
        .tint(purple)
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
