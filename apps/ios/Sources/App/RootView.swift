import SwiftUI

struct RootView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var checkIn: CheckInManager
    #if DEBUG
    @State private var showingPaywallForTest = false
    #endif

    var body: some View {
        TabView(selection: $state.selectedTab) {
            NowView()
                .tabItem { Label("Now", systemImage: "shield.lefthalf.filled") }
                .tag(AppTab.now)

            MapScreen()
                .tabItem { Label("Map", systemImage: "map") }
                .tag(AppTab.map)

            TrendsView()
                .tabItem { Label("Trends", systemImage: "chart.xyaxis.line") }
                .tag(AppTab.trends)

            SafetyView()
                .tabItem { Label("Check-in", systemImage: "figure.walk.motion") }
                .tag(AppTab.safety)
                .badge(checkIn.isRunning ? "1" : nil)

            PlacesView()
                .tabItem { Label("Places", systemImage: "mappin.and.ellipse") }
                .tag(AppTab.places)
        }
        #if DEBUG
        .task {
            // `-uiTestDemo YES` walks the tabs on a timer so an App Store
            // preview can be recorded as one continuous take. Debug only.
            if UserDefaults.standard.bool(forKey: "uiTestDemo") {
                let script: [(AppTab, UInt64)] = [
                    (.now, 6), (.map, 6), (.trends, 6), (.safety, 5), (.places, 5),
                ]
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 4_000_000_000)
                    for (tab, seconds) in script {
                        withAnimation(.easeInOut(duration: 0.35)) { state.selectedTab = tab }
                        try? await Task.sleep(nanoseconds: seconds * 1_000_000_000)
                    }
                }
            }
            if let name = UserDefaults.standard.string(forKey: "uiTestTab"),
               let tab = AppTab(routeName: name) {
                state.selectedTab = tab
            }
            showingPaywallForTest = UserDefaults.standard.bool(forKey: "uiTestPaywall")
        }
        .sheet(isPresented: $showingPaywallForTest) { PaywallView() }
        #endif
    }
}
