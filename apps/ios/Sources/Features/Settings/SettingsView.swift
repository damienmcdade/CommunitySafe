import CoreLocation
import StoreKit
import SwiftUI
import UserNotifications

struct SettingsView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var premium: PremiumManager
    @EnvironmentObject private var location: LocationManager
    @EnvironmentObject private var session: SessionManager
    @EnvironmentObject private var contacts: ContactsManager
    @Environment(\.dismiss) private var dismiss

    @State private var showingPaywall = false
    @State private var showingDeleteConfirm = false
    @State private var notificationStatus: UNAuthorizationStatus = .notDetermined
    @State private var isClearingCache = false
    @State private var photoBytes: Int64 = 0

    private static let termsURL = URL(string: "https://www.communitysafe.app/terms")!
    private static let privacyURL = URL(string: "https://www.communitysafe.app/privacy")!
    private static let methodologyURL = URL(string: "https://www.communitysafe.app/methodology")!
    private static let supportURL = URL(string: "https://www.communitysafe.app/about")!

    var body: some View {
        NavigationStack {
            List {
                accountSection
                subscriptionSection
                permissionsSection
                dataSection
                aboutSection
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $showingPaywall) {
                PaywallView().environmentObject(premium)
            }

            .task {
                notificationStatus = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
                photoBytes = await PhotoCache.shared.diskUsage()
            }
        }
    }

    // MARK: - Sections

    private var accountSection: some View {
        Section {
            NavigationLink {
                ContactsView()
            } label: {
                HStack {
                    Label("Trusted contacts", systemImage: "person.2")
                    Spacer()
                    Text("\(contacts.confirmedCount) confirmed")
                        .font(.subheadline)
                        .foregroundStyle(contacts.confirmedCount > 0 ? Color.secondary : Color.orange)
                }
            }
            Button("Delete my data", role: .destructive) { showingDeleteConfirm = true }
                .disabled(!session.isReady)
        } header: {
            Text("Safety contacts")
        } footer: {
            Text("These are the people notified if a safety check-in lapses without you confirming you're safe. CommunitySafe has no accounts — this device has its own private session, and deleting your data removes its contacts and check-in history from our servers.")
        }
        .confirmationDialog(
            "Delete this device's data?",
            isPresented: $showingDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) { Task { _ = await session.deleteDeviceData() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This permanently removes your trusted contacts and check-in history. It can't be undone.")
        }
    }

    private var subscriptionSection: some View {
        Section {
            HStack {
                Label("CommunitySafe Premium", systemImage: "star.circle.fill")
                Spacer()
                Text(premium.isPremium ? "Active" : "Not subscribed")
                    .foregroundStyle(premium.isPremium ? .green : .secondary)
                    .font(.subheadline)
            }
            if !premium.isPremium {
                Button("See what Premium adds") { showingPaywall = true }
            }
            // Apple requires an always-reachable restore path.
            Button("Restore Purchases") {
                Task { await premium.restorePurchases() }
            }
            if premium.isPremium {
                Button("Manage Subscription") {
                    Task {
                        guard let scene = UIApplication.shared.connectedScenes
                            .compactMap({ $0 as? UIWindowScene }).first else { return }
                        try? await AppStore.showManageSubscriptions(in: scene)
                    }
                }
            }
        } header: {
            Text("Subscription")
        } footer: {
            Text("Grades, the map, trends and safety check-ins are free. Premium adds unlimited saved places with arrival alerts, and every city.")
        }
    }

    private var permissionsSection: some View {
        Section {
            LabeledContent("Location") {
                Text(locationStatusText).foregroundStyle(.secondary)
            }
            LabeledContent("Notifications") {
                Text(notificationStatusText).foregroundStyle(.secondary)
            }
            Button("Open iOS Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
        } header: {
            Text("Permissions")
        } footer: {
            Text("Location is used to show the grade where you are and to trigger arrival alerts for your saved places. It is never sent to advertisers or sold.")
        }
    }

    private var dataSection: some View {
        Section {
            LabeledContent("Cities covered") { Text("\(CityRegistry.all.count)").foregroundStyle(.secondary) }
            LabeledContent("Selected area") { Text(state.displayLabel).foregroundStyle(.secondary) }
            if let updated = state.lastUpdated {
                LabeledContent("Last updated") { Text(updated.relativeDescription).foregroundStyle(.secondary) }
            }
            LabeledContent("City photos stored") {
                Text(photoBytes > 0 ? ByteCountFormatter.string(fromByteCount: photoBytes, countStyle: .file) : "None")
                    .foregroundStyle(.secondary)
            }
            Button(isClearingCache ? "Clearing…" : "Clear offline cache") {
                Task {
                    isClearingCache = true
                    await OfflineStore.shared.clear()
                    await PhotoCache.shared.clear()
                    photoBytes = 0
                    await state.refresh()
                    isClearingCache = false
                }
            }
            .disabled(isClearingCache)
        } header: {
            Text("Data")
        } footer: {
            Text("CommunitySafe keeps the last grade it downloaded so the app still works with no signal, plus the city backdrop photos it has shown. Clearing removes both.")
        }
    }

    private var aboutSection: some View {
        Section {
            Link("How grades are calculated", destination: Self.methodologyURL)
            NavigationLink("Photo credits") { PhotoCreditsView() }
            Link("Privacy Policy", destination: Self.privacyURL)
            Link("Terms of Use", destination: Self.termsURL)
            Link("Support", destination: Self.supportURL)
            LabeledContent("Version") {
                Text(Self.versionString).foregroundStyle(.secondary)
            }
        } header: {
            Text("About")
        } footer: {
            Text("CommunitySafe summarises police-published open data. It is not an emergency service. In an emergency, call 911.")
        }
    }

    // MARK: - Helpers

    private var locationStatusText: String {
        switch location.authorization {
        case .authorizedAlways: return "Always"
        case .authorizedWhenInUse: return "While using"
        case .denied: return "Denied"
        case .restricted: return "Restricted"
        default: return "Not set"
        }
    }

    private var notificationStatusText: String {
        switch notificationStatus {
        case .authorized: return "On"
        case .provisional: return "Quiet"
        case .denied: return "Off"
        default: return "Not set"
        }
    }

    private static var versionString: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(v) (\(b))"
    }
}
