import ActivityKit
import Foundation

/// Live Activity for an in-progress safety check-in ("I'm walking home, expect
/// me by 10:20").
///
/// Shared verbatim between the app (which starts and updates the activity) and
/// the widget extension (which renders it on the Lock Screen and in the
/// Dynamic Island).
struct CheckInAttributes: ActivityAttributes {
    /// Fixed for the life of the activity.
    let destinationName: String
    let startedAt: Date

    struct ContentState: Codable, Hashable {
        /// When the user said they expect to arrive.
        var expectedBy: Date
        /// Area grade at the destination, if known.
        var gradeLetter: String?
        var areaLabel: String?
        /// Set once the user confirms they are safe, so the activity can show a
        /// resolved state briefly before it ends.
        var isResolved: Bool = false

        var grade: Grade { Grade(apiValue: gradeLetter) }

        var isOverdue: Bool { !isResolved && Date() > expectedBy }
    }
}
