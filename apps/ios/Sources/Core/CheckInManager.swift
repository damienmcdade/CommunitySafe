import ActivityKit
import Combine
import Foundation
import OSLog
import UserNotifications

/// Drives the safety check-in: a countdown the user starts before walking
/// somewhere, which puts a live countdown on their Lock Screen and in the
/// Dynamic Island, and fires a local notification if it lapses.
///
/// This is the app's most distinctly native surface — a Live Activity and a
/// Dynamic Island presentation have no web equivalent at all.
@MainActor
final class CheckInManager: ObservableObject {
    static let shared = CheckInManager()

    struct ActiveCheckIn: Codable, Equatable {
        var destination: String
        var startedAt: Date
        var expectedBy: Date
        var areaSlug: String?
        var areaLabel: String?
        var gradeLetter: String?
        /// Server-side timer id. Present only when the user is signed in — it
        /// is what lets the backend notify trusted contacts if this lapses.
        var remoteID: String?
        /// How many confirmed contacts the server will notify.
        var notifiesContacts: Int = 0
    }

    @Published private(set) var active: ActiveCheckIn?
    @Published private(set) var lastError: String?

    private let log = Logger(subsystem: "app.communitysafe", category: "check-in")
    private let defaultsKey = "active_check_in_v1"
    private var activity: Activity<CheckInAttributes>?

    init() { restore() }

    var isRunning: Bool { active != nil }

    /// Whether the system will actually show a Live Activity. Surfaced in the
    /// UI so a user who has them switched off still understands what will and
    /// will not happen — the check-in itself still works via notifications.
    var liveActivitiesEnabled: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // MARK: - Lifecycle

    func start(
        destination: String,
        minutes: Int,
        areaSlug: String?,
        areaLabel: String?,
        contactIDs: [String] = []
    ) async {
        let now = Date()
        let expected = now.addingTimeInterval(TimeInterval(minutes * 60))
        var checkIn = ActiveCheckIn(
            destination: destination,
            startedAt: now,
            expectedBy: expected,
            areaSlug: areaSlug,
            areaLabel: areaLabel,
            gradeLetter: nil
        )

        // Attach the destination's grade if we can get it; never block the
        // check-in on a network call — the timer is the safety-critical part.
        if let areaSlug, let fresh = try? await APIClient.shared.areaScore(area: areaSlug) {
            checkIn.gradeLetter = fresh.value.letter.rawValue
            checkIn.areaLabel = fresh.value.area.label
        }

        // Arm the server-side timer so the chosen trusted contacts are
        // notified if this lapses. The device session is minted on demand, so
        // this needs no sign-in; if it fails the local timer still runs.
        var body: [String: Any] = ["durationMinutes": minutes]
        body["message"] = "Heading to \(destination)"
        if let coord = LocationManager.shared.coordinate {
            body["lat"] = coord.latitude
            body["lng"] = coord.longitude
        }
        // Empty means "every confirmed contact"; a non-empty list is the exact
        // subset the user picked for this trip.
        if !contactIDs.isEmpty { body["contactIds"] = contactIDs }
        do {
            let armed = try await APIClient.shared.authed(
                "POST", "safety/check-in", body: body, as: ArmedCheckIn.self
            )
            checkIn.remoteID = armed.id
            // The server reports every confirmed contact; when the user picked
            // a subset, that subset is what will actually be alerted.
            checkIn.notifiesContacts = contactIDs.isEmpty ? armed.confirmedContactCount : contactIDs.count
            // Trust the server's schedule so the countdown the user sees
            // matches the moment their contacts would actually be alerted.
            checkIn.expectedBy = armed.scheduledFor
            lastError = nil
        } catch {
            log.error("server check-in failed: \(error.localizedDescription, privacy: .public)")
            lastError = "Started on this device, but we couldn't reach the server to arm your contacts."
        }

        active = checkIn
        persist()
        await scheduleLapseNotification(for: checkIn)
        startLiveActivity(for: checkIn)
    }

    /// Extend an in-flight check-in without restarting it.
    func extend(byMinutes minutes: Int) async {
        guard var checkIn = active else { return }
        checkIn.expectedBy = checkIn.expectedBy.addingTimeInterval(TimeInterval(minutes * 60))
        active = checkIn
        persist()
        await scheduleLapseNotification(for: checkIn)
        await updateLiveActivity(with: checkIn, resolved: false)
    }

    /// The user confirming they arrived safely.
    func markSafe() async {
        guard let checkIn = active else { return }
        // Resolve the server timer FIRST: if this fails the contacts would be
        // alerted, so the user needs to know rather than see a silent success.
        if let remoteID = checkIn.remoteID {
            do {
                _ = try await APIClient.shared.authed(
                    "POST", "safety/check-in/\(remoteID)/safe", as: EmptyResponse.self
                )
                lastError = nil
            } catch {
                lastError = "Couldn't reach the server to stand down your contacts. Check your connection and tap again."
                log.error("mark-safe failed: \(error.localizedDescription, privacy: .public)")
                return
            }
        }
        cancelLapseNotification()
        await updateLiveActivity(with: checkIn, resolved: true)
        await endLiveActivity(after: 4)
        active = nil
        persist()
    }

    func cancel() async {
        if let remoteID = active?.remoteID {
            _ = try? await APIClient.shared.authed(
                "POST", "safety/check-in/\(remoteID)/safe", as: EmptyResponse.self
            )
        }
        cancelLapseNotification()
        await endLiveActivity(after: 0)
        active = nil
        persist()
    }

    // MARK: - Live Activity

    private func startLiveActivity(for checkIn: ActiveCheckIn) {
        guard liveActivitiesEnabled else { return }
        let attributes = CheckInAttributes(
            destinationName: checkIn.destination,
            startedAt: checkIn.startedAt
        )
        let state = CheckInAttributes.ContentState(
            expectedBy: checkIn.expectedBy,
            gradeLetter: checkIn.gradeLetter,
            areaLabel: checkIn.areaLabel,
            isResolved: false
        )
        do {
            activity = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: checkIn.expectedBy.addingTimeInterval(30 * 60)),
                pushType: nil
            )
        } catch {
            // A refused Live Activity must not take the check-in down with it.
            log.error("live activity request failed: \(error.localizedDescription, privacy: .public)")
            lastError = nil
        }
    }

    private func updateLiveActivity(with checkIn: ActiveCheckIn, resolved: Bool) async {
        guard let activity else { return }
        let state = CheckInAttributes.ContentState(
            expectedBy: checkIn.expectedBy,
            gradeLetter: checkIn.gradeLetter,
            areaLabel: checkIn.areaLabel,
            isResolved: resolved
        )
        await activity.update(.init(state: state, staleDate: nil))
    }

    private func endLiveActivity(after seconds: TimeInterval) async {
        guard let activity else { return }
        await activity.end(nil, dismissalPolicy: seconds > 0 ? .after(.now + seconds) : .immediate)
        self.activity = nil
    }

    // MARK: - Notifications

    private func scheduleLapseNotification(for checkIn: ActiveCheckIn) async {
        cancelLapseNotification()
        let interval = checkIn.expectedBy.timeIntervalSinceNow
        guard interval > 0 else { return }

        let content = UNMutableNotificationContent()
        content.title = "Check-in overdue"
        content.body = "You expected to reach \(checkIn.destination) by now. Tap to confirm you're safe."
        content.sound = .defaultCritical
        content.categoryIdentifier = NotificationCategory.checkIn
        // `.timeSensitive` needs the Time Sensitive Notifications capability on
        // the App ID; without it the system silently downgrades to `.active`
        // anyway, so ask for what we actually hold.
        content.interruptionLevel = .active

        let request = UNNotificationRequest(
            identifier: Self.lapseID,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
        )
        try? await UNUserNotificationCenter.current().add(request)
    }

    private func cancelLapseNotification() {
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: [Self.lapseID])
    }

    private static let lapseID = "check-in-lapse"

    // MARK: - Persistence

    private func persist() {
        if let active, let data = try? JSONEncoder().encode(active) {
            AppGroup.defaults.set(data, forKey: defaultsKey)
        } else {
            AppGroup.defaults.removeObject(forKey: defaultsKey)
        }
    }

    private func restore() {
        guard let data = AppGroup.defaults.data(forKey: defaultsKey),
              let decoded = try? JSONDecoder().decode(ActiveCheckIn.self, from: data) else { return }
        // A check-in that lapsed while the app was closed is not resumed; the
        // overdue notification already fired and resuming it would show a
        // countdown that has no time left on it.
        if decoded.expectedBy.timeIntervalSinceNow > -60 * 60 {
            active = decoded
            activity = Activity<CheckInAttributes>.activities.first
        } else {
            AppGroup.defaults.removeObject(forKey: defaultsKey)
        }
    }
}
