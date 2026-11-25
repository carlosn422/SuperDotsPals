import SwiftUI
import WatchKit

/// Family devices (iPads / spare iPhones) on the parent's account. The watch talks to MoodPals directly
/// for these; the device itself enforces the timer and acknowledges each command.
struct WatchFamilyDevice: Identifiable, Hashable {
    let id: String
    let name: String
    let isPad: Bool
    let ready: Bool
    let restricted: Bool
}

struct WatchDeviceSession: Equatable {
    let id: String
    let childId: String
    let deviceId: String
    let deadline: Date
}

struct WatchDeviceCommand: Equatable {
    let id: String
    let deviceId: String
    let type: String
    let childId: String?
    let minutes: Int?
}

@MainActor
final class WatchFamilyDevicesStore: ObservableObject {
    static let shared = WatchFamilyDevicesStore()
    static let phone = "phone"
    @Published private(set) var devices: [WatchFamilyDevice] = []
    @Published private(set) var defaultId = phone
    @Published private(set) var sessions: [WatchDeviceSession] = []
    @Published private(set) var pending: [WatchDeviceCommand] = []
    @Published private(set) var busy = false
    @Published var error: String?
    /// The device picked for the next timer; nil uses the parent's default.
    @Published var picked: String?

    var selectedId: String {
        if let picked, picked == Self.phone || devices.contains(where: { $0.id == picked }) { return picked }
        return devices.contains(where: { $0.id == defaultId }) ? defaultId : Self.phone
    }
    var selected: WatchFamilyDevice? { devices.first { $0.id == selectedId } }

    func session(on device: String) -> WatchDeviceSession? {
        sessions.first { $0.deviceId == device && $0.deadline > Date() }
    }

    func pending(on device: String) -> WatchDeviceCommand? {
        pending.first { $0.deviceId == device }
    }

    /// One device per member: the family device this member's timer runs (or is starting) on.
    func device(usedBy child: String) -> WatchFamilyDevice? {
        let id = sessions.first { $0.childId == child && $0.deadline > Date() }?.deviceId
            ?? pending.first { $0.type == "START_SESSION" && $0.childId == child }?.deviceId
        return devices.first { $0.id == id }
    }

    func load() async {
        let sync = WatchThemeSync.shared
        let now = ISO8601DateFormatter().string(from: Date())
        do {
            async let d = sync.restRequest("/rest/v1/family_devices?select=id,name,device_type,status,auth_status,selection_count,restricted,last_sync_at&status=eq.active&order=created_at", method: "GET")
            async let p = sync.restRequest("/rest/v1/family_device_prefs?select=default_device_id", method: "GET")
            async let s = sync.restRequest("/rest/v1/screen_break_sessions?select=id,child_id,family_device_id,deadline_at&status=eq.active&family_device_id=not.is.null&deadline_at=gt.\(now)", method: "GET")
            async let x = sync.restRequest("/rest/v1/screen_break_sessions?select=family_device_id,deadline_at&status=eq.active&family_device_id=not.is.null&deadline_at=lte.\(now)", method: "GET")
            async let c = sync.restRequest("/rest/v1/family_device_commands?select=id,device_id,type,child_id,minutes,expires_at&status=in.(pending,delivered)&expires_at=gt.\(now)&order=seq", method: "GET")
            let (dd, pp, ss, cc, xx) = try await (d, p, s, c, x)
            // A timer that ran out before the device synced has already paused its apps there.
            var ranOut: [String: Date] = [:]
            for r in rows(xx) {
                if let device = r["family_device_id"] as? String, let at = (r["deadline_at"] as? String).flatMap(Self.date) {
                    ranOut[device] = max(at, ranOut[device] ?? .distantPast)
                }
            }
            devices = rows(dd).compactMap { r in
                guard let id = r["id"] as? String, let name = r["name"] as? String else { return nil }
                return WatchFamilyDevice(id: id, name: name, isPad: r["device_type"] as? String != "iphone",
                                         ready: r["auth_status"] as? String == "approved" && ((r["selection_count"] as? NSNumber)?.intValue ?? 0) > 0,
                                         restricted: r["restricted"] as? Bool == true
                                            || (ranOut[id].map { $0 > ((r["last_sync_at"] as? String).flatMap(Self.date) ?? .distantPast) } ?? false))
            }
            defaultId = rows(pp).first?["default_device_id"] as? String ?? Self.phone
            sessions = rows(ss).compactMap { r in
                guard let id = r["id"] as? String, let child = r["child_id"] as? String, let device = r["family_device_id"] as? String,
                      let deadline = (r["deadline_at"] as? String).flatMap(Self.date) else { return nil }
                return WatchDeviceSession(id: id, childId: child, deviceId: device, deadline: deadline)
            }
            pending = rows(cc).compactMap { r in
                guard let id = r["id"] as? String, let device = r["device_id"] as? String, let type = r["type"] as? String else { return nil }
                return WatchDeviceCommand(id: id, deviceId: device, type: type, childId: r["child_id"] as? String, minutes: (r["minutes"] as? NSNumber)?.intValue)
            }
        } catch {
            // Family Setup watches and signed-out watches only control the iPhone.
        }
    }

    @discardableResult
    func command(_ type: String, device: String, minutes: Int? = nil, child: String? = nil) async -> Bool {
        guard !busy else { return false }
        busy = true
        error = nil
        defer { busy = false }
        var params: [String: Any] = ["p_device": device, "p_type": type]
        if let minutes { params["p_minutes"] = minutes }
        if let child { params["p_child"] = child }
        do {
            _ = try await WatchThemeSync.shared.rpc("family_device_command", params)
            WKInterfaceDeviceHaptic.play(.click)
            await load()
            return true
        } catch {
            self.error = Self.message(error)
            return false
        }
    }

    func cancel(_ command: WatchDeviceCommand) async {
        _ = try? await WatchThemeSync.shared.rpc("family_device_cancel_command", ["p_command": command.id])
        await load()
    }

    private func rows(_ data: Data) -> [[String: Any]] {
        (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []
    }

    private static func message(_ error: Error) -> String {
        // PostgREST errors carry the database message ("Mia is using Family iPad (12 min left)…").
        if case let WatchThemeSync.SyncError.server(_, _, detail) = error,
           let range = detail.range(of: #""message":"([^"]+)"#, options: .regularExpression) {
            return String(detail[range].dropFirst(11))
        }
        return "Can't reach MoodPals. Check your connection and try again."
    }

    static func date(_ text: String) -> Date? {
        let precise = ISO8601DateFormatter()
        precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = precise.date(from: text) { return d }
        if let d = ISO8601DateFormatter().date(from: text) { return d }
        let pg = DateFormatter()
        pg.locale = Locale(identifier: "en_US_POSIX")
        pg.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXXXX"
        return pg.date(from: text)
    }
}

enum WKInterfaceDeviceHaptic {
    static func play(_ type: WKHapticType) { WKInterfaceDevice.current().play(type) }
}

/// Top-bar button that shows where the timer or lock goes. Only shown once a family device is linked.
struct BreakDeviceButton: View {
    @ObservedObject private var store = WatchFamilyDevicesStore.shared
    @State private var choosing = false

    var body: some View {
        if !store.devices.isEmpty {
            Button { choosing = true } label: {
                Image(systemName: store.selected?.isPad == true ? "ipad" : "iphone")
            }
            .accessibilityLabel("Device: \(store.selected?.name ?? "This iPhone")")
            .sheet(isPresented: $choosing) { DeviceChoiceList { choosing = false } }
        }
    }
}

private struct DeviceChoice: Identifiable {
    let id: String
    let name: String
    let icon: String
}

/// One tap picks this iPhone or a family device. The default comes first; busy devices show who and how long.
struct DeviceChoiceList: View {
    @ObservedObject private var store = WatchFamilyDevicesStore.shared
    @ObservedObject private var phone = WatchScreenBreakStore.shared
    let picked: () -> Void

    private var choices: [DeviceChoice] {
        let all = [DeviceChoice(id: WatchFamilyDevicesStore.phone, name: "This iPhone", icon: "iphone")]
            + store.devices.map { DeviceChoice(id: $0.id, name: $0.name, icon: $0.isPad ? "ipad" : "iphone") }
        return all.filter { $0.id == store.defaultId } + all.filter { $0.id != store.defaultId }
    }

    var body: some View {
        List(choices) { c in
            Button {
                store.picked = c.id
                picked()
            } label: {
                HStack {
                    Image(systemName: c.icon)
                    VStack(alignment: .leading) {
                        Text(c.name).lineLimit(1)
                        detail(c.id)
                    }
                    Spacer()
                    if c.id == store.selectedId { Image(systemName: "checkmark").foregroundStyle(BreakStyle.green) }
                }
            }
        }
        .navigationTitle("Device")
    }

    @ViewBuilder private func detail(_ id: String) -> some View {
        if id == WatchFamilyDevicesStore.phone, let s = phone.session, s.isRunning {
            (Text("\(s.childName) · ") + Text(s.deadline, style: .timer)).font(.caption2).foregroundStyle(BreakStyle.green)
        } else if let s = store.session(on: id) {
            (Text("\(phone.children.first { $0.id == s.childId }?.name ?? "Someone") · ") + Text(s.deadline, style: .timer))
                .font(.caption2).foregroundStyle(BreakStyle.green)
        } else if id == store.defaultId {
            Text("Default").font(.caption2).foregroundStyle(.secondary)
        }
    }
}

/// Lock / Unlock for a family device: one tap sends the command; the device confirms within seconds.
struct SatelliteLockView: View {
    let device: WatchFamilyDevice
    @ObservedObject private var store = WatchFamilyDevicesStore.shared
    @ObservedObject private var phone = WatchScreenBreakStore.shared

    var body: some View {
        let pending = store.pending(on: device.id)
        let locked = device.restricted
        Group {
            if let session = store.session(on: device.id) {
                VStack(spacing: 6) {
                    Text("\(phone.children.first { $0.id == session.childId }?.name ?? "Someone") is using \(device.name)")
                        .font(.footnote).multilineTextAlignment(.center)
                    Text(timerInterval: Date()...max(Date(), session.deadline), countsDown: true)
                        .font(.system(size: 30, weight: .bold, design: .rounded)).monospacedDigit()
                }
            } else if !device.ready {
                Text("Finish setup on \(device.name): allow Screen Time and choose apps.").font(.footnote).multilineTextAlignment(.center)
            } else {
                VStack(spacing: 4) {
                    Button {
                        Task { @MainActor in
                            if await store.command(locked ? "UNLOCK_APPS" : "LOCK_APPS", device: device.id) == false {
                                WKInterfaceDeviceHaptic.play(.failure)
                            }
                        }
                    } label: {
                        BreakLock(locked: locked, size: 80)
                            .opacity(pending != nil || store.busy ? 0.3 : 1)
                            .frame(width: 136, height: 136)
                            .background(Circle().fill((locked ? BreakStyle.red : BreakStyle.green).opacity(0.16)))
                            .overlay { if pending != nil || store.busy { ProgressView().scaleEffect(1.6).tint(.white) } }
                            .animation(.easeInOut(duration: 0.35), value: locked)
                    }
                    .buttonStyle(.plain)
                    .disabled(pending != nil || store.busy)
                    .accessibilityLabel(pending != nil ? "Waiting for \(device.name)" : locked ? "\(device.name) apps locked. Unlock" : "\(device.name) apps unlocked. Lock")
                    if let text = store.error {
                        Text(text).font(.caption2).foregroundStyle(BreakStyle.red).multilineTextAlignment(.center)
                    }
                }
            }
        }
        .task(id: device.id) {
            while !Task.isCancelled {
                await store.load()
                try? await Task.sleep(for: .seconds(store.pending(on: device.id) == nil ? 10 : 3))
            }
        }
    }
}

/// Start / add time / end for one child on a family device.
struct RemoteBreakView: View {
    let child: WatchBreakChild
    let device: WatchFamilyDevice
    @ObservedObject private var store = WatchFamilyDevicesStore.shared
    @ObservedObject private var phone = WatchScreenBreakStore.shared
    @AppStorage("screenBreak.lastMinutes") private var lastMinutes = 30
    @State private var minutes = 30

    private func name(_ id: String?) -> String { phone.children.first { $0.id == id }?.name ?? "Someone" }

    var body: some View {
        Group {
            if let command = store.pending(on: device.id) {
                VStack(spacing: 8) {
                    ProgressView()
                    Text(command.type == "START_SESSION" ? "Starting on \(device.name)…" : command.type == "EXTEND_SESSION" ? "Updating timer…" : command.type == "UNLOCK_APPS" ? "Unlocking…" : "Lock pending…")
                        .font(.footnote).multilineTextAlignment(.center)
                    if command.type == "START_SESSION" {
                        Button("Cancel") { Task { await store.cancel(command) } }.buttonStyle(BreakButtonStyle(kind: .secondary, compact: true))
                    }
                }
            } else if let session = store.session(on: device.id) {
                ScrollView {
                    VStack(spacing: 8) {
                        Text(session.childId == child.id ? child.name : "\(name(session.childId)) is using \(device.name)")
                            .font(.footnote).multilineTextAlignment(.center)
                        Text(timerInterval: Date()...max(Date(), session.deadline), countsDown: true)
                            .font(.system(size: 30, weight: .bold, design: .rounded)).monospacedDigit()
                        Button("+15 min") { Task { await store.command("EXTEND_SESSION", device: device.id, minutes: 15) } }
                            .buttonStyle(BreakButtonStyle(kind: .primary))
                        Button("End Now") { Task { await store.command("END_SESSION", device: device.id) } }
                            .buttonStyle(BreakButtonStyle(kind: .destructive))
                        error
                    }
                }
            } else if !device.ready {
                Text("Finish setup on \(device.name): allow Screen Time and choose apps.").font(.footnote).multilineTextAlignment(.center)
            } else {
                VStack(spacing: 4) {
                    DurationDial(minutes: $minutes, range: 5...180)
                    error
                }
                .disabled(store.busy)
                .toolbar {
                    ToolbarItemGroup(placement: .bottomBar) {
                        Spacer()
                        HStack(spacing: 8) {
                            BreakMemberName(name: child.name)
                            BreakCornerButton(systemImage: "play.fill", color: BreakStyle.green, busy: store.busy, label: "Start for \(child.name) on \(device.name)") {
                                let chosen = minutes
                                Task {
                                    if await store.command("START_SESSION", device: device.id, minutes: chosen, child: child.id) { lastMinutes = chosen }
                                }
                            }
                            .disabled(store.busy)
                        }
                    }
                }
            }
        }
        .onAppear { minutes = min(180, max(5, (lastMinutes / 5) * 5)) }
        .task {
            // The device acknowledges within seconds when online; poll while this screen is open.
            while !Task.isCancelled {
                await store.load()
                try? await Task.sleep(for: .seconds(store.pending(on: device.id) == nil ? 10 : 3))
            }
        }
    }

    @ViewBuilder private var error: some View {
        if let text = store.error {
            Text(text).font(.caption2).foregroundStyle(BreakStyle.red).multilineTextAlignment(.center)
        }
    }
}
