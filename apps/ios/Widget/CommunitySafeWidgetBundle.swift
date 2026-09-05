import SwiftUI
import WidgetKit

@main
struct CommunitySafeWidgetBundle: WidgetBundle {
    var body: some Widget {
        GradeWidget()
        CheckInLiveActivity()
        if #available(iOS 18.0, *) {
            CheckInControl()
        }
    }
}
