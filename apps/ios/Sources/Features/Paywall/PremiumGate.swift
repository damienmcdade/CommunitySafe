import Foundation

/// What Premium actually unlocks.
///
/// Deliberately narrow. The whole safety picture — grades for every covered city, the map, trends, recent reports and safety
/// check-ins — is free, so anyone who installs the app can use it and a
/// reviewer can evaluate it without a purchase. Premium buys the feature that
/// costs us ongoing background work: monitored Saved Places.
enum PremiumGate {
    /// Saved Places available without a subscription.
    static let freePlaceLimit = 1

    static func placeLimit(isPremium: Bool) -> Int {
        isPremium ? PlacesStore.maxPlaces : freePlaceLimit
    }

    /// Arrival/departure geofence alerts are the paid capability.
    static func canUseArrivalAlerts(isPremium: Bool) -> Bool { isPremium }
}
