import SwiftUI
import WatchKit

/// Water and caffeine logging on the user's own watch (never on mood-only family watches).
@MainActor
final class WatchDrinks: ObservableObject {
    static let shared = WatchDrinks()
    @Published var water: Double = 0
    @Published var caffeine: Double = 0
    @Published var busy = false
    @Published var confirmed: String? = nil
    // Set on the iPhone (Hydration / Caffeine settings), synced by WatchThemeSync.
    var waterTap: Double { let v = UserDefaults.standard.double(forKey: "water_tap_oz"); return v > 0 ? v : 8 }
    var caffeineTap: Double { let v = UserDefaults.standard.double(forKey: "caffeine_tap_mg"); return v > 0 ? v : 95 }

    // Rows are running daily totals; older rows used cups / servings.
    private static func amount(_ row: [String: Any]) -> Double {
        let n = (row["amount"] as? NSNumber)?.doubleValue ?? Double(row["amount"] as? String ?? "") ?? 0
        let unit = row["unit"] as? String
        return row["habit"] as? String == "water" ? (unit == "oz" ? n : n * 8) : (unit == "mg" ? n : n * 95)
    }
    private static func latest(_ rows: [[String: Any]], _ habit: String) -> Double {
        rows.first { $0["habit"] as? String == habit }.map(amount) ?? 0
    }
    private func todayRows() async throws -> [[String: Any]] {
        let sync = WatchThemeSync.shared
        let start = ISO8601DateFormatter().string(from: Calendar.current.startOfDay(for: .now))
        let path = "/rest/v1/habit_entries?select=habit,amount,unit,recorded_at&user_id=eq.\(sync.accountId)&habit=in.(water,caffeine)&recorded_at=gte.\(start)&order=recorded_at.desc&limit=200"
        let data = try await sync.restRequest(path, method: "GET")
        return try JSONSerialization.jsonObject(with: data) as? [[String: Any]] ?? []
    }

    // Re-read per-tap amounts so a change made on the iPhone applies to the very next tap.
    private func syncTaps() async {
        let path = "/rest/v1/user_settings?select=water_tap_oz,caffeine_tap_mg&user_id=eq.\(WatchThemeSync.shared.accountId)&limit=1"
        guard let data = try? await WatchThemeSync.shared.restRequest(path, method: "GET"),
              let row = (try? JSONSerialization.jsonObject(with: data) as? [[String: Any]])?.first else { return }
        for key in ["water_tap_oz", "caffeine_tap_mg"] {
            if let v = (row[key] as? NSNumber)?.doubleValue { UserDefaults.standard.set(v, forKey: key) }
        }
    }

    func refresh() async {
        guard !WatchProfile.moodOnly, WatchThemeSync.shared.connected, let rows = try? await todayRows() else { return }
        water = Self.latest(rows, "water")
        caffeine = Self.latest(rows, "caffeine")
    }

    func log(_ habit: String) async {
        guard habit == "water" || habit == "caffeine", !WatchProfile.moodOnly, WatchThemeSync.shared.connected, !busy else { return }
        busy = true
        defer { busy = false }
        await syncTaps()
        do {
            let next = Self.latest(try await todayRows(), habit) + (habit == "water" ? waterTap : caffeineTap)
            let row: [String: Any] = ["user_id": WatchThemeSync.shared.accountId, "habit": habit, "amount": next, "unit": habit == "water" ? "oz" : "mg"]
            let body = try JSONSerialization.data(withJSONObject: [row])
            _ = try await WatchThemeSync.shared.restRequest("/rest/v1/habit_entries", method: "POST", body: body, headers: ["Prefer": "return=minimal"])
            if habit == "water" { water = next } else { caffeine = next }
            WKInterfaceDevice.current().play(.success)
            confirmed = habit
            Task { try? await Task.sleep(for: .seconds(1.5)); if confirmed == habit { confirmed = nil } }
        } catch {
            NSLog("[WatchDrinks] Logging %@ failed: %@", habit, error.localizedDescription)
            WKInterfaceDevice.current().play(.failure)
        }
    }
}

/// Full-screen drink tracker opened from the top-left button on the home screen.
struct DrinksView: View {
    @ObservedObject private var drinks = WatchDrinks.shared
    static let waterColor = Color(red: 0.29, green: 0.61, blue: 0.92)
    static let caffeineColor = Color(red: 0.77, green: 0.50, blue: 0.31)
    // Daily goals set on the iPhone are not synced yet, so the watch uses the app's defaults.
    static let waterGoal = 64.0, caffeineLimit = 400.0

    var body: some View {
        HStack(spacing: 10) {
            DrinkCup(habit: "water", icon: "drop.fill", color: Self.waterColor,
                     total: drinks.water, goal: Self.waterGoal, unit: "oz", tap: drinks.waterTap)
            DrinkCup(habit: "caffeine", icon: "cup.and.saucer.fill", color: Self.caffeineColor,
                     total: drinks.caffeine, goal: Self.caffeineLimit, unit: "mg", tap: drinks.caffeineTap)
        }
        .padding(.horizontal, 4)
        .task { await drinks.refresh() }
    }
}

/// A cup that fills to today's level and animates up after each tap.
private struct DrinkCup: View {
    @ObservedObject private var drinks = WatchDrinks.shared
    let habit: String, icon: String, color: Color
    let total: Double, goal: Double, unit: String, tap: Double
    @State private var level: Double = 0

    private var target: Double { min(max(total / goal, 0), 1) }

    var body: some View {
        Button { Task { await drinks.log(habit) } } label: {
            VStack(spacing: 4) {
                ZStack {
                    CupShape().fill(Color.white.opacity(0.08))
                    Wave(level: level, phase: level * 12)
                        .fill(LinearGradient(colors: [color.opacity(0.75), color], startPoint: .top, endPoint: .bottom))
                        .clipShape(CupShape())
                    CupShape().stroke(color.opacity(0.9), lineWidth: 2)
                    Image(systemName: drinks.confirmed == habit ? "checkmark" : icon)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.35), radius: 2)
                }
                .frame(height: 92)
                Text("\(Int(total.rounded())) / \(Int(goal)) \(unit)")
                    .font(.system(size: 12, weight: .semibold)).monospacedDigit()
                Text("+\(Int(tap)) \(unit)")
                    .font(.system(size: 10, weight: .medium)).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .disabled(drinks.busy)
        .accessibilityLabel(habit == "water"
            ? "Water, \(Int(total.rounded())) of \(Int(goal)) ounces today. Tap to log \(Int(tap)) ounces."
            : "Caffeine, \(Int(total.rounded())) of \(Int(goal)) milligrams today. Tap to log \(Int(tap)) milligrams.")
        .onAppear { withAnimation(.easeOut(duration: 0.9)) { level = target } }
        .onChange(of: target) { _, next in withAnimation(.easeInOut(duration: 0.9)) { level = next } }
    }
}

/// A slightly tapered cup with a rounded base.
private struct CupShape: Shape {
    func path(in r: CGRect) -> Path {
        let inset = r.width * 0.12, radius = r.width * 0.16
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX - inset, y: r.maxY - radius))
        p.addQuadCurve(to: CGPoint(x: r.maxX - inset - radius, y: r.maxY), control: CGPoint(x: r.maxX - inset, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX + inset + radius, y: r.maxY))
        p.addQuadCurve(to: CGPoint(x: r.minX + inset, y: r.maxY - radius), control: CGPoint(x: r.minX + inset, y: r.maxY))
        p.closeSubpath()
        return p
    }
}

/// Liquid filled from the bottom up to `level` (0...1) with a gentle wave on top.
private struct Wave: Shape {
    var level: Double
    var phase: Double
    var animatableData: AnimatablePair<Double, Double> {
        get { AnimatablePair(level, phase) }
        set { level = newValue.first; phase = newValue.second }
    }
    func path(in r: CGRect) -> Path {
        guard level > 0 else { return Path() }
        let top = r.maxY - r.height * level
        let amp = level >= 1 ? 0 : min(3, r.height * 0.04)
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX, y: top))
        for x in stride(from: r.minX, through: r.maxX, by: 2) {
            let y = top + amp * sin((x - r.minX) / r.width * 2 * .pi + phase)
            p.addLine(to: CGPoint(x: x, y: y))
        }
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        p.closeSubpath()
        return p
    }
}
