import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI

/// The owner's own app tracking for HRV and mood insights. Usage marks stay on this iPhone.
public class SocialTrackModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SocialTrack")

    Function("getState") { () -> [String: Any] in
      SocialTrackShared.checkLimit()
      let selection = SocialTrackShared.loadSelection()
      let order = SocialTrackShared.orderedApps()
      return [
        "authorized": AuthorizationCenter.shared.authorizationStatus == .approved,
        "enabled": SocialTrackShared.enabled,
        "limitMinutes": SocialTrackShared.limitMinutes,
        "limitHitToday": SocialTrackShared.limitHitToday,
        "ownerToday": SocialTrackShared.ownerMinutesToday(),
        // Indexes of the apps chosen now (marks may also name apps removed since).
        "apps": order.enumerated().compactMap { selection?.applicationTokens.contains($0.element) == true ? $0.offset : nil },
        "groupCount": (selection?.categoryTokens.count ?? 0) + (selection?.webDomainTokens.count ?? 0),
      ]
    }

    /// enabled, limitMinutes (0 = no limit). Restarts monitoring with the current choice.
    Function("configure") { (enabled: Bool, limitMinutes: Int) throws in
      SocialTrackShared.defaults.set(enabled, forKey: SocialTrackShared.enabledKey)
      SocialTrackShared.defaults.set(max(0, limitMinutes), forKey: SocialTrackShared.limitKey)
      if !enabled || limitMinutes <= 0 { SocialTrackShared.clearLimit() }
      if enabled { try SocialTrackShared.start() } else { SocialTrackShared.stop() }
    }

    /// Marks since `since` (seconds): [{app, minutes, at, family}] with `at` in seconds.
    Function("marks") { (since: Double) -> [[String: Any]] in
      SocialTrackShared.loadMarks().filter { $0.at.timeIntervalSince1970 >= since }.map {
        ["app": $0.app, "minutes": $0.minutes, "at": $0.at.timeIntervalSince1970, "family": $0.family == true, "member": $0.member ?? ""]
      }
    }

    /// Minutes per person per day: [{day: "y-m-d", who: "you" or member id, minutes}].
    Function("daily") { () -> [[String: Any]] in
      SocialTrackShared.loadDaily().flatMap { day, people in
        people.map { ["day": day, "who": $0.key, "minutes": $0.value] as [String: Any] }
      }
    }

    AsyncFunction("pickApps") { (promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_NO_VIEW", "Unable to open the app picker.")
        return
      }
      ScreenBreakPicker.present(from: presenter, initial: SocialTrackShared.loadSelection(), title: "Apps to track") { chosen in
        guard let chosen else {
          promise.resolve(nil)
          return
        }
        SocialTrackShared.saveSelection(chosen)
        try? SocialTrackShared.start()
        promise.resolve(chosen.applicationTokens.count + chosen.categoryTokens.count + chosen.webDomainTokens.count)
      }
    }.runOnQueue(.main)

    View(SocialAppLabelView.self) {
      Prop("app") { (view: SocialAppLabelView, app: Int) in
        view.update(app)
      }
    }
  }
}

/// Apple only lets the app show a chosen app's name and icon through its own Label view.
class SocialAppLabelView: ExpoView {
  private var host: UIHostingController<AnyView>?

  func update(_ app: Int) {
    let order = SocialTrackShared.orderedApps()
    let view: AnyView = app >= 0 && app < order.count
      ? AnyView(Label(order[app]).labelStyle(.titleAndIcon).font(.system(size: 15, weight: .bold)).lineLimit(1))
      : AnyView(Label("Other apps & sites", systemImage: "square.grid.2x2").font(.system(size: 15, weight: .bold)))
    if let host {
      host.rootView = view
      return
    }
    let controller = UIHostingController(rootView: view)
    controller.view.backgroundColor = .clear
    controller.view.translatesAutoresizingMaskIntoConstraints = false
    addSubview(controller.view)
    NSLayoutConstraint.activate([
      controller.view.topAnchor.constraint(equalTo: topAnchor),
      controller.view.bottomAnchor.constraint(equalTo: bottomAnchor),
      controller.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      controller.view.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
    host = controller
  }
}
