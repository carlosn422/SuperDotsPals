import SwiftUI

private enum Routine: String, CaseIterable, Identifiable {
    case calm = "Calm", box = "Box", unwind = "Unwind"
    var id: String { rawValue }
    var inhale: Int { 4 }
    var hold: Int { self == .box ? 4 : 0 }
    var exhale: Int { self == .unwind ? 6 : 4 }
    var rest: Int { self == .box ? 4 : 0 }
}

struct BreathingView: View {
    @EnvironmentObject var store: WatchStore
    @State private var routine: Routine = .calm
    @State private var secondsLeft = 60
    @State private var elapsed = 0
    @State private var running = false
    @State private var finished = false
    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Picker("Routine", selection: $routine) {
                    ForEach(Routine.allCases) { item in Text(item.rawValue).tag(item) }
                }
                .onChange(of: routine) { _, _ in reset() }
                Text(finished ? "Nice work! ✨" : running ? phase : "A moment for you")
                    .font(.headline).multilineTextAlignment(.center)
                ZStack {
                    Circle().fill(store.companion.color.opacity(0.2)).frame(width: 128, height: 128)
                    Circle().fill(store.companion.color)
                        .frame(width: running && phase == "Breathe in" ? 106 : 86,
                               height: running && phase == "Breathe in" ? 106 : 86)
                        .animation(.easeInOut(duration: 1), value: elapsed)
                    Text(String(format: "%d:%02d", secondsLeft/60, secondsLeft%60))
                        .font(.title2.bold()).foregroundStyle(.white)
                }
                Button(finished ? "Again" : running ? "Pause" : "Start") {
                    if finished { reset() } else { running.toggle() }
                }
                .buttonStyle(.borderedProminent)
                Button("Reset") { reset() }.font(.caption2)
                Text("1-minute sample session · local only").font(.system(size: 10)).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Breathe")
        .onReceive(ticker) { _ in
            guard running else { return }
            secondsLeft = max(0, secondsLeft - 1)
            elapsed += 1
            if secondsLeft == 0 {
                running = false
                finished = true
                store.sessionsCompleted += 1
            }
        }
    }

    private var phase: String {
        let steps: [(String, Int)] = [("Breathe in",routine.inhale),("Hold",routine.hold),("Breathe out",routine.exhale),("Rest",routine.rest)].filter{$0.1 > 0}
        let period = steps.reduce(0) { $0 + $1.1 }
        var position = elapsed % period
        for (title, length) in steps {
            if position < length { return title }
            position -= length
        }
        return "Breathe gently"
    }

    private func reset() {
        running = false
        finished = false
        elapsed = 0
        secondsLeft = 60
    }
}
