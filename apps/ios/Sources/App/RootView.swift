import SwiftUI

struct RootView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var checkIn: CheckInManager
    @State private var selectedTab = Tab.now

    enum Tab: Hashable { case now, map, trends, safety, places }

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
    }
}
