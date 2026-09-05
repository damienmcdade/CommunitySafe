import CoreSpotlight
import SwiftUI
import UserNotifications

@main
struct CommunitySafeApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    @StateObject private var state = AppState.shared
    @StateObject private var location = LocationManager.shared
    @StateObject private var places = PlacesStore.shared
    @StateObject private var checkIn = CheckInManager.shared
    @StateObject private var premium = PremiumManager()
    @StateObject private var session = SessionManager.shared
    @StateObject private var contacts = ContactsManager.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .environmentObject(location)
                .environmentObject(places)
                .environmentObject(checkIn)
                .environmentObject(premium)
                .environmentObject(session)
                .environmentObject(contacts)
                .task {
                    await state.refresh()
                    await state.adoptCurrentLocation()
                    await SpotlightIndexer.index(cities: CityRegistry.all)
                    await session.prepare()
                    await contacts.load()
                    #if DEBUG
                    if let citySlug = UserDefaults.standard.string(forKey: "uiTestCity"),
                       let city = CityRegistry.city(slug: citySlug) {
                        state.city = city
                        if let areaSlug = UserDefaults.standard.string(forKey: "uiTestArea"),
                           let fresh = try? await APIClient.shared.areas(city: citySlug),
                           let match = fresh.value.areas.first(where: { $0.slug == areaSlug }) {
                            state.area = match
                        }
                        await state.refresh()
                    }
                    // Test hook: `-uiTestStartCheckIn <destination>` starts a
                    // check-in on launch so the Live Activity can be exercised
                    // from an automated run. Debug builds only.
                    if let dest = UserDefaults.standard.string(forKey: "uiTestStartCheckIn") {
                        await checkIn.start(destination: dest, minutes: 20,
                                            areaSlug: state.area?.slug, areaLabel: state.area?.label)
                    }
                    #endif
                }
                // Deep links from widgets, notifications and Spotlight.
                .onOpenURL { DeepLink.handle($0, state: state) }
                .onContinueUserActivity(CSSearchableItemActionType) { activity in
                    DeepLink.handleSpotlight(activity, state: state)
                }
        }
    }
}

/// UIKit lifecycle for the pieces SwiftUI doesn't cover: remote-notification
/// registration and notification action handling.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = NotificationCoordinator.shared
        NotificationCoordinator.shared.registerCategories()

        // iOS relaunches the app in the background when a monitored region is
        // crossed, and the delegate callback is only delivered if a
        // CLLocationManager exists to receive it. Touch the shared manager (and
        // the store holding the regions) here so a background relaunch wires
        // itself up without waiting for any UI to be constructed.
        _ = LocationManager.shared
        _ = PlacesStore.shared

        // Re-register for push only if the user previously granted it. The ask
        // itself happens in context, never at launch.
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized else { return }
            DispatchQueue.main.async { application.registerForRemoteNotifications() }
        }
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        AppGroup.defaults.set(token, forKey: "push_token")
    }
}

/// Notification presentation + actions. Actionable notifications let the user
/// confirm they're safe straight from the banner.
final class NotificationCoordinator: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationCoordinator()

    func registerCategories() {
        let safe = UNNotificationAction(
            identifier: "MARK_SAFE",
            title: "I'm safe",
            options: [.authenticationRequired]
        )
        let extend = UNNotificationAction(identifier: "EXTEND_15", title: "Add 15 min", options: [])
        let checkIn = UNNotificationCategory(
            identifier: NotificationCategory.checkIn,
            actions: [safe, extend],
            intentIdentifiers: [],
            options: []
        )
        let place = UNNotificationCategory(
            identifier: NotificationCategory.placeAlert,
            actions: [],
            intentIdentifiers: [],
            options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([checkIn, place])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        switch response.actionIdentifier {
        case "MARK_SAFE":
            await CheckInManager.shared.markSafe()
        case "EXTEND_15":
            await CheckInManager.shared.extend(byMinutes: 15)
        default:
            break
        }
    }
}

/// Routes `communitysafeapp://` URLs from widgets and notifications.
///
/// Not `communitysafe://`: the separately shipped "CommunitySafe: Area
/// Grades" app already registers that scheme, and iOS picks arbitrarily
/// between two apps claiming the same one.
enum DeepLink {
    @MainActor
    static func handle(_ url: URL, state: AppState) {
        guard url.scheme == "communitysafeapp" else { return }
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let items = components?.queryItems ?? []

        // The host is the destination: the widget links to
        // `communitysafeapp://area` and the Live Activity to
        // `communitysafeapp://checkin`. Without this, tapping either opened
        // the app on whatever tab it happened to be on.
        let route = url.host ?? components?.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? ""
        if let tab = AppTab(routeName: route) {
            state.selectedTab = tab
        }

        if let citySlug = items.first(where: { $0.name == "city" })?.value,
           let city = CityRegistry.city(slug: citySlug) {
            state.city = city
        }
        if let areaSlug = items.first(where: { $0.name == "area" })?.value {
            Task {
                if let fresh = try? await APIClient.shared.areas(city: state.city.slug),
                   let match = fresh.value.areas.first(where: { $0.slug == areaSlug }) {
                    state.area = match
                }
            }
        }
    }

    @MainActor
    static func handleSpotlight(_ activity: NSUserActivity, state: AppState) {
        guard let id = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String,
              let city = CityRegistry.city(slug: id) else { return }
        state.city = city
    }
}

/// Publishes covered cities to the system index, so a user searching "Oakland
/// safety" from the Home Screen finds this app's entry for it.
enum SpotlightIndexer {
    static func index(cities: [City]) async {
        let items = cities.map { city -> CSSearchableItem in
            let attributes = CSSearchableItemAttributeSet(contentType: .content)
            attributes.title = "\(city.label) safety grade"
            attributes.contentDescription = "Neighborhood safety grades and recent police reports for \(city.label)."
            attributes.keywords = [city.label, "safety", "crime", "neighborhood", "grade"]
            return CSSearchableItem(
                uniqueIdentifier: city.slug,
                domainIdentifier: "app.communitysafe.cities",
                attributeSet: attributes
            )
        }
        try? await CSSearchableIndex.default().indexSearchableItems(items)
    }
}
