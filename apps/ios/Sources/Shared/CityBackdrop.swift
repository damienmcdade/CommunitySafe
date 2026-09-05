import SwiftUI

/// The city photograph behind the app's content — the same curated Wikimedia
/// Commons photography the website uses, adapted for a phone.
///
/// Three things differ from the web treatment, deliberately:
///
/// 1. **Rotation only cycles photos already on disk.** The web preloads the
///    next photo every 60s; doing that on cellular would download several
///    megabytes in the background just to change a backdrop. Here one photo is
///    fetched per launch, so the set fills in over time and rotation gets
///    richer without ever surprising someone's data plan.
/// 2. **The scrim is stronger and adapts to the system.** This is a safety app;
///    a grade has to stay readable over any photograph.
/// 3. **It honours accessibility settings.** Reduce Motion stops the rotation,
///    and Reduce Transparency / Increase Contrast drop the photo entirely for
///    the flat background.
struct CityBackdrop: View {
    let citySlug: String

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    @State private var image: UIImage?
    @State private var previous: UIImage?
    @State private var index = 0
    @State private var rotation: Task<Void, Never>?

    /// Matches the web's 60-second cadence.
    private static let rotateInterval: TimeInterval = 60

    private var photoIsSuppressed: Bool {
        reduceTransparency || contrast == .increased
    }

    var body: some View {
        ZStack {
            // The flat background is always present: it is what shows before a
            // photo arrives, when a city has no verified photography, offline,
            // and whenever the user has asked for reduced transparency.
            LinearGradient(
                colors: colorScheme == .dark
                    ? [Color(white: 0.06), Color(white: 0.10)]
                    : [Color(.systemGroupedBackground), Color(.secondarySystemGroupedBackground)],
                startPoint: .top,
                endPoint: .bottom
            )

            if !photoIsSuppressed {
                Group {
                    if let previous {
                        Image(uiImage: previous)
                            .resizable()
                            .scaledToFill()
                    }
                    if let image {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .transition(.opacity)
                            .id(index)
                    }
                }
                // A light softening so the photograph reads as depth behind
                // the content rather than as an image competing with it —
                // enough to recede, not so much that the skyline stops being
                // recognisably the user's city. Scaled up first so the blur has
                // pixels to sample past the edges instead of fading to
                // transparent at the margins.
                .scaleEffect(1.05)
                .blur(radius: 4)
                .clipped()

                scrim
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
        .task(id: citySlug) { await load() }
        .onDisappear { rotation?.cancel() }
    }

    /// Keeps text comfortable over any photograph without washing the city out.
    ///
    /// Close to the web's 30/45/65 wash. It can stay this light because almost
    /// every string in the app sits on a material card that carries its own
    /// blur; the only text directly over the photo is the navigation title.
    /// Heavier at the bottom, where the tab bar sits.
    private var scrim: some View {
        Group {
            if colorScheme == .dark {
                LinearGradient(
                    colors: [Color.black.opacity(0.46), Color.black.opacity(0.60), Color.black.opacity(0.78)],
                    startPoint: .top, endPoint: .bottom
                )
            } else {
                LinearGradient(
                    colors: [Color.white.opacity(0.46), Color.white.opacity(0.58), Color.white.opacity(0.78)],
                    startPoint: .top, endPoint: .bottom
                )
            }
        }
    }

    // MARK: - Loading

    private func load() async {
        rotation?.cancel()
        previous = nil
        image = nil

        let photos = CityPhotos.photos(for: citySlug)
        guard !photos.isEmpty else { return }

        // Which of this city's photos are already on disk. Only the URLs are
        // collected here: decoding all eight up front and holding them in an
        // array meant eight full-screen bitmaps resident at once, which
        // defeated the cache's own memory limit.
        var readyURLs: [URL] = []
        for url in photos where await PhotoCache.shared.isCached(url) {
            readyURLs.append(url)
        }

        // Show the first cached one immediately — no network, no wait.
        if let first = readyURLs.first, let img = await PhotoCache.shared.image(first) {
            withAnimation(.easeOut(duration: 0.4)) { image = img }
        }

        // Fetch exactly one new photo per appearance, so a city's set fills in
        // gradually instead of pulling all of it at once.
        if readyURLs.count < photos.count {
            let next = photos[readyURLs.count % photos.count]
            if let fetched = await PhotoCache.shared.image(next) {
                readyURLs.append(next)
                if image == nil {
                    withAnimation(.easeOut(duration: 0.5)) { image = fetched }
                }
            }
        }

        guard readyURLs.count > 1, !reduceMotion, !photoIsSuppressed else { return }
        rotation = Task { await rotate(through: readyURLs) }
    }

    /// Rotates by URL, loading each frame from the cache as it is needed, so
    /// only the outgoing and incoming images are ever resident.
    private func rotate(through urls: [URL]) async {
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: UInt64(Self.rotateInterval * 1_000_000_000))
            guard !Task.isCancelled else { return }
            let next = (index + 1) % urls.count
            guard let img = await PhotoCache.shared.image(urls[next]) else { continue }
            guard !Task.isCancelled else { return }
            await MainActor.run {
                // Keep the outgoing photo underneath so the cross-fade never
                // flashes the background through a transparent frame.
                previous = image
                index = next
                withAnimation(.easeInOut(duration: 1.2)) { image = img }
            }
        }
    }
}

/// Applies the city backdrop behind a screen's content.
private struct CityBackdropModifier: ViewModifier {
    @EnvironmentObject private var state: AppState

    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .background(CityBackdrop(citySlug: state.city.slug))
    }
}

extension View {
    /// Puts the selected city's photograph behind this screen.
    func cityBackdrop() -> some View { modifier(CityBackdropModifier()) }
}
