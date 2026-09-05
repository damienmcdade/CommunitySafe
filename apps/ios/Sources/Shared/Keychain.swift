import Foundation
import Security

/// Minimal Keychain wrapper for the session tokens.
///
/// Tokens live in the Keychain rather than UserDefaults because UserDefaults is
/// readable from a device backup; `kSecAttrAccessibleAfterFirstUnlock` keeps the
/// token available to background work (geofence alerts, check-in expiry) while
/// still requiring the device to have been unlocked once since boot.
enum Keychain {
    private static let service = "app.communitysafe.auth"

    static func set(_ value: String?, for account: String) {
        guard let value, let data = value.data(using: .utf8) else {
            remove(account)
            return
        }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        if SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess {
            SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        } else {
            SecItemAdd(query.merging(attributes) { $1 } as CFDictionary, nil)
        }
    }

    static func get(_ account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func remove(_ account: String) {
        SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ] as CFDictionary)
    }

    enum Key {
        static let accessToken = "access_token"
        static let refreshToken = "refresh_token"
    }
}
