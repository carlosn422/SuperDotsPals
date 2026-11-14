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

struct DrinkButtons: View {
    @ObservedObject private var drinks = WatchDrinks.shared
    static let waterColor = Color(red: 0.29, green: 0.61, blue: 0.92)
    static let caffeineColor = Color(red: 0.77, green: 0.50, blue: 0.31)

    var body: some View {
        HStack(spacing: 18) {
            button("water", icon: "drop.fill", color: Self.waterColor, total: "\(Int(drinks.water.rounded())) oz", label: "Log \(Int(drinks.waterTap)) ounces of water")
            button("caffeine", icon: "cup.and.saucer.fill", color: Self.caffeineColor, total: "\(Int(drinks.caffeine.rounded())) mg", label: "Log \(Int(drinks.caffeineTap)) milligrams of caffeine")
        }
        .frame(maxWidth: .infinity)
        .task { await drinks.refresh() }
    }

    private func button(_ habit: String, icon: String, color: Color, total: String, label: String) -> some View {
        VStack(spacing: 3) {
            Button { Task { await drinks.log(habit) } } label: {
                ZStack {
                    Circle().fill(color.opacity(0.22))
                    Image(systemName: drinks.confirmed == habit ? "checkmark" : icon)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(color)
                }
                .frame(width: 38, height: 38)
            }
            .buttonStyle(.plain)
            .disabled(drinks.busy)
            .accessibilityLabel(label)
            Text(total).font(.system(size: 10, weight: .medium)).foregroundStyle(.secondary).accessibilityHidden(true)
        }
    }
}
