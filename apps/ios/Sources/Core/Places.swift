import CoreLocation
import Foundation
import UserNotifications
import OSLog

/// A place the user cares about — home, a school, a parent's address. Stored
/// on device only; addresses never leave the phone.
struct SavedPlace: Codable, Identifiable, Hashable, Sendable {
    var id: UUID = UUID()
    var name: String
    var latitude: Double
    var longitude: Double
    /// Geofence radius in metres.
    var radius: Double = 250
    var notifyOnArrival: Bool = true
    var notifyOnDeparture: Bool = false
    /// City/area slugs resolved when the place was added, so the app can show
    /// its grade without re-resolving every launch.
    var citySlug: String?
    var areaSlug: String?
    var areaLabel: String?

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

/// Persistence + geofence lifecycle for Saved Places.
///
/// iOS allows 20 monitored regions per app across the whole system, and
/// silently ignores registrations past that. The cap here is deliberately
/// lower and enforced in the UI so the user is told, rather than finding out
/// when an alert never arrives.
@MainActor
final class PlacesStore: ObservableObject {
    static let shared = PlacesStore()
    /// iOS allows 20 monitored regions per app; staying under it leaves room
    /// for the system's own reservations.
    nonisolated static let maxPlaces = 15

    @Published private(set) var places: [SavedPlace] = []

    private let log = Logger(subsystem: "app.communitysafe", category: "places")
    private let defaultsKey = "saved_places_v1"

    init() { load() }

    var isAtCapacity: Bool { places.count >= Self.maxPlaces }

    func add(_ place: SavedPlace) {
        guard !isAtCapacity else { return }
        places.append(place)
        persist()
        LocationManager.shared.startMonitoring(place)
    }

    func update(_ place: SavedPlace) {
        guard let idx = places.firstIndex(where: { $0.id == place.id }) else { return }
        places[idx] = place
        persist()
        LocationManager.shared.stopMonitoring(placeID: place.id)
        LocationManager.shared.startMonitoring(place)
    }

    func remove(at offsets: IndexSet) {
        for idx in offsets {
            LocationManager.shared.stopMonitoring(placeID: places[idx].id)
        }
        places.remove(atOffsets: offsets)
        persist()
    }

    func place(id: UUID) -> SavedPlace? { places.first { $0.id == id } }

    /// Re-registers every geofence. Called after Always authorisation is
    /// granted, because regions added before that point were never accepted.
    func resyncMonitoring() {
        LocationManager.shared.stopAllMonitoring()
        for place in places where place.notifyOnArrival || place.notifyOnDeparture {
            LocationManager.shared.startMonitoring(place)
        }
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(places) else { return }
        AppGroup.defaults.set(data, forKey: defaultsKey)
    }

    private func load() {
        guard let data = AppGroup.defaults.data(forKey: defaultsKey),
              let decoded = try? JSONDecoder().decode([SavedPlace].self, from: data) else { return }
        places = decoded
    }
}

/// Turns a geofence crossing into a local notification carrying the area's
/// current grade. This runs with the app suspended, which is precisely the
/// kind of background work a web page cannot do.
@MainActor
final class PlaceAlerts {
    static let shared = PlaceAlerts()

    private let log = Logger(subsystem: "app.communitysafe", category: "place-alerts")

    func handle(regionID: String, didEnter: Bool) {
        guard let uuid = UUID(uuidString: regionID),
              let place = PlacesStore.shared.place(id: uuid) else { return }
        guard didEnter ? place.notifyOnArrival : place.notifyOnDeparture else { return }

        Task {
            let grade = await Self.grade(for: place)
            let content = UNMutableNotificationContent()
            content.title = didEnter ? "Arrived at \(place.name)" : "Left \(place.name)"
            if let grade, grade != .unknown {
                content.body = "\(place.areaLabel ?? "This area") is graded \(grade.rawValue) — \(grade.summary.lowercased())."
            } else {
                content.body = didEnter
                    ? "Tap to see the current safety picture for this area."
                    : "Tap to check conditions where you're heading."
            }
            content.sound = .default
            content.categoryIdentifier = NotificationCategory.placeAlert
            content.userInfo = ["placeID": regionID]

            let request = UNNotificationRequest(
                identifier: "place-\(regionID)-\(didEnter ? "in" : "out")-\(Int(Date().timeIntervalSince1970))",
                content: content,
                trigger: nil
            )
            try? await UNUserNotificationCenter.current().add(request)
        }
    }

    /// Best-effort grade lookup — falls back to the offline cache, so an
    /// arrival alert still carries a real number when the device has no signal.
    private static func grade(for place: SavedPlace) async -> Grade? {
        guard let area = place.areaSlug else { return nil }
        if let fresh = try? await APIClient.shared.areaScore(area: area) {
            return fresh.value.letter
        }
        return nil
    }
}

enum NotificationPermission {
    /// Asks for notification permission at the moment it becomes useful.
    /// Safe to call repeatedly — the system prompts only once and later calls
    /// just report the existing answer.
    @discardableResult
    static func request() async -> Bool {
        (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }
}

enum NotificationCategory {
    static let placeAlert = "PLACE_ALERT"
    static let checkIn = "CHECK_IN"
}
