import SwiftUI

/// Attribution for the city backdrop photography.
///
/// Every backdrop is a real photograph of the named city from Wikimedia
/// Commons, mostly under CC-BY / CC-BY-SA, which permit commercial use with
/// attribution. Each row links to the photo's canonical Commons file page,
/// where the photographer and the exact licence version are documented —
/// attribution by URI, as CC-BY-SA 4.0 §3(a)(2) allows. Shipping the photos
/// without this screen would not satisfy those licences.
struct PhotoCreditsView: View {
    @EnvironmentObject private var state: AppState
    @State private var query = ""

    private var cities: [City] {
        let covered = CityRegistry.all.filter { !CityPhotos.photos(for: $0.slug).isEmpty }
        guard !query.isEmpty else { return covered }
        return covered.filter { $0.label.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        List {
            Section {
                Text("Every backdrop in CommunitySafe is a photograph of the city you're looking at, from Wikimedia Commons. Most are licensed CC-BY or CC-BY-SA, which allow commercial use with attribution. Each link below opens the photo's Commons page, where the photographer and the exact licence are recorded.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Link("Wikimedia Commons", destination: URL(string: "https://commons.wikimedia.org")!)
                    .font(.footnote)
                Link("About CC-BY-SA 4.0", destination: URL(string: "https://creativecommons.org/licenses/by-sa/4.0/")!)
                    .font(.footnote)
            } header: {
                Text("Photography")
            }

            ForEach(cities) { city in
                Section(city.label) {
                    ForEach(Array(CityPhotos.photos(for: city.slug).enumerated()), id: \.offset) { index, url in
                        if let page = CityPhotos.commonsPage(for: url) {
                            Link(destination: page) {
                                HStack {
                                    Text(Self.fileName(from: url))
                                        .font(.caption)
                                        .lineLimit(2)
                                    Spacer()
                                    Image(systemName: "arrow.up.right")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        } else {
                            Text(Self.fileName(from: url)).font(.caption)
                        }
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "Search cities")
        .navigationTitle("Photo Credits")
        .navigationBarTitleDisplayMode(.inline)
    }

    /// Turns the thumbnail URL back into the readable Commons file name.
    static func fileName(from url: URL) -> String {
        let parts = url.absoluteString.split(separator: "/")
        guard let last = parts.last else { return url.lastPathComponent }
        let stripped = last.hasPrefix("1920px-") ? String(last.dropFirst("1920px-".count)) : String(last)
        return (stripped.removingPercentEncoding ?? stripped).replacingOccurrences(of: "_", with: " ")
    }
}
