import AppIntents
import SwiftUI
import WidgetKit

/// Control Center / Action Button / Lock Screen control: one press starts a
/// safety check-in without unlocking to the app.
@available(iOS 18.0, *)
struct CheckInControl: ControlWidget {
    static let kind = "app.communitysafe.control.checkin"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: StartCheckInIntent()) {
                Label("Safety Check-In", systemImage: "figure.walk.motion")
            }
        }
        .displayName("Safety Check-In")
        .description("Start a CommunitySafe check-in.")
    }
}
