import SwiftUI

/// City + neighbourhood selection. A native searchable list rather than a set
/// of dropdowns, because 57 cities and several hundred neighbourhoods are only
/// navigable by typing.
struct ScopePicker: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var filteredCities: [City] {
        guard !query.isEmpty else { return CityRegistry.all }
        return CityRegistry.all.filter { $0.label.localizedCaseInsensitiveContains(query) }
    }

    private var filteredAreas: [Area] {
        guard !query.isEmpty else { return state.areas }
        return state.areas.filter { $0.label.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        NavigationStack {
            List {
                if !state.areas.isEmpty {
                    Section("Neighborhoods in \(state.city.label)") {
                        Button {
                            state.area = nil
                            dismiss()
                        } label: {
                            HStack {
                                Text("\(state.city.label) citywide")
                                Spacer()
                                if state.area == nil {
                                    Image(systemName: "checkmark").foregroundStyle(.tint)
                                }
                            }
                        }
                        ForEach(filteredAreas) { area in
                            Button {
                                state.area = area
                                dismiss()
                            } label: {
                                HStack {
                                    Text(area.label)
                                    Spacer()
                                    if state.area?.slug == area.slug {
                                        Image(systemName: "checkmark").foregroundStyle(.tint)
                                    }
                                }
                            }
                        }
                    }
                }

                Section("Cities") {
                    ForEach(filteredCities) { city in
                        Button {
                            state.city = city
                            // Leave the sheet open so the user can now pick a
                            // neighbourhood in the city they just chose.
                            query = ""
                        } label: {
                            HStack {
                                Text(city.label)
                                Spacer()
                                if state.city.slug == city.slug {
                                    Image(systemName: "checkmark").foregroundStyle(.tint)
                                }
                            }
                        }
                        .foregroundStyle(.primary)
                    }
                }
            }
            .searchable(text: $query, prompt: "Search cities and neighborhoods")
            .navigationTitle("Choose an area")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
