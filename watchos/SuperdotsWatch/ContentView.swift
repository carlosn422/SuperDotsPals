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

    private func selectMood(_ mood: String) {
        choosingMood = false
        store.currentMood = mood
        WKInterfaceDevice.current().play(.click)
        Task {
            do { try await sync.submitMood(mood, store: store) }
            catch { sync.message = "Mood could not sync. Please retry." }
        }
    }

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
                        .gesture(
                            DragGesture(minimumDistance: 20)
                                .onEnded { value in
                                    if value.translation.width < -35 && moodPage < moods.count - 1 {
                                        withAnimation(.easeInOut(duration: 0.15)) { moodPage += 1 }
                                    } else if value.translation.width > 35 && moodPage > 0 {
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
                        Button {
                            moodPage = max(0, moods.firstIndex(of: store.currentMood) ?? 0)
                            withAnimation(.none) { choosingMood = true }
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
