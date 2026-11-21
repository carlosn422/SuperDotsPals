import ExpoModulesCore
import FamilyControls
import DeviceActivity
import SwiftUI

// SwiftUI lives here, apart from ScreenBreakModule, so its `View` doesn't clash with the Expo module DSL.

enum ScreenBreakPicker {
  static func present(from presenter: UIViewController, initial: FamilyActivitySelection? = ScreenBreakShared.loadSelection(),
                      title: String = "Apps to pause", completion: @escaping (FamilyActivitySelection?) -> Void) {
    var controller: UIViewController?
    let picker = ScreenBreakPickerView(selection: initial ?? FamilyActivitySelection(), title: title) { chosen in
      controller?.dismiss(animated: true)
      controller = nil
      completion(chosen)
    }
    let host = UIHostingController(rootView: picker)
    host.isModalInPresentation = true
    controller = host
    presenter.present(host, animated: true)
  }
}

struct ScreenBreakPickerView: SwiftUI.View {
  @State var selection: FamilyActivitySelection
  var title = "Apps to pause"
  let onDone: (FamilyActivitySelection?) -> Void

  var body: some SwiftUI.View {
    NavigationView {
      FamilyActivityPicker(selection: $selection)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) { Button("Cancel") { onDone(nil) } }
          ToolbarItem(placement: .confirmationAction) { Button("Done") { onDone(selection) } }
        }
    }
  }
}

/// Hosts Apple's DeviceActivityReport. The numbers are computed and drawn inside the report extension;
/// protected Screen Time data never reaches React Native or Supabase.
class ScreenTimeReportView: ExpoView {
  private var host: UIHostingController<AnyView>?
  static let requestKey = "screenBreak.reportRequest"

  /// request: period (day|week|month|year), start, end, prevStart (seconds), windows [[start, end]] for the child's sessions.
  func update(_ request: [String: Any]) {
    guard let start = (request["start"] as? NSNumber)?.doubleValue,
          let end = (request["end"] as? NSNumber)?.doubleValue, end > start else { return }
    let prevStart = (request["prevStart"] as? NSNumber)?.doubleValue ?? start
    let period = request["period"] as? String ?? "day"
    let windows = (request["windows"] as? [[NSNumber]] ?? []).compactMap { pair -> [Double]? in
      pair.count == 2 ? [pair[0].doubleValue, pair[1].doubleValue] : nil
    }
    // The extension reads which part of the filter is the current period and when the child's sessions ran.
    ScreenBreakShared.defaults.set([
      "period": period, "start": start, "end": end, "prevStart": prevStart,
      "windows": windows, "childName": request["childName"] as? String ?? "",
    ] as [String: Any], forKey: Self.requestKey)
    let interval = DateInterval(start: Date(timeIntervalSince1970: min(prevStart, start)), end: Date(timeIntervalSince1970: end))
    let filter = DeviceActivityFilter(
      segment: period == "day" ? .hourly(during: interval) : .daily(during: interval),
      users: .all,
      devices: .init([.iPhone]))
    // A new id per request makes SwiftUI rebuild the report when the period or child changes.
    let token = "\(period)-\(start)-\(end)-\(windows.count)"
    mount(AnyView(DeviceActivityReport(DeviceActivityReport.Context("moodpals.screenTime"), filter: filter).id(token)))
  }

  private func mount(_ view: AnyView) {
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
