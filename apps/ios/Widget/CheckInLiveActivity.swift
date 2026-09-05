import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// Lock Screen and Dynamic Island presentation for an active safety check-in.
/// The countdown runs on the system clock (`.timer`), so it stays correct
/// without the app being awake to update it.
struct CheckInLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CheckInAttributes.self) { context in
            lockScreen(context)
                .activityBackgroundTint(Color.black.opacity(0.55))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text(context.attributes.destinationName).lineLimit(1)
                    } icon: {
                        Image(systemName: "figure.walk.motion")
                    }
                    .font(.caption)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let letter = context.state.gradeLetter {
                        Text("Grade \(letter)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.color(for: context.state.grade))
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    countdown(context)
                        .font(.title2.weight(.bold))
                        .monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 10) {
                        Button(intent: MarkSafeIntent()) {
                            Label("I'm safe", systemImage: "checkmark.shield.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .tint(.green)
                        Button(intent: ExtendCheckInIntent()) {
                            Label("+10", systemImage: "plus.circle")
                        }
                        .tint(.secondary)
                    }
                    .buttonStyle(.borderedProminent)
                    .font(.caption)
                }
            } compactLeading: {
                Image(systemName: context.state.isOverdue ? "exclamationmark.triangle.fill" : "figure.walk")
                    .foregroundStyle(context.state.isOverdue ? .red : .primary)
            } compactTrailing: {
                countdown(context)
                    .monospacedDigit()
                    .font(.caption2)
                    .frame(maxWidth: 52)
            } minimal: {
                Image(systemName: "shield.lefthalf.filled")
                    .foregroundStyle(context.state.isOverdue ? .red : .primary)
            }
            .widgetURL(URL(string: "communitysafe://checkin"))
        }
    }

    @ViewBuilder
    private func lockScreen(_ context: ActivityViewContext<CheckInAttributes>) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Check-in", systemImage: "figure.walk.motion")
                    .font(.caption.weight(.semibold))
                Spacer()
                if context.state.isResolved {
                    Label("Safe", systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.green)
                } else if let letter = context.state.gradeLetter {
                    Text("Grade \(letter)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.color(for: context.state.grade))
                }
            }

            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.destinationName)
                        .font(.headline)
                        .lineLimit(1)
                    if let area = context.state.areaLabel {
                        Text(area).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                countdown(context)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .monospacedDigit()
            }

            if !context.state.isResolved {
                HStack(spacing: 10) {
                    Button(intent: MarkSafeIntent()) {
                        Label("I'm safe", systemImage: "checkmark.shield.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .tint(.green)
                    Button(intent: ExtendCheckInIntent()) {
                        Text("+10 min")
                    }
                    .tint(.gray)
                }
                .buttonStyle(.borderedProminent)
                .font(.caption)
            }
        }
        .padding()
    }

    /// A system timer view rather than a value the app must keep pushing —
    /// Live Activity updates are rate-limited, so a pushed countdown would
    /// visibly stall.
    @ViewBuilder
    private func countdown(_ context: ActivityViewContext<CheckInAttributes>) -> some View {
        if context.state.isResolved {
            Text("Safe")
        } else {
            Text(timerInterval: Date()...max(context.state.expectedBy, Date().addingTimeInterval(1)),
                 countsDown: true)
                .foregroundStyle(context.state.isOverdue ? .red : .primary)
        }
    }
}
