import AppIntents
import SwiftUI
import WidgetKit

// App Intents give the app verbs the system can run on its own: Siri, the
// Shortcuts app, Spotlight, Focus filters, Control Center and interactive
// widgets all drive these same definitions.

// MARK: - Entities

/// A neighbourhood, exposed to Shortcuts and the widget configuration UI so a
/// user can build "grade for the Mission" into their own automations.
struct AreaEntity: AppEntity, Identifiable, Hashable {
    let id: String
    let label: String
    let citySlug: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Neighborhood" }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(label)")
    }

    static var defaultQuery = AreaQuery()
}

struct AreaQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [AreaEntity] {
        let all = try await allAreas()
        return all.filter { identifiers.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [AreaEntity] {
        let all = try await allAreas()
        return all.filter { $0.label.localizedCaseInsensitiveContains(string) }
    }

    func suggestedEntities() async throws -> [AreaEntity] {
        Array(try await allAreas().prefix(30))
    }

    /// Areas for the user's currently selected city — the set they actually
    /// care about, rather than several thousand nationwide.
    private func allAreas() async throws -> [AreaEntity] {
        let citySlug = AppGroup.defaults.string(forKey: AppGroup.Key.preferredCity) ?? "san-francisco"
        guard let fresh = try? await APIClient.shared.areas(city: citySlug) else { return [] }
        return fresh.value.areas.map { AreaEntity(id: $0.slug, label: $0.label, citySlug: citySlug) }
    }
}

// MARK: - Check a grade

struct CheckAreaGradeIntent: AppIntent {
    static var title: LocalizedStringResource = "Check Safety Grade"
    static var description = IntentDescription(
        "Get the current CommunitySafe grade for a neighborhood.",
        categoryName: "Safety"
    )
    /// Runs entirely in the background — Siri answers without opening the app.
    static var openAppWhenRun = false

    @Parameter(title: "Neighborhood")
    var area: AreaEntity?

    static var parameterSummary: some ParameterSummary {
        Summary("Check the safety grade for \(\.$area)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        let slug = area?.id ?? AppGroup.defaults.string(forKey: AppGroup.Key.preferredArea)
        let citySlug = AppGroup.defaults.string(forKey: AppGroup.Key.preferredCity) ?? "san-francisco"

        let fresh: Fresh<SafetyScore>
        if let slug {
            fresh = try await APIClient.shared.areaScore(area: slug)
        } else {
            fresh = try await APIClient.shared.citywideScore(city: citySlug)
        }

        let score = fresh.value
        let staleNote = fresh.isFromCache ? " This is a saved copy from \(fresh.fetchedAt.relativeDescription)." : ""
        return .result(
            dialog: IntentDialog("\(score.area.label) is graded \(score.letter.rawValue). \(score.letter.summary).\(staleNote)"),
            view: GradeSnippet(score: score, isCached: fresh.isFromCache)
        )
    }
}

/// Compact result card Siri and Shortcuts render inline.
struct GradeSnippet: View {
    let score: SafetyScore
    let isCached: Bool

    var body: some View {
        HStack(spacing: 14) {
            GradeBadge(grade: score.letter, size: 56)
            VStack(alignment: .leading, spacing: 3) {
                Text(score.area.label).font(.headline)
                Text(score.letter.summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if isCached {
                    Text("Saved copy · \(score.asOf?.relativeDescription ?? "offline")")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer()
        }
        .padding()
    }
}

// MARK: - Check-in

struct StartCheckInIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Safety Check-In"
    static var description = IntentDescription(
        "Start a countdown to a destination. CommunitySafe alerts you if you don't confirm you arrived.",
        categoryName: "Safety"
    )
    /// Starting, extending and ending a Live Activity is only valid from
    /// the app's own process, so these bring the app forward to run.
    static var openAppWhenRun = true

    @Parameter(title: "Destination", default: "my destination")
    var destination: String

    @Parameter(title: "Minutes", default: 20, inclusiveRange: (5, 120))
    var minutes: Int

    static var parameterSummary: some ParameterSummary {
        Summary("Check in at \(\.$destination) in \(\.$minutes) minutes")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let state = AppState.shared
        await CheckInManager.shared.start(
            destination: destination,
            minutes: minutes,
            areaSlug: state.area?.slug,
            areaLabel: state.area?.label
        )
        return .result(dialog: IntentDialog("Check-in started. I'll alert you in \(minutes) minutes if you haven't confirmed."))
    }
}

struct MarkSafeIntent: AppIntent {
    static var title: LocalizedStringResource = "I'm Safe"
    static var description = IntentDescription(
        "Confirm you arrived safely and end the active check-in.",
        categoryName: "Safety"
    )
    /// Starting, extending and ending a Live Activity is only valid from
    /// the app's own process, so these bring the app forward to run.
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard CheckInManager.shared.isRunning else {
            return .result(dialog: IntentDialog("You don't have a check-in running."))
        }
        await CheckInManager.shared.markSafe()
        return .result(dialog: IntentDialog("Got it — marked safe."))
    }
}

/// Adds 10 minutes; wired to the Live Activity's button so the user can extend
/// without unlocking their phone.
struct ExtendCheckInIntent: AppIntent {
    static var title: LocalizedStringResource = "Extend Check-In"
    static var description = IntentDescription("Add 10 minutes to the active check-in.", categoryName: "Safety")
    /// Starting, extending and ending a Live Activity is only valid from
    /// the app's own process, so these bring the app forward to run.
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        await CheckInManager.shared.extend(byMinutes: 10)
        return .result()
    }
}

/// Forces the widget to pull fresh data. Exposed as an interactive widget
/// button so a tap refreshes in place instead of launching the app.
struct RefreshGradeIntent: AppIntent {
    static var title: LocalizedStringResource = "Refresh Safety Grade"
    static var description = IntentDescription("Pull the latest grade for the widget.", categoryName: "Safety")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult {
        let citySlug = AppGroup.defaults.string(forKey: AppGroup.Key.preferredCity) ?? "san-francisco"
        if let areaSlug = AppGroup.defaults.string(forKey: AppGroup.Key.preferredArea) {
            _ = try? await APIClient.shared.areaScore(area: areaSlug)
        } else {
            _ = try? await APIClient.shared.citywideScore(city: citySlug)
        }
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// MARK: - Siri phrases

/// Registers spoken phrases and puts the actions in Spotlight and the
/// Shortcuts gallery without the user configuring anything.
struct CommunitySafeShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CheckAreaGradeIntent(),
            phrases: [
                "What's my \(.applicationName) grade",
                "Check my area with \(.applicationName)",
                "How safe is my neighborhood in \(.applicationName)"
            ],
            shortTitle: "Check Grade",
            systemImageName: "shield.lefthalf.filled"
        )
        AppShortcut(
            intent: StartCheckInIntent(),
            phrases: [
                "Start a \(.applicationName) check-in",
                "Walk me home with \(.applicationName)"
            ],
            shortTitle: "Start Check-In",
            systemImageName: "figure.walk.motion"
        )
        AppShortcut(
            intent: MarkSafeIntent(),
            phrases: [
                "I'm safe in \(.applicationName)",
                "End my \(.applicationName) check-in"
            ],
            shortTitle: "I'm Safe",
            systemImageName: "checkmark.shield.fill"
        )
    }
}
