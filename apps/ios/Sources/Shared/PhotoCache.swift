import CoreGraphics
import CryptoKit
import Foundation
import ImageIO
import OSLog
import UIKit

/// Disk + memory cache for the city backdrop photography.
///
/// Backdrops are decorative, so this never blocks anything: a miss simply
/// leaves the gradient showing. Images are downsampled to the device's screen
/// on the way in — the source files are 1920px wide, and holding several
/// full-size decoded bitmaps is far more memory than a background needs.
actor PhotoCache {
    static let shared = PhotoCache()

    private let log = Logger(subsystem: "app.communitysafe", category: "photos")
    private let directory: URL
    private var memory: [URL: UIImage] = [:]
    private var inFlight: [URL: Task<UIImage?, Never>] = [:]

    /// Small on purpose: at most a handful of backdrops are ever on screen or
    /// about to be, and each is a full-screen bitmap.
    private let memoryLimit = 4

    init(directory: URL = AppGroup.containerURL.appendingPathComponent("photos", isDirectory: true)) {
        self.directory = directory
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    /// Flat, collision-resistant, and — critically — STABLE ACROSS LAUNCHES.
    ///
    /// This used `String.hashValue`, which Swift seeds randomly per process. The
    /// filename therefore changed on every cold start: no cached photo was ever
    /// found again, every launch re-downloaded, and every previous write was
    /// orphaned in the container forever. SHA-256 of the URL is deterministic.
    nonisolated static func cacheFileName(for url: URL) -> String {
        let digest = SHA256.hash(data: Data(url.absoluteString.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private func fileURL(for url: URL) -> URL {
        directory.appendingPathComponent(Self.cacheFileName(for: url))
    }

    /// Cached image, if we already have it on disk or in memory. Never hits the
    /// network — used to decide which photos are eligible for rotation so the
    /// app doesn't burn cellular data cycling through a city's whole set.
    func cached(_ url: URL) -> UIImage? {
        if let image = memory[url] { return image }
        guard let data = try? Data(contentsOf: fileURL(for: url)),
              let image = Self.downsample(data) else { return nil }
        store(image, for: url)
        return image
    }

    /// Whether a photo is already available without touching the network.
    /// Deliberately does not decode — callers use this to decide what is
    /// eligible for rotation.
    func isCached(_ url: URL) -> Bool {
        if memory[url] != nil { return true }
        return FileManager.default.fileExists(atPath: fileURL(for: url).path)
    }

    /// Fetches and caches, coalescing concurrent requests for the same URL.
    func image(_ url: URL) async -> UIImage? {
        if let image = cached(url) { return image }
        if let existing = inFlight[url] { return await existing.value }

        let task = Task<UIImage?, Never> { [directory] in
            var request = URLRequest(url: url)
            request.timeoutInterval = 20
            // Wikimedia asks for a descriptive UA on API and file requests.
            request.setValue("CommunitySafe-iOS (https://communitysafe.app)", forHTTPHeaderField: "User-Agent")
            guard let (data, response) = try? await URLSession.shared.data(for: request),
                  let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let image = Self.downsample(data) else { return nil }
            try? data.write(to: directory.appendingPathComponent(Self.cacheFileName(for: url)), options: .atomic)
            return image
        }
        inFlight[url] = task
        let image = await task.value
        inFlight[url] = nil
        if let image { store(image, for: url) }
        return image
    }

    private func store(_ image: UIImage, for url: URL) {
        if memory.count >= memoryLimit, let victim = memory.keys.first(where: { $0 != url }) {
            memory.removeValue(forKey: victim)
        }
        memory[url] = image
    }

    /// Downsamples to roughly the screen's pixel width. ImageIO does this
    /// without ever fully decoding the 1920px original.
    private nonisolated static func downsample(_ data: Data) -> UIImage? {
        let maxPixels = 1400
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else {
            return nil
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }

    func clear() {
        memory.removeAll()
        try? FileManager.default.removeItem(at: directory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    /// Bytes currently held on disk, for the Settings storage readout.
    func diskUsage() -> Int64 {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: [.fileSizeKey]) else { return 0 }
        return files.reduce(0) { total, url in
            total + Int64((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
    }
}
