import ManagedSettings
import ManagedSettingsUI
import UIKit

/// The Joy break screen iOS shows on paused apps. Apple shields only allow one still image at a system-set
/// size, so Joy is a tightly cropped frame of her animation; the animated Joy is used inside MoodPals.
class ShieldConfigurationExtension: ShieldConfigurationDataSource {
  // iOS draws shields in the phone's appearance, so every color adapts to light and dark mode for contrast.
  private static func dynamic(_ light: UInt32, _ dark: UInt32) -> UIColor {
    UIColor { $0.userInterfaceStyle == .dark ? rgb(dark) : rgb(light) }
  }
  private static func rgb(_ hex: UInt32) -> UIColor {
    UIColor(red: CGFloat(hex >> 16 & 0xFF) / 255, green: CGFloat(hex >> 8 & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
  }
  private static let background = dynamic(0xEAF7EF, 0x15241D)
  private static let ink = dynamic(0x1D2B33, 0xFFFFFF)
  private static let body = dynamic(0x33444D, 0xE3EEE8)
  private static let green = rgb(0x2E9E6A)

  private var joyBreak: ShieldConfiguration {
    ShieldConfiguration(
      backgroundBlurStyle: nil,
      backgroundColor: Self.background,
      icon: UIImage(named: "joy_break"),
      title: .init(text: "Time for a break!", color: Self.ink),
      subtitle: .init(text: "Great job! Let's take a little break from the screen.", color: Self.body),
      primaryButtonLabel: .init(text: "OK", color: .white),
      primaryButtonBackgroundColor: Self.green,
      secondaryButtonLabel: nil)
  }

  private static let group = UserDefaults(suiteName: "group.com.superdotspals.wellnest")

  /// A Screen Break (timer ended or locked from the Watch) wins over the owner's own daily limit.
  private var screenBreakOn: Bool {
    guard let group = Self.group else { return true }
    if group.bool(forKey: "screenBreak.manualLock") { return true }
    guard let data = group.data(forKey: "screenBreak.session"),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
    return json["status"] as? String == "restricted"
  }

  private var dailyLimit: ShieldConfiguration {
    let minutes = Self.group?.integer(forKey: "socialTrack.limitMinutes") ?? 0
    let limit = minutes % 60 == 0 ? "\(minutes / 60)h" : minutes > 60 ? "\(minutes / 60)h \(minutes % 60)m" : "\(minutes) min"
    return ShieldConfiguration(
      backgroundBlurStyle: nil,
      backgroundColor: Self.background,
      icon: UIImage(named: "joy_break"),
      title: .init(text: "Daily limit reached", color: Self.ink),
      subtitle: .init(text: "You've used your \(limit) on these apps today. How are you feeling? You can log it in MoodPals.", color: Self.body),
      primaryButtonLabel: .init(text: "Close app", color: .white),
      primaryButtonBackgroundColor: Self.green,
      secondaryButtonLabel: .init(text: "Ignore limit today", color: Self.body))
  }

  private var current: ShieldConfiguration { screenBreakOn ? joyBreak : dailyLimit }

  override func configuration(shielding application: Application) -> ShieldConfiguration { current }
  override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration { current }
  override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration { current }
  override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration { current }
}
