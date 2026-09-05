import Foundation

/// Identifiers shared by the app, the widget extension and the Live Activity.
/// Kept in one place because a typo here fails silently at runtime — the
/// container just comes back nil and the widget quietly shows placeholder data.
enum AppGroup {
    static let identifier = "group.app.communitysafe"

    static var defaults: UserDefaults {
        UserDefaults(suiteName: identifier) ?? .standard
    }

    /// Shared on-disk container. Falls back to the process's own caches
    /// directory so a missing entitlement degrades to an app-local cache
    /// rather than crashing.
    static var containerURL: URL {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
            ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    }

    enum Key {
        static let preferredCity = "preferred_city"
        static let preferredArea = "preferred_area"
        static let premiumActive = "premium_active"
        static let premiumLastConfirmed = "widget_premium_last_confirmed"
    }
}
