import SwiftUI

struct RootView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var checkIn: CheckInManager
    @State private var selectedTab = Tab.now
    #if DEBUG
    @State private var showingPaywallForTest = false
    #endif

    enum Tab: Hashable, CaseIterable {
        case now, map, trends, safety, places

        #if DEBUG
        /// Test hook: `-uiTestTab map` opens straight to a tab, so App Store
        /// screenshots can be captured deterministically. Debug builds only.
        static func named(_ name: String) -> Tab? {
            switch name.lowercased() {
            case "now": return .now
            case "map": return .map
            case "trends": return .trends
            case "safety", "checkin", "check-in": return .safety
            case "places": return .places
            default: return nil
            }
        }
        #endif
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            NowView()
                .tabItem { Label("Now", systemImage: "shield.lefthalf.filled") }
                .tag(Tab.now)

            MapScreen()
                .tabItem { Label("Map", systemImage: "map") }
                .tag(Tab.map)

            TrendsView()
                .tabItem { Label("Trends", systemImage: "chart.xyaxis.line") }
                .tag(Tab.trends)

            SafetyView()
                .tabItem { Label("Check-in", systemImage: "figure.walk.motion") }
                .tag(Tab.safety)
                .badge(checkIn.isRunning ? "1" : nil)

            PlacesView()
                .tabItem { Label("Places", systemImage: "mappin.and.ellipse") }
                .tag(Tab.places)
        }
        #if DEBUG
        .task {
            if let name = UserDefaults.standard.string(forKey: "uiTestTab"),
               let tab = Tab.named(name) {
                selectedTab = tab
            }
            showingPaywallForTest = UserDefaults.standard.bool(forKey: "uiTestPaywall")
        }
        .sheet(isPresented: $showingPaywallForTest) { PaywallView() }
        #endif
    }
}
