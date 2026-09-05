import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Configuration

/// User-configurable widget: long-press → Edit Widget → pick a city. The
/// previous build hardcoded San Francisco for everyone.
struct GradeWidgetConfiguration: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Choose Area"
    static var description = IntentDescription("Pick which city's safety grade this widget shows.")

    @Parameter(title: "City")
    var city: CityEntity?

    /// When on, the widget follows whatever area is selected in the app instead
    /// of a fixed city.
    @Parameter(title: "Follow app selection", default: true)
    var followsApp: Bool
}

struct CityEntity: AppEntity, Identifiable, Hashable {
    let id: String
    let label: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "City" }
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(label)") }
    static var defaultQuery = CityEntityQuery()
}

struct CityEntityQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [CityEntity] {
        CityRegistry.all.filter { identifiers.contains($0.slug) }.map { CityEntity(id: $0.slug, label: $0.label) }
    }
    func entities(matching string: String) async throws -> [CityEntity] {
        CityRegistry.all.filter { $0.label.localizedCaseInsensitiveContains(string) }
            .map { CityEntity(id: $0.slug, label: $0.label) }
    }
    func suggestedEntities() async throws -> [CityEntity] {
        CityRegistry.all.map { CityEntity(id: $0.slug, label: $0.label) }
    }
}

// MARK: - Timeline

struct GradeEntry: TimelineEntry {
    let date: Date
    let areaLabel: String
    let cityLabel: String
    let grade: Grade
    let confidence: DataConfidence
    let headline: String?
    let isCached: Bool
    let capturedAt: Date?

    static let placeholder = GradeEntry(
        date: .now,
        areaLabel: "Your area",
        cityLabel: "",
        grade: .b,
        confidence: .high,
        headline: nil,
        isCached: false,
        capturedAt: nil
    )
}

struct GradeProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> GradeEntry { .placeholder }

    func snapshot(for configuration: GradeWidgetConfiguration, in context: Context) async -> GradeEntry {
        await entry(for: configuration)
    }

    func timeline(for configuration: GradeWidgetConfiguration, in context: Context) async -> Timeline<GradeEntry> {
        let entry = await entry(for: configuration)
        // Police feeds publish daily; refreshing every two hours keeps the
        // widget current without burning the system's refresh budget.
        let next = Date().addingTimeInterval(2 * 60 * 60)
        return Timeline(entries: [entry], policy: .after(next))
    }

    private func entry(for configuration: GradeWidgetConfiguration) async -> GradeEntry {
        let defaults = AppGroup.defaults
        let citySlug: String
        let areaSlug: String?

        if configuration.followsApp || configuration.city == nil {
            citySlug = defaults.string(forKey: AppGroup.Key.preferredCity) ?? "san-francisco"
            areaSlug = defaults.string(forKey: AppGroup.Key.preferredArea)
        } else {
            citySlug = configuration.city?.id ?? "san-francisco"
            areaSlug = nil
        }

        let cityLabel = CityRegistry.city(slug: citySlug)?.label ?? ""

        let fresh: Fresh<SafetyScore>?
        if let areaSlug {
            fresh = try? await APIClient.shared.areaScore(area: areaSlug)
        } else {
            fresh = try? await APIClient.shared.citywideScore(city: citySlug)
        }

        guard let fresh else {
            return GradeEntry(
                date: .now,
                areaLabel: cityLabel.isEmpty ? "Unavailable" : cityLabel,
                cityLabel: cityLabel,
                grade: .unknown,
                confidence: .low,
                headline: nil,
                isCached: false,
                capturedAt: nil
            )
        }

        return GradeEntry(
            date: .now,
            areaLabel: fresh.value.area.label,
            cityLabel: fresh.value.city.label,
            grade: fresh.value.letter,
            confidence: fresh.value.confidence,
            headline: fresh.value.headline,
            isCached: fresh.isFromCache,
            capturedAt: fresh.fetchedAt
        )
    }
}

// MARK: - Views

struct GradeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: GradeEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Text(entry.grade == .unknown ? "–" : entry.grade.rawValue)
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                    Text("SAFE").font(.system(size: 8, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
            }
            .widgetAccessibilityLabel("Safety grade \(entry.grade.rawValue) for \(entry.areaLabel)")

        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.areaLabel).font(.headline).lineLimit(1)
                Text("Grade \(entry.grade.rawValue) · \(entry.grade.summary)")
                    .font(.caption)
                    .lineLimit(2)
            }
            .widgetAccessibilityLabel("\(entry.areaLabel), grade \(entry.grade.rawValue)")

        case .accessoryInline:
            Text("\(entry.areaLabel): \(entry.grade.rawValue)")

        case .systemSmall:
            small

        default:
            medium
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                GradeBadge(grade: entry.grade, size: 46)
                Spacer()
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.areaLabel)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)
                Text(freshnessText)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var medium: some View {
        HStack(spacing: 14) {
            GradeBadge(grade: entry.grade, size: 66)
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.areaLabel)
                    .font(.headline)
                    .lineLimit(1)
                Text(entry.grade.summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                HStack(spacing: 6) {
                    if entry.confidence != .high {
                        Text(entry.confidence.label)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.orange)
                    }
                    Text(freshnessText)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                // Interactive refresh — runs in place without opening the app.
                Button(intent: RefreshGradeIntent()) {
                    Label("Refresh", systemImage: "arrow.clockwise")
                        .font(.caption2)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.tint)
            }
            Spacer(minLength: 0)
        }
    }

    private var freshnessText: String {
        if entry.isCached { return "Offline copy" }
        guard let capturedAt = entry.capturedAt else { return "" }
        return "Updated \(capturedAt.relativeDescription)"
    }
}

private extension View {
    /// Accessory families clip aggressively; keeping the label attached here
    /// avoids repeating the modifier at every call site.
    func widgetAccessibilityLabel(_ label: String) -> some View {
        accessibilityElement().accessibilityLabel(label)
    }
}

// MARK: - Widget

struct GradeWidget: Widget {
    static let kind = "CommunitySafeGradeWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: Self.kind,
            intent: GradeWidgetConfiguration.self,
            provider: GradeProvider()
        ) { entry in
            GradeWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
                .widgetURL(URL(string: "communitysafeapp://area"))
        }
        .configurationDisplayName("Safety Grade")
        .description("The current CommunitySafe grade for your area.")
        .supportedFamilies([
            .systemSmall, .systemMedium,
            .accessoryCircular, .accessoryRectangular, .accessoryInline
        ])
    }
}
