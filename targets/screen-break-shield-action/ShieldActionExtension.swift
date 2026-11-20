import ManagedSettings

/// "OK" on the Joy break screen closes the paused app. Only the parent can lift the break, from MoodPals or the Watch.
class ShieldActionExtension: ShieldActionDelegate {
  override func handle(action: ShieldAction, for application: ApplicationToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
    completionHandler(.close)
  }

  override func handle(action: ShieldAction, for webDomain: WebDomainToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
    completionHandler(.close)
  }

  override func handle(action: ShieldAction, for category: ActivityCategoryToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
    completionHandler(.close)
  }
}
