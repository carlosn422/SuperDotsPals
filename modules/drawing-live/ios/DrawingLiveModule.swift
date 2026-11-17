import ActivityKit
import ExpoModulesCore

// Keep in sync with targets/stress-widget/CircleDrawingLiveActivity.swift: ActivityKit matches the type by name.
struct CircleDrawingAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var v: Int
        var bg: String
        var d: String
    }
    var group: String
}

private func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }

// Hands the app the ActivityKit push tokens the server needs: one to start the drawing Live Activity while MoodPals is
// closed, and one per running activity to replace its drawing. Only the newest drawing activity is kept.
public class DrawingLiveModule: Module {
    private var tokens: [String: [String: String]] = [:]
    private var tasks: [Task<Void, Never>] = []

    public func definition() -> ModuleDefinition {
        Name("DrawingLive")
        Events("onToken")

        OnCreate { self.observe() }
        OnDestroy { self.tasks.forEach { $0.cancel() } }

        Function("getTokens") { () -> [[String: String]] in Array(self.tokens.values) }

        Function("isEnabled") { () -> Bool in
            if #available(iOS 16.2, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
            return false
        }

        AsyncFunction("show") { (group: String, v: Int, bg: String, d: String) async in
            guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else { return }
            let state = CircleDrawingAttributes.ContentState(v: v, bg: bg, d: d)
            let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(8 * 3600))
            let running = Activity<CircleDrawingAttributes>.activities
            if let a = running.first(where: { $0.attributes.group == group }) {
                if a.content.state.v < v || a.content.state.bg != bg { await a.update(content) }
                return
            }
            for old in running { await old.end(nil, dismissalPolicy: .immediate) }
            _ = try? Activity.request(attributes: CircleDrawingAttributes(group: group), content: content, pushType: .token)
        }

        AsyncFunction("endAll") { () async in
            if #available(iOS 16.2, *) {
                for a in Activity<CircleDrawingAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
            }
        }
    }

    private func emit(_ t: [String: String]) {
        tokens[t["kind"]! + (t["activity"] ?? "")] = t
        sendEvent("onToken", t)
    }

    private func observe() {
        guard #available(iOS 17.2, *) else { return }
        tasks.append(Task { [weak self] in
            for await data in Activity<CircleDrawingAttributes>.pushToStartTokenUpdates {
                self?.emit(["kind": "start", "token": hex(data)])
            }
        })
        tasks.append(Task { [weak self] in
            for a in Activity<CircleDrawingAttributes>.activities { self?.watch(a) }
            for await a in Activity<CircleDrawingAttributes>.activityUpdates {
                // A newer drawing replaces the older card.
                for old in Activity<CircleDrawingAttributes>.activities where old.id != a.id {
                    await old.end(nil, dismissalPolicy: .immediate)
                }
                self?.watch(a)
            }
        })
    }

    @available(iOS 17.2, *)
    private func watch(_ a: Activity<CircleDrawingAttributes>) {
        tasks.append(Task { [weak self] in
            for await data in a.pushTokenUpdates {
                self?.emit(["kind": "update", "token": hex(data), "activity": a.id, "group": a.attributes.group])
            }
        })
    }
}
