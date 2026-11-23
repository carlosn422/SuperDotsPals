import SwiftUI
import WatchKit

private enum Routine: String, CaseIterable, Identifiable {
    case calm = "Calm", box = "Box", unwind = "Unwind"
    var id: String { rawValue }
    var inhale: Int { 4 }
    var hold: Int { self == .box ? 4 : 0 }
    var exhale: Int { self == .unwind ? 6 : 4 }
    var rest: Int { self == .box ? 4 : 0 }

    /// Breathe in, hold, breathe out, hold (holds only for Box).
    var steps: [(name: String, seconds: Int)] {
        [("Breathe in", inhale), ("Hold", hold), ("Breathe out", exhale), ("Hold", rest)].filter { $0.seconds > 0 }
    }
    var cycle: Int { steps.reduce(0) { $0 + $1.seconds } }
}

/// Rounded square traced clockwise from its top-left corner, so each side (plus the corner after it) is a quarter.
private struct BreathSquare: Shape {
    func path(in rect: CGRect) -> Path {
        let r = rect.width * 0.22
        var p = Path()
        p.move(to: CGPoint(x: rect.minX + r, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
        p.addArc(center: CGPoint(x: rect.maxX - r, y: rect.minY + r), radius: r, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
        p.addArc(center: CGPoint(x: rect.maxX - r, y: rect.maxY - r), radius: r, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
        p.addArc(center: CGPoint(x: rect.minX + r, y: rect.maxY - r), radius: r, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        p.addArc(center: CGPoint(x: rect.minX + r, y: rect.minY + r), radius: r, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        p.closeSubpath()
        return p
    }
}

/// Same breathing as the iPhone: a short line glides around the square, one side per step (half the square per
/// step for routines without holds), with a tap on the wrist each time the step changes.
struct BreathingView: View {
    @EnvironmentObject var store: WatchStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var routine: Routine = .calm
    @State private var secondsLeft = 60
    /// Breathing time before the current run, and when the current run started.
    @State private var banked: TimeInterval = 0
    @State private var startedAt: Date?
    @State private var intro = 0
    @State private var finished = false
    @State private var lastStep = -1
    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    private let trail = 0.14

    private var running: Bool { startedAt != nil }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Picker("Routine", selection: $routine) {
                    ForEach(Routine.allCases) { item in Text(item.rawValue).tag(item) }
                }
                .frame(height: 44)
                .disabled(running || intro > 0)
                .onChange(of: routine) { _, _ in reset() }
                TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !running || reduceMotion)) { context in
                    let p = position(at: context.date)
                    ZStack {
                        BreathSquare().fill(Color.white.opacity(0.08))
                        BreathSquare().stroke(store.companion.color.opacity(0.25), lineWidth: 7)
                        if running || banked > 0 || finished {
                            BreathSquare().trim(from: max(0, p - trail), to: p)
                                .stroke(Color.white, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                            if p < trail {
                                BreathSquare().trim(from: 1 - (trail - p), to: 1)
                                    .stroke(Color.white, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                            }
                        }
                        if intro > 0 {
                            Text("\(intro)").font(.system(size: 40, weight: .bold)).monospacedDigit()
                        } else {
                            Circle().fill(store.companion.color).frame(width: 46, height: 46)
                                .scaleEffect(reduceMotion ? 1 : palScale(at: context.date))
                        }
                    }
                    .frame(width: 112, height: 112)
                    .padding(4)
                }
                Text(finished ? "Nice work!" : intro > 0 ? "Get comfortable" : running ? stepName(at: Date()) : banked > 0 ? "Paused" : "A moment for you")
                    .font(.headline).multilineTextAlignment(.center)
                Text(String(format: "%d:%02d left", secondsLeft / 60, secondsLeft % 60))
                    .font(.caption2).monospacedDigit().foregroundStyle(.secondary)
                Button(finished ? "Again" : running ? "Pause" : intro > 0 ? "Not yet" : banked > 0 ? "Resume" : "Start") { toggle() }
                    .buttonStyle(.borderedProminent)
                if banked > 0 || running { Button("Reset") { reset() }.font(.caption2) }
                Text("1-minute session · local only").font(.system(size: 10)).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Breathe")
        .onReceive(ticker) { _ in tick() }
    }

    private func elapsed(at date: Date) -> TimeInterval {
        banked + (startedAt.map { date.timeIntervalSince($0) } ?? 0)
    }

    /// Step index and how far into it (0...1) at `date`.
    private func step(at date: Date) -> (index: Int, progress: Double) {
        let steps = routine.steps
        var t = elapsed(at: date).truncatingRemainder(dividingBy: Double(routine.cycle))
        for (i, s) in steps.enumerated() {
            if t < Double(s.seconds) { return (i, t / Double(s.seconds)) }
            t -= Double(s.seconds)
        }
        return (steps.count - 1, 1)
    }

    private func stepName(at date: Date) -> String { routine.steps[step(at: date).index].name }

    /// 0...1 around the square for the current breath; with Reduce Motion it jumps to the end of each step.
    private func position(at date: Date) -> Double {
        guard running || banked > 0 else { return 0 }
        let (i, f) = step(at: date)
        let share = 1 / Double(routine.steps.count)
        return share * (Double(i) + (reduceMotion ? 1 : f))
    }

    private func palScale(at date: Date) -> CGFloat {
        guard running else { return 1 }
        let (i, f) = step(at: date)
        let eased = (1 - cos(f * .pi)) / 2
        switch routine.steps[i].name {
        case "Breathe in": return 1 + 0.12 * eased
        case "Breathe out": return 1.12 - 0.12 * eased
        default: return i > 0 && routine.steps[i - 1].name == "Breathe in" ? 1.12 : 1
        }
    }

    private func toggle() {
        if finished { reset(); return }
        if intro > 0 { intro = 0; return }
        if let startedAt {
            banked += Date().timeIntervalSince(startedAt)
            self.startedAt = nil
            return
        }
        if banked == 0 { intro = 3 } else { startedAt = Date() }
    }

    private func tick() {
        if intro > 0 {
            intro -= 1
            if intro == 0 { lastStep = -1; startedAt = Date() }
            return
        }
        guard running else { return }
        let now = Date()
        secondsLeft = max(0, 60 - Int(elapsed(at: now)))
        let index = step(at: now).index
        if index != lastStep {
            lastStep = index
            let name = routine.steps[index].name
            WKInterfaceDevice.current().play(name == "Breathe in" ? .directionUp : name == "Breathe out" ? .directionDown : .click)
        }
        if secondsLeft == 0 {
            startedAt = nil
            banked = 0
            finished = true
            store.sessionsCompleted += 1
        }
    }

    private func reset() {
        startedAt = nil
        banked = 0
        intro = 0
        lastStep = -1
        finished = false
        secondsLeft = 60
    }
}
