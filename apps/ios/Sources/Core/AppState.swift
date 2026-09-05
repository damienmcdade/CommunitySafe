import CoreLocation
import Combine
import Foundation
import OSLog
import WidgetKit

/// Central view model. Owns the selected city/area and the three payloads the
/// UI renders (score, trend, recent reports), plus the loading and offline
/// state that goes with them.
/// The app's top-level destinations.
enum AppTab: String, Hashable, CaseIterable {
    case now, map, trends, safety, places

    /// Accepts the hosts used by widget and Live Activity deep links
    /// (`communitysafeapp://checkin`) as well as the plain tab names.
    init?(routeName: String) {
        switch routeName.lowercased() {
        case "now", "grade", "area": self = .now
        case "map": self = .map
        case "trends": self = .trends
        case "safety", "checkin", "check-in": self = .safety
        case "places": self = .places
        default: return nil
        }
    }
}

@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()

    // Selection
    @Published var city: City {
        didSet {
            guard city != oldValue else { return }
            AppGroup.defaults.set(city.slug, forKey: AppGroup.Key.preferredCity)
            area = nil
            areas = []
            WidgetCenter.shared.reloadAllTimelines()
            Task { await refresh() }
        }
    }

    /// nil means "whole city".
    @Published var area: Area? {
        didSet {
            guard area?.slug != oldValue?.slug else { return }
            AppGroup.defaults.set(area?.slug, forKey: AppGroup.Key.preferredArea)
            WidgetCenter.shared.reloadAllTimelines()
            Task { await refresh() }
        }
    }

    // Payloads
    @Published private(set) var score: SafetyScore?
    @Published private(set) var trend: TrendReport?
    @Published private(set) var reports: [IncidentReport] = []
    @Published private(set) var areas: [Area] = []

    /// Which tab is showing. Owned here rather than by the view so a widget
    /// or Live Activity deep link can route to it.
    @Published var selectedTab: AppTab = .now

    // Status
    @Published private(set) var isLoading = false
    @Published private(set) var isShowingCachedData = false
    @Published private(set) var lastUpdated: Date?
    @Published private(set) var errorMessage: String?
    @Published private(set) var didAutoDetectLocation = false

    private let log = Logger(subsystem: "app.communitysafe", category: "state")
    private var refreshTask: Task<Void, Never>?

    init() {
        let saved = AppGroup.defaults.string(forKey: AppGroup.Key.preferredCity)
        city = saved.flatMap { CityRegistry.city(slug: $0) }
            ?? CityRegistry.city(slug: "san-francisco")
            ?? CityRegistry.all[0]
    }

    var displayLabel: String { area?.label ?? "\(city.label) citywide" }

    var scopeIsCitywide: Bool { area == nil }

    // MARK: - Loading

    /// Cancels any in-flight refresh first, so rapidly switching city doesn't
    /// let a slow earlier response overwrite the newer selection.
    func refresh() async {
        refreshTask?.cancel()
        let task = Task { await performRefresh() }
        refreshTask = task
        await task.value
    }

    private func performRefresh() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let citySlug = city.slug
        let areaSlug = area?.slug

        async let scoreResult = fetchScore(city: citySlug, area: areaSlug)
        async let trendResult = fetchTrend(city: citySlug, area: areaSlug)
        async let areasResult = fetchAreas(city: citySlug)
        async let reportsResult = fetchReports(area: areaSlug)

        let (s, t, a, r) = await (scoreResult, trendResult, areasResult, reportsResult)
        guard !Task.isCancelled else { return }

        if let s {
            score = s.value
            lastUpdated = s.fetchedAt
            isShowingCachedData = s.isFromCache
            WidgetCenter.shared.reloadAllTimelines()
        }
        if let t { trend = t.value }
        if let a { areas = a.value.areas }
        reports = r

        if s == nil {
            errorMessage = "Couldn't load the safety picture for \(displayLabel). Pull to try again."
        }
    }

    private func fetchScore(city: String, area: String?) async -> Fresh<SafetyScore>? {
        do {
            if let area { return try await APIClient.shared.areaScore(area: area) }
            return try await APIClient.shared.citywideScore(city: city)
        } catch {
            log.error("score failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private func fetchTrend(city: String, area: String?) async -> Fresh<TrendReport>? {
        do {
            if let area { return try await APIClient.shared.areaTrend(area: area) }
            return try await APIClient.shared.citywideTrend(city: city)
        } catch { return nil }
    }

    private func fetchAreas(city: String) async -> Fresh<AreasResponse>? {
        try? await APIClient.shared.areas(city: city)
    }

    private func fetchReports(area: String?) async -> [IncidentReport] {
        guard let area else { return [] }
        guard let fresh = try? await APIClient.shared.recentReports(area: area) else { return [] }
        return fresh.value.reports
    }

    // MARK: - Location

    /// Moves the selection to wherever the user actually is. Only overrides a
    /// manual choice on first run, so someone checking on a relative in another
    /// city doesn't get yanked back home on every launch.
    func adoptCurrentLocation(force: Bool = false) async {
        guard force || !didAutoDetectLocation else { return }
        guard let coord = await LocationManager.shared.currentLocation() else { return }
        didAutoDetectLocation = true
        guard let nearest = CityRegistry.nearest(to: coord) else { return }
        if nearest != city { city = nearest }
        await refresh()
        await selectNearestArea(to: coord)
    }

    /// Picks the neighbourhood whose centroid is closest to a coordinate. Done
    /// on device from the area list, so it also works with no connection once
    /// the city has been opened once.
    func selectNearestArea(to coord: CLLocationCoordinate2D) async {
        if areas.isEmpty, let fetched = try? await APIClient.shared.areas(city: city.slug) {
            areas = fetched.value.areas
        }
        let here = CLLocation(latitude: coord.latitude, longitude: coord.longitude)
        let nearest = areas
            .compactMap { a -> (Area, CLLocationDistance)? in
                guard let c = a.centroid else { return nil }
                return (a, here.distance(from: CLLocation(latitude: c.lat, longitude: c.lng)))
            }
            // Beyond ~12km the "nearest neighbourhood" is not meaningfully
            // where the user is standing, so leave the scope citywide.
            .filter { $0.1 < 12_000 }
            .min { $0.1 < $1.1 }?.0
        if let nearest { area = nearest }
    }
}
