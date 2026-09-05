import Foundation

// Wire models for the CommunitySafe API (apps/api). Field names mirror the
// JSON exactly so there is no mapping layer to drift; anything the server may
// omit is optional, because a decode failure in a safety app means a blank
// screen at the moment someone needs it most.

// MARK: - Grade

/// Letter grade the API assigns an area. `A` is at or below the FBI national
/// rate; `E` is well above it. `unknown` covers a not-yet-scored area.
enum Grade: String, Codable, CaseIterable, Sendable {
    case a = "A", b = "B", c = "C", d = "D", e = "E"
    case unknown = "N/A"

    init(apiValue: String?) {
        self = Grade(rawValue: (apiValue ?? "").uppercased()) ?? .unknown
    }

    /// Plain-language reading, used in VoiceOver labels and widgets where the
    /// bare letter carries no meaning on its own.
    var summary: String {
        switch self {
        case .a: return "At or below the national rate"
        case .b: return "Somewhat above the national rate"
        case .c: return "Close to the national rate"
        case .d: return "Well above the national rate"
        case .e: return "Far above the national rate"
        case .unknown: return "Not enough data to grade"
        }
    }

    /// 0...1 severity, used for colour ramps and chart scaling.
    var severity: Double {
        switch self {
        case .a: return 0.0
        case .b: return 0.25
        case .c: return 0.5
        case .d: return 0.75
        case .e: return 1.0
        case .unknown: return 0.5
        }
    }
}

// MARK: - Confidence

/// How much the API trusts the underlying window. Surfaced to the user rather
/// than hidden — a stale feed is a safety-relevant fact, not an implementation
/// detail.
enum DataConfidence: String, Codable, Sendable {
    case high, medium, low

    init(apiValue: String?) {
        self = DataConfidence(rawValue: (apiValue ?? "").lowercased()) ?? .low
    }

    var label: String {
        switch self {
        case .high: return "High confidence"
        case .medium: return "Provisional"
        case .low: return "Low confidence"
        }
    }

    var explanation: String {
        switch self {
        case .high: return "Recent data, wide enough window to score."
        case .medium: return "The window is short or the feed is a little behind."
        case .low: return "This city's feed is running well behind, so treat the grade as indicative only."
        }
    }
}

// MARK: - Named references

struct NamedRef: Codable, Hashable, Sendable {
    let slug: String
    let label: String
}

struct SourceRef: Codable, Hashable, Sendable {
    let label: String
    let url: String?
    let publishedYear: Int?
}

// MARK: - Safety score

/// `GET /safezone/safety-score?city=<slug>` or `?area=<slug>`.
struct SafetyScore: Codable, Hashable, Sendable {
    let city: NamedRef
    let area: NamedRef
    let populationEstimate: Int?
    let windowDays: Int?
    let asOf: Date?
    let headline: String?
    let rows: [CategoryRow]
    let source: SourceRef?
    let disclaimer: String?
    let dataSourceType: String?

    private let grade: String?
    private let dataConfidence: String?

    var letter: Grade { Grade(apiValue: grade) }
    var confidence: DataConfidence { DataConfidence(apiValue: dataConfidence) }

    /// Per-category rate comparison. `deltaPct` is versus the national rate,
    /// `cityDeltaPct` versus this area's own city.
    struct CategoryRow: Codable, Hashable, Sendable, Identifiable {
        let category: String
        let count: Int
        let localPer100k: Double?
        let cityPer100k: Double?
        let cityDeltaPct: Double?
        let nationalPer100k: Double?
        let deltaPct: Double?
        let cityFbiPer100k: Double?

        var id: String { category }

        /// "PERSONS" reads as jargon on a card; these are the words the web app
        /// and the FBI source both use in prose.
        var displayName: String {
            switch category.uppercased() {
            case "PERSONS": return "Violent"
            case "PROPERTY": return "Property"
            case "SOCIETY": return "Public order"
            default: return category.capitalized
            }
        }
    }
}

// MARK: - Trend

/// `GET /safezone/trend?city=<slug>` or `?area=<slug>`.
struct TrendReport: Codable, Hashable, Sendable {
    let city: NamedRef
    let area: NamedRef
    let windowStart: Date?
    let totalIncidents: Int?
    let bullets: [Bullet]
    let freshness: Freshness?
    let timeOfDay: TimeOfDay?
    let source: SourceRef?
    let disclaimer: String?

    struct Bullet: Codable, Hashable, Sendable, Identifiable {
        let kind: String
        let at: Date?
        let text: String
        let category: String?

        /// The API returns no stable id; text within a report is unique.
        var id: String { "\(kind)-\(text)" }

        var isDispatch: Bool { kind == "dispatch" }
    }

    struct Freshness: Codable, Hashable, Sendable {
        let asOf: Date?
        let daysSince: Int?
        let status: String?
        let note: String?
    }

    struct TimeOfDay: Codable, Hashable, Sendable {
        let buckets: [String: Int]
        let dominant: String?

        /// Fixed chronological order — a dictionary has none, and a chart whose
        /// bars reshuffle between refreshes is unreadable.
        static let order = ["late_night", "morning", "afternoon", "evening"]

        static func label(for key: String) -> String {
            switch key {
            case "late_night": return "Late night"
            case "morning": return "Morning"
            case "afternoon": return "Afternoon"
            case "evening": return "Evening"
            default: return key.capitalized
            }
        }

        var ordered: [(key: String, label: String, count: Int)] {
            Self.order.compactMap { k in
                buckets[k].map { (k, Self.label(for: k), $0) }
            }
        }
    }
}

// MARK: - Incident reports

/// `GET /crime-data/recent?neighborhood=<slug>&limit=<n>`.
struct RecentReportsResponse: Codable, Sendable {
    let area: String?
    let reports: [IncidentReport]
}

struct IncidentReport: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let area: String?
    let occurredAt: Date?
    let nibrsCategory: String?
    let ibrOffenseDescription: String?
    let beat: String?
    let lat: Double?
    let lng: Double?

    /// The feed emits one row per offence, so a single incident id legitimately
    /// repeats with different categories. Identity has to include the category
    /// and offence or SwiftUI collapses them into one row.
    var rowID: String { "\(id)|\(nibrsCategory ?? "")|\(ibrOffenseDescription ?? "")" }

    var category: String { (nibrsCategory ?? "").uppercased() }

    var displayCategory: String {
        switch category {
        case "PERSONS": return "Violent"
        case "PROPERTY": return "Property"
        case "SOCIETY": return "Public order"
        default: return "Other"
        }
    }

    var title: String {
        ibrOffenseDescription?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            ?? displayCategory
    }
}

// MARK: - Areas

/// `GET /geo/areas?city=<slug>`.
struct AreasResponse: Codable, Sendable {
    let areas: [Area]
    let stale: Bool?
    let staleMessage: String?
}

struct Area: Codable, Hashable, Sendable, Identifiable {
    let slug: String
    let label: String
    let jurisdiction: String?
    let centroid: Centroid?

    var id: String { slug }

    struct Centroid: Codable, Hashable, Sendable {
        let lat: Double
        let lng: Double
    }
}

// MARK: - Helpers

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
