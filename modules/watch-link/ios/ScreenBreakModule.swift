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

    Function("parentUnlockState") { () -> [String: Any] in
      ParentUnlock.state()
    }

    Function("setParentUnlock") { (method: String, code: String?) -> Bool in
      ParentUnlock.setMethod(method, code: code)
    }

    Function("checkParentCode") { (code: String) -> String in
      ParentUnlock.checkCode(code)
    }

    AsyncFunction("parentFaceID") { (reason: String) async -> Bool in
      await ParentUnlock.faceID(reason: reason)
    }

    /// Individual authorization: the parent approves with Face ID or the passcode of their own iPhone.
    AsyncFunction("requestAuthorization") { () async throws -> Bool in
      try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
      ScreenBreakEngine.shared.selectionChanged()
      return AuthorizationCenter.shared.authorizationStatus == .approved
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
