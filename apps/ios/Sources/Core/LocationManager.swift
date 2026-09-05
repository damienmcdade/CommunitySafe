import CoreLocation
import Foundation
import OSLog
import Combine

/// Wraps CoreLocation for two distinct jobs:
///
/// 1. One-shot positioning, to answer "what neighbourhood am I standing in?"
/// 2. Region monitoring for Saved Places, so the app can notify the user when
///    they arrive at or leave a place they care about — including when the app
///    is not running.
///
/// Region monitoring is the reason the app requests Always authorisation, and
/// it is requested only after the user adds a place and asks to be alerted.
@MainActor
final class LocationManager: NSObject, ObservableObject {
    static let shared = LocationManager()

    @Published private(set) var coordinate: CLLocationCoordinate2D?
    @Published private(set) var authorization: CLAuthorizationStatus
    @Published private(set) var isLocating = false
    /// Set when the user is outside every covered city, so the UI can say so
    /// instead of showing a distant city's grade as though it were theirs.
    @Published private(set) var isOutsideCoverage = false

    private let log = Logger(subsystem: "app.communitysafe", category: "location")
    private let manager = CLLocationManager()
    private var pendingFixes: [CheckedContinuation<CLLocationCoordinate2D?, Never>] = []

    override init() {
        authorization = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        // A safety grade is a neighbourhood-level fact; asking for finer
        // accuracy than that would collect more precise location than the
        // feature needs.
        manager.distanceFilter = 250
    }

    var hasAnyAuthorization: Bool {
        authorization == .authorizedWhenInUse || authorization == .authorizedAlways
    }

    func requestWhenInUse() {
        guard authorization == .notDetermined else { return }
        manager.requestWhenInUseAuthorization()
    }

    /// Escalates to Always. Only called from the Saved Places flow, where the
    /// user has just asked for arrival alerts, so the system prompt arrives
    /// with obvious context.
    func requestAlways() {
        guard authorization == .authorizedWhenInUse else { return }
        manager.requestAlwaysAuthorization()
    }

    /// One-shot fix. Returns nil rather than throwing so callers can fall
    /// straight through to the user's manually chosen city.
    @discardableResult
    func currentLocation() async -> CLLocationCoordinate2D? {
        guard hasAnyAuthorization else { return nil }
        if let coordinate, !isLocating { return coordinate }
        isLocating = true
        manager.requestLocation()
        return await withCheckedContinuation { continuation in
            pendingFixes.append(continuation)
        }
    }

    private func resolveFixes(with coordinate: CLLocationCoordinate2D?) {
        isLocating = false
        let waiting = pendingFixes
        pendingFixes.removeAll()
        for continuation in waiting { continuation.resume(returning: coordinate) }
    }

    // MARK: - Region monitoring

    /// Maximum simultaneous regions is 20 per app on iOS; Saved Places is
    /// capped below that in `PlacesStore` so the app never silently drops one.
    func startMonitoring(_ place: SavedPlace) {
        guard authorization == .authorizedAlways,
              CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return }
        let region = CLCircularRegion(
            center: CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude),
            radius: max(100, min(place.radius, 5_000)),
            identifier: place.id.uuidString
        )
        region.notifyOnEntry = place.notifyOnArrival
        region.notifyOnExit = place.notifyOnDeparture
        manager.startMonitoring(for: region)
        log.notice("monitoring region \(place.name, privacy: .public)")
    }

    func stopMonitoring(placeID: UUID) {
        for region in manager.monitoredRegions where region.identifier == placeID.uuidString {
            manager.stopMonitoring(for: region)
        }
    }

    func stopAllMonitoring() {
        for region in manager.monitoredRegions { manager.stopMonitoring(for: region) }
    }

    var monitoredCount: Int { manager.monitoredRegions.count }
}

// MARK: - CLLocationManagerDelegate

extension LocationManager: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            let previous = self.authorization
            self.authorization = status
            if status == .denied || status == .restricted { self.resolveFixes(with: nil) }

            // Registering a region requires Always, and the Saved Places flow
            // necessarily saves the place BEFORE the Always prompt is answered
            // — so the first place a user adds got no geofence at all and its
            // arrival alerts silently never fired. Re-register everything the
            // moment the grant lands.
            if status == .authorizedAlways, previous != .authorizedAlways {
                PlacesStore.shared.resyncMonitoring()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        let coord = last.coordinate
        Task { @MainActor in
            self.coordinate = coord
            self.isOutsideCoverage = !CityRegistry.isCovered(coord)
            self.resolveFixes(with: coord)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.log.error("location failed: \(error.localizedDescription, privacy: .public)")
            self.resolveFixes(with: self.coordinate)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        Task { @MainActor in PlaceAlerts.shared.handle(regionID: region.identifier, didEnter: true) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        Task { @MainActor in PlaceAlerts.shared.handle(regionID: region.identifier, didEnter: false) }
    }
}
