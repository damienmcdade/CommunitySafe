import CoreLocation
import MapKit
import SwiftUI

/// Native MapKit view of the selected city: one pin per neighbourhood coloured
/// by its grade, plus individual incident reports for the selected area.
///
/// This is a real MKMapView through SwiftUI's Map, not a web map in a frame —
/// it uses the system map, the system's own location puck, and native
/// annotation selection.
struct MapScreen: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var location: LocationManager

    @State private var camera: MapCameraPosition = .automatic
    @State private var areaGrades: [String: Grade] = [:]
    @State private var selection: MapSelection?
    @State private var showsIncidents = true
    @State private var isLoadingGrades = false

    private enum MapSelection: Hashable {
        case area(String)
        case incident(String)
    }

    var body: some View {
        NavigationStack {
            Map(position: $camera, selection: $selection) {
                UserAnnotation()

                ForEach(state.areas) { area in
                    if let c = area.centroid {
                        Annotation(area.label, coordinate: CLLocationCoordinate2D(latitude: c.lat, longitude: c.lng)) {
                            AreaPin(
                                grade: areaGrades[area.slug] ?? .unknown,
                                isSelected: state.area?.slug == area.slug
                            )
                            .onTapGesture { select(area) }
                        }
                        .tag(MapSelection.area(area.slug))
                        .annotationTitles(.hidden)
                    }
                }

                if showsIncidents {
                    ForEach(mappableReports, id: \.rowID) { report in
                        if let lat = report.lat, let lng = report.lng {
                            Annotation(
                                report.displayCategory,
                                coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lng)
                            ) {
                                Circle()
                                    .fill(Theme.color(forCategory: report.category))
                                    .frame(width: 9, height: 9)
                                    .overlay(Circle().strokeBorder(.white, lineWidth: 1.5))
                                    .accessibilityLabel("\(report.displayCategory) report: \(report.title)")
                            }
                            .annotationTitles(.hidden)
                        }
                    }
                }
            }
            .mapControls {
                MapUserLocationButton()
                MapCompass()
                MapScaleView()
            }
            .navigationTitle("Map")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) { legend }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Toggle(isOn: $showsIncidents) {
                        Image(systemName: "mappin.and.ellipse")
                    }
                    .toggleStyle(.button)
                    .accessibilityLabel("Show individual reports")
                }
            }
            .task(id: state.city.slug) {
            // Drop the previous city's grades: they can never match this
            // city's slugs, and keeping them grew the dictionary for the life
            // of the process as the user browsed.
            areaGrades.removeAll()
            await frameCity()
            await loadGrades()
        }
            .onChange(of: state.areas.count) { _, _ in Task { await loadGrades() } }
        }
    }

    /// Explains what is on screen right now, rather than describing a
    /// selection the user may not have made.
    private var legendCaption: String {
        guard showsIncidents else { return "Circles are neighborhoods, colored by grade." }
        if let area = state.area {
            return "Dots are individual reports in \(area.label). Tap a circle to switch neighborhood."
        }
        return "Tap a neighborhood circle to load its individual reports."
    }

    private var mappableReports: [IncidentReport] {
        state.reports.filter { $0.lat != nil && $0.lng != nil }.prefix(120).map { $0 }
    }

    private var legend: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                ForEach([Grade.a, .b, .c, .d, .e], id: \.self) { g in
                    HStack(spacing: 4) {
                        Circle().fill(Theme.color(for: g)).frame(width: 10, height: 10)
                        Text(g.rawValue).font(.caption2.weight(.semibold))
                    }
                }
                Spacer()
                if isLoadingGrades { ProgressView().controlSize(.mini) }
            }
            Text(legendCaption)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(12)
    }

    private func select(_ area: Area) {
        state.area = area
        if let c = area.centroid {
            withAnimation {
                camera = .region(MKCoordinateRegion(
                    center: CLLocationCoordinate2D(latitude: c.lat, longitude: c.lng),
                    latitudinalMeters: 3_000,
                    longitudinalMeters: 3_000
                ))
            }
        }
    }

    private func frameCity() async {
        let city = state.city
        withAnimation {
            // Drive the frame from latitude only and let MapKit widen
            // longitude to the device aspect. Padding both axes zoomed a
            // tall phone all the way out to the surrounding region.
            camera = .region(MKCoordinateRegion(
                center: city.center,
                span: MKCoordinateSpan(
                    latitudeDelta: max(0.05, (city.north - city.south) * 1.2),
                    longitudeDelta: max(0.02, (city.east - city.west) * 0.35)
                )
            ))
        }
    }

    /// Grades every visible neighbourhood. Bounded concurrency: the API scores
    /// each area independently and firing all of them at once on a cold city
    /// makes the server shed load, so this walks a small window at a time.
    private func loadGrades() async {
        var targets = state.areas.prefix(40).map(\.slug).filter { areaGrades[$0] == nil }
        guard !targets.isEmpty else { return }
        isLoadingGrades = true
        defer { isLoadingGrades = false }

        // Serve everything already cached and recent first, so revisiting the
        // map paints instantly (and works offline) instead of re-fetching every
        // neighbourhood. Grades derive from feeds that refresh daily at best.
        var stillMissing: [String] = []
        for slug in targets {
            if let cached = await APIClient.shared.cachedAreaScore(area: slug, maxAge: 6 * 60 * 60) {
                areaGrades[slug] = cached.letter
            } else {
                stillMissing.append(slug)
            }
        }
        targets = stillMissing
        guard !targets.isEmpty else { return }

        await withTaskGroup(of: (String, Grade)?.self) { group in
            var iterator = targets.makeIterator()
            var inFlight = 0
            let maxConcurrent = 6

            func addNext() {
                guard let slug = iterator.next() else { return }
                inFlight += 1
                group.addTask {
                    guard let fresh = try? await APIClient.shared.areaScore(area: slug) else { return nil }
                    return (slug, fresh.value.letter)
                }
            }

            for _ in 0..<maxConcurrent { addNext() }
            while inFlight > 0 {
                guard let result = await group.next() else { break }
                inFlight -= 1
                if let (slug, grade) = result { areaGrades[slug] = grade }
                addNext()
            }
        }
    }
}

struct AreaPin: View {
    let grade: Grade
    let isSelected: Bool

    private var size: CGFloat { isSelected ? 34 : 26 }

    var body: some View {
        ZStack {
            if grade == .unknown {
                // Not yet scored. A filled dark circle here read as a grade —
                // and as a bug — on a map that is still loading, so a pending
                // neighborhood is a small hollow marker that recedes instead.
                Circle()
                    .fill(.regularMaterial)
                    .frame(width: size * 0.6, height: size * 0.6)
                Circle()
                    .strokeBorder(Color.secondary.opacity(0.5), lineWidth: 1.5)
                    .frame(width: size * 0.6, height: size * 0.6)
            } else {
                Circle()
                    .fill(Theme.color(for: grade))
                    .frame(width: size, height: size)
                Circle()
                    .strokeBorder(.white, lineWidth: isSelected ? 3 : 2)
                    .frame(width: size, height: size)
                Text(grade.rawValue)
                    .font(.system(size: isSelected ? 15 : 12, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }
        }
        .shadow(radius: grade == .unknown ? 0 : 2, y: grade == .unknown ? 0 : 1)
        .animation(.snappy, value: isSelected)
        .animation(.easeOut(duration: 0.25), value: grade)
        .accessibilityLabel(grade == .unknown ? "Neighborhood, grade loading" : "Grade \(grade.rawValue)")
    }
}
