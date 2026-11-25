import ExpoModulesCore
import FamilyControls

/// Screen Break controls for the MoodPals UI. Enforcement lives in ScreenBreakEngine, not in JavaScript.
public class ScreenBreakModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ScreenBreak")
    Events("onState")

    OnStartObserving {
      ScreenBreakEngine.shared.onChange = { [weak self] state in self?.sendEvent("onState", state) }
    }
    OnStopObserving {
      ScreenBreakEngine.shared.onChange = nil
    }

    Function("getState") { () -> [String: Any] in
      ScreenBreakEngine.shared.state()
    }

    /// Same command format as the Watch: action, commandId, childId, minutes, sessionId, expectedVersion.
    Function("command") { (command: [String: Any]) -> [String: Any] in
      ScreenBreakEngine.shared.handle(command)
    }

    Function("setChildren") { (children: [[String: Any]]) in
      ScreenBreakEngine.shared.setChildren(children)
    }

    Function("setEntitlement") { (entitlement: [String: Any]) in
      ScreenBreakEngine.shared.setEntitlement(entitlement)
    }

    Function("pendingSync") { () -> [[String: Any]] in
      ScreenBreakEngine.shared.pendingSync()
    }

    Function("ackSync") { (saved: [String: Int]) in
      ScreenBreakEngine.shared.ackSync(saved)
    }

    /// Individual authorization: the parent approves with Face ID or the passcode of their own iPhone.
    AsyncFunction("requestAuthorization") { () async throws -> Bool in
      try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
      ScreenBreakEngine.shared.selectionChanged()
      return AuthorizationCenter.shared.authorizationStatus == .approved
    }

    /// Satellite mode (a family iPad or spare iPhone). Credentials live only in the Keychain.
    Function("satelliteState") { () -> [String: Any] in
      SatelliteLink.shared.state()
    }

    Function("satelliteSaveCredentials") { (credentials: [String: Any]) -> Bool in
      SatelliteLink.shared.saveCredentials(credentials)
    }

    AsyncFunction("satelliteSync") { (reason: String) async -> [String: Any] in
      await SatelliteLink.shared.sync(reason)
    }

    AsyncFunction("satelliteAccessToken") { () async throws -> String in
      try await SatelliteLink.shared.accessToken()
    }

    Function("satelliteRecover") { (code: String) -> [String: Any] in
      SatelliteLink.shared.recover(code)
    }

    /// Family Sharing child authorization is stronger (the child can't remove it); individual is the fallback.
    AsyncFunction("requestSatelliteAuthorization") { (kind: String) async throws -> Bool in
      try await AuthorizationCenter.shared.requestAuthorization(for: kind == "child" ? .child : .individual)
      let approved = AuthorizationCenter.shared.authorizationStatus == .approved
      if approved { SatelliteLink.shared.setAuthKind(kind == "child" ? "child" : "individual") }
      ScreenBreakEngine.shared.selectionChanged()
      return approved
    }

    /// Face ID / passcode of this device before sensitive family-device changes.
    AsyncFunction("authenticateGuardian") { (reason: String) async -> Bool in
      await SatelliteLink.authenticateGuardian(reason)
    }

    /// Apple's app picker. Returns the number of chosen apps, categories and websites, or nil when cancelled.
    AsyncFunction("pickApps") { (promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_NO_VIEW", "Unable to open the app picker.")
        return
      }
      ScreenBreakPicker.present(from: presenter) { chosen in
        guard let chosen else {
          promise.resolve(nil)
          return
        }
        ScreenBreakShared.saveSelection(chosen)
        ScreenBreakEngine.shared.selectionChanged()
        promise.resolve(ScreenBreakShared.selectionCount(chosen))
      }
    }.runOnQueue(.main)

    View(ScreenTimeReportView.self) {
      Prop("request") { (view: ScreenTimeReportView, request: [String: Any]) in
        view.update(request)
      }
    }
  }
}
