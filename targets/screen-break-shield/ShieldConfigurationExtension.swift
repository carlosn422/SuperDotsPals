import ManagedSettings
import ManagedSettingsUI
import UIKit

/// The Joy break screen iOS shows on paused apps. Shields only allow static artwork, so Joy appears as
/// her original still frame; the animated Joy is used inside MoodPals.
class ShieldConfigurationExtension: ShieldConfigurationDataSource {
  private static let background = UIColor(red: 0xF4 / 255, green: 0xFA / 255, blue: 0xF6 / 255, alpha: 1)
  private static let ink = UIColor(red: 0x1D / 255, green: 0x2B / 255, blue: 0x33 / 255, alpha: 1)
  private static let muted = UIColor(red: 0x6E / 255, green: 0x7D / 255, blue: 0x86 / 255, alpha: 1)
  private static let green = UIColor(red: 0x34 / 255, green: 0xB3 / 255, blue: 0x7E / 255, alpha: 1)

  private var joyBreak: ShieldConfiguration {
    ShieldConfiguration(
      backgroundBlurStyle: nil,
      backgroundColor: Self.background,
      icon: UIImage(named: "joy_break"),
      title: .init(text: "Time for a break!", color: Self.ink),
      subtitle: .init(text: "Great job! Let's take a little break from the screen.", color: Self.muted),
      primaryButtonLabel: .init(text: "OK", color: .white),
      primaryButtonBackgroundColor: Self.green,
      secondaryButtonLabel: nil)
  }

  override func configuration(shielding application: Application) -> ShieldConfiguration { joyBreak }
  override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration { joyBreak }
  override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration { joyBreak }
  override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration { joyBreak }
}
