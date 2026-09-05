import CoreLocation
import MapKit
import SwiftUI

/// Saved Places: pin the addresses that matter and get a notification when you
/// arrive or leave, carrying that area's current grade.
///
/// The geofences are registered with CoreLocation and fire with the app
/// suspended — background behaviour a web page has no access to.
struct PlacesView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var places: PlacesStore
    @EnvironmentObject private var location: LocationManager
    @EnvironmentObject private var premium: PremiumManager

    @State private var showingAdd = false
    @State private var showingPaywall = false

    /// True when the user has used up the places their tier allows.
    private var atLimit: Bool {
        places.places.count >= PremiumGate.placeLimit(isPremium: premium.isPremium)
    }

    var body: some View {
        NavigationStack {
            List {
                if places.places.isEmpty {
                    ContentUnavailableView {
                        Label("No saved places", systemImage: "mappin.and.ellipse")
                    } description: {
                        Text("Add home, work or a family member's address to get arrival and departure alerts with that area's grade.")
                    } actions: {
                        Button("Add a place") { showingAdd = true }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    Section {
                        ForEach(places.places) { place in
                            NavigationLink {
                                PlaceDetailView(place: place)
                            } label: {
                                PlaceRow(place: place)
                            }
                        }
                        .onDelete { places.remove(at: $0) }
                    } footer: {
                        Text("Alerts are delivered by iOS when you cross the boundary, even if CommunitySafe isn't open. Addresses stay on your device.")
                    }
                }

                if !premium.isPremium && atLimit {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("More saved places with Premium", systemImage: "star.circle.fill")
                                .font(.subheadline.weight(.medium))
                            Text("Free includes \(PremiumGate.freePlaceLimit) saved place. Premium adds up to \(PlacesStore.maxPlaces), each with arrival and departure alerts.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Button("See Premium") { showingPaywall = true }
                                .buttonStyle(.bordered)
                        }
                        .padding(.vertical, 4)
                    }
                }

                if location.authorization != .authorizedAlways && !places.places.isEmpty {
                    Section {
                        alwaysPermissionRow
                    }
                }
            }
            .navigationTitle("Places")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        // At the free limit the button sells Premium rather
                        // than going dead with no explanation.
                        if atLimit && !premium.isPremium {
                            showingPaywall = true
                        } else {
                            showingAdd = true
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                    .disabled(premium.isPremium && places.isAtCapacity)
                    .accessibilityLabel("Add a place")
                }
            }
            .sheet(isPresented: $showingAdd) { AddPlaceView() }
            .sheet(isPresented: $showingPaywall) { PaywallView().environmentObject(premium) }
        }
    }

    private var alwaysPermissionRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Arrival alerts need \u{201C}Always\u{201D} location", systemImage: "location.slash")
                .font(.subheadline.weight(.medium))
            Text("iOS only delivers geofence alerts when location access is set to Always. Everything else in the app works without it.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Button("Allow Always") {
                if location.authorization == .authorizedWhenInUse {
                    location.requestAlways()
                } else if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.bordered)
        }
        .padding(.vertical, 4)
    }
}

struct PlaceRow: View {
    let place: SavedPlace

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "mappin.circle.fill")
                .font(.title2)
                .foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: 2) {
                Text(place.name).font(.body)
                Text(place.areaLabel ?? "Tap to see this area's grade")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if place.notifyOnArrival || place.notifyOnDeparture {
                Image(systemName: "bell.fill")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Alerts on")
            }
        }
    }
}

/// Detail view showing the live grade for a saved place plus its alert
/// settings.
struct PlaceDetailView: View {
    @EnvironmentObject private var places: PlacesStore
    @EnvironmentObject private var premium: PremiumManager
    @State var place: SavedPlace
    @State private var score: SafetyScore?
    @State private var isLoading = true

    var body: some View {
        List {
            Section {
                if let score {
                    HStack(spacing: 16) {
                        GradeBadge(grade: score.letter, size: 64)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(score.area.label).font(.headline)
                            Text(score.letter.summary)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 6)
                } else if isLoading {
                    HStack { ProgressView(); Text("Loading grade…").foregroundStyle(.secondary) }
                } else {
                    Text("No grade available for this location yet.")
                        .foregroundStyle(.secondary)
                }
            }

            Section("Alerts") {
                Toggle("Notify me when I arrive", isOn: $place.notifyOnArrival)
                    .disabled(!PremiumGate.canUseArrivalAlerts(isPremium: premium.isPremium))
                Toggle("Notify me when I leave", isOn: $place.notifyOnDeparture)
                    .disabled(!PremiumGate.canUseArrivalAlerts(isPremium: premium.isPremium))
                if !premium.isPremium {
                    Text("Arrival and departure alerts are part of Premium.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                VStack(alignment: .leading) {
                    HStack {
                        Text("Trigger radius")
                        Spacer()
                        Text("\(Int(place.radius)) m").foregroundStyle(.secondary).monospacedDigit()
                    }
                    Slider(value: $place.radius, in: 100...2000, step: 50)
                }
            }

            Section {
                Map(initialPosition: .region(MKCoordinateRegion(
                    center: place.coordinate,
                    latitudinalMeters: 800,
                    longitudinalMeters: 800
                ))) {
                    Marker(place.name, coordinate: place.coordinate)
                    MapCircle(center: place.coordinate, radius: place.radius)
                        .foregroundStyle(.tint.opacity(0.18))
                        .stroke(.tint, lineWidth: 2)
                }
                .frame(height: 220)
                .listRowInsets(EdgeInsets())
            }
        }
        .navigationTitle(place.name)
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: place) { _, updated in places.update(updated) }
        .task { await loadScore() }
    }

    private func loadScore() async {
        defer { isLoading = false }
        guard let area = place.areaSlug else { return }
        score = try? await APIClient.shared.areaScore(area: area).value
    }
}

/// Adds a place from the map, current location, or a searched address.
struct AddPlaceView: View {
    @EnvironmentObject private var places: PlacesStore
    @EnvironmentObject private var location: LocationManager
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var query = ""
    @State private var results: [MKMapItem] = []
    @State private var picked: CLLocationCoordinate2D?
    @State private var isSearching = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Home, Mom's place, the office…", text: $name)
                }

                Section("Location") {
                    if location.hasAnyAuthorization {
                        Button {
                            Task { picked = await location.currentLocation() }
                        } label: {
                            Label("Use my current location", systemImage: "location.fill")
                        }
                    }
                    TextField("Search an address", text: $query)
                        .onSubmit { Task { await search() } }
                    if isSearching { ProgressView() }
                    ForEach(results, id: \.self) { item in
                        Button {
                            picked = item.placemark.coordinate
                            if name.isEmpty { name = item.name ?? "" }
                            results = []
                        } label: {
                            VStack(alignment: .leading) {
                                Text(item.name ?? "Unnamed").foregroundStyle(.primary)
                                Text(item.placemark.title ?? "")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if let picked {
                    Section {
                        Map(initialPosition: .region(MKCoordinateRegion(
                            center: picked, latitudinalMeters: 600, longitudinalMeters: 600
                        ))) {
                            Marker(name.isEmpty ? "New place" : name, coordinate: picked)
                        }
                        .frame(height: 180)
                        .listRowInsets(EdgeInsets())
                    }
                }

                if places.isAtCapacity {
                    Text("You've reached the maximum of \(PlacesStore.maxPlaces) saved places. Remove one to add another.")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
            .navigationTitle("Add a place")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(picked == nil || name.trimmingCharacters(in: .whitespaces).isEmpty || places.isAtCapacity)
                }
            }
        }
    }

    private func search() async {
        guard !query.isEmpty else { return }
        isSearching = true
        defer { isSearching = false }
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        results = (try? await MKLocalSearch(request: request).start())?.mapItems ?? []
    }

    private func save() async {
        guard let picked else { return }
        var place = SavedPlace(
            name: name.trimmingCharacters(in: .whitespaces),
            latitude: picked.latitude,
            longitude: picked.longitude
        )
        // Resolve city + nearest neighbourhood now so alerts can carry a grade
        // without a lookup at crossing time.
        if let city = CityRegistry.nearest(to: picked) {
            place.citySlug = city.slug
            if let areas = try? await APIClient.shared.areas(city: city.slug).value.areas {
                let here = CLLocation(latitude: picked.latitude, longitude: picked.longitude)
                if let nearest = areas.compactMap({ a -> (Area, CLLocationDistance)? in
                    guard let c = a.centroid else { return nil }
                    return (a, here.distance(from: CLLocation(latitude: c.lat, longitude: c.lng)))
                }).filter({ $0.1 < 12_000 }).min(by: { $0.1 < $1.1 })?.0 {
                    place.areaSlug = nearest.slug
                    place.areaLabel = nearest.label
                }
            }
        }
        places.add(place)
        // Arrival alerts are the point of the feature, so escalate to Always
        // right after the user saves their first one.
        location.requestAlways()
        dismiss()
    }
}
