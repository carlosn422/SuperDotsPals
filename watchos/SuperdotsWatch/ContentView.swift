import SwiftUI
import WatchKit

struct ContentView: View {
    @EnvironmentObject private var store: WatchStore
    @StateObject private var sync = WatchThemeSync()
    @Environment(\.scenePhase) private var scenePhase
    @State private var choosingMood = false

    private let moods = ["Joyful", "Calm", "Sad", "Angry", "Anxious", "Tired"]
    private let purple = Color(red: 0.47, green: 0.38, blue: 0.91)

    var body: some View {
        Group {
            if !sync.connected || sync.needsReconnect || sync.pairingActive {
                WatchSyncView(sync: sync)
            } else {
                VStack(spacing: 6) {
                    if choosingMood {
                        Text("How do you feel?").font(.caption).fontWeight(.semibold)
                        ScrollView {
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                                ForEach(moods, id: \.self) { mood in
                                    Button {
                                        choosingMood = false
                                        store.currentMood = mood
                                        WKInterfaceDevice.current().play(.click)
                                        Task {
                                            do { try await sync.submitMood(mood, store: store) }
                                            catch { sync.message = "Mood saved locally. Will retry when connected." }
                                        }
                                    } label: {
                                        VStack(spacing: 2) {
                                            AnimatedMoodMascot(mood: mood, size: 58, isActive: false)
                                            Text(mood).font(.system(size: 10, weight: .medium))
                                        }
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Select \(mood)")
                                }
                            }
                        }
                        Button("Back") { choosingMood = false }.font(.caption2).buttonStyle(.plain)
                    } else {
                        Spacer(minLength: 0)
                        Button {
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
