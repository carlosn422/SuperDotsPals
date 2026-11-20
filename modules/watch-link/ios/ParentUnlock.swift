import CryptoKit
import Foundation
import LocalAuthentication
import Security

/// Parent check before Screen Break apps are reopened on this iPhone. The parent picks Face ID (no passcode
/// fallback) or a 4-digit MoodPals code; two wrong codes in a row switch to Face ID until it succeeds.
enum ParentUnlock {
  private static let defaults = UserDefaults.standard
  private static let methodKey = "parentUnlock.method"
  private static let failuresKey = "parentUnlock.failures"
  private static let service = "com.superdotspals.parentUnlock"
  static let maxCodeTries = 2

  static var method: String { defaults.string(forKey: methodKey) ?? "faceID" }
  static var failures: Int { defaults.integer(forKey: failuresKey) }

  static func state() -> [String: Any] {
    ["method": method, "hasCode": readCode() != nil, "faceIdOnly": method == "code" && failures >= maxCodeTries, "biometry": biometry()]
  }

  static func biometry() -> String {
    let context = LAContext()
    var error: NSError?
    // A locked-out Face ID still counts, so failing Face ID on purpose never falls back to the passcode.
    guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
      || error?.code == LAError.biometryLockout.rawValue else { return "none" }
    switch context.biometryType {
    case .faceID: return "faceID"
    case .touchID: return "touchID"
    default: return "none"
    }
  }

  static func setMethod(_ newMethod: String, code: String?) -> Bool {
    if newMethod == "code" {
      guard let code, code.count == 4, code.allSatisfy(\.isNumber), saveCode(hash(code)) else { return false }
    } else if newMethod == "faceID" {
      deleteCode()
    } else {
      return false
    }
    defaults.set(newMethod, forKey: methodKey)
    defaults.set(0, forKey: failuresKey)
    return true
  }

  /// "ok", "wrong", or "faceID" when the code is locked out and Face ID is now required.
  static func checkCode(_ code: String) -> String {
    guard method == "code", failures < maxCodeTries, let saved = readCode() else { return "faceID" }
    if hash(code) == saved {
      defaults.set(0, forKey: failuresKey)
      return "ok"
    }
    let tries = failures + 1
    defaults.set(tries, forKey: failuresKey)
    return tries >= maxCodeTries ? "faceID" : "wrong"
  }

  /// Face ID only: the "Enter Passcode" fallback is hidden, so knowing the phone passcode doesn't help.
  /// Phones without Face ID or Touch ID fall back to the device passcode so the parent is never locked out.
  static func faceID(reason: String) async -> Bool {
    let context = LAContext()
    context.localizedFallbackTitle = ""
    let policy: LAPolicy = biometry() == "none" ? .deviceOwnerAuthentication : .deviceOwnerAuthenticationWithBiometrics
    guard (try? await context.evaluatePolicy(policy, localizedReason: reason)) == true else { return false }
    defaults.set(0, forKey: failuresKey)
    return true
  }

  private static func hash(_ code: String) -> Data {
    Data(SHA256.hash(data: Data(("moodpals.parentUnlock:" + code).utf8)))
  }

  private static var query: [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "code"]
  }

  private static func readCode() -> Data? {
    var q = query
    q[kSecReturnData as String] = true
    var item: CFTypeRef?
    return SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess ? item as? Data : nil
  }

  private static func saveCode(_ data: Data) -> Bool {
    deleteCode()
    var q = query
    q[kSecValueData as String] = data
    q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
  }

  private static func deleteCode() {
    SecItemDelete(query as CFDictionary)
  }
}
