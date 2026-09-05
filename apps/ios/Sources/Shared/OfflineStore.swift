import Foundation
import OSLog

/// Disk-backed cache in the shared App Group container.
///
/// This is what makes the app usable with no connection: every successful API
/// response is written here, and every read falls back to it. The app never
/// shows a blank screen because the network is down — it shows the last known
/// grade, clearly labelled with when it was captured.
///
/// The widget reads the same files, so a widget refresh that lands while the
/// device is offline still renders real data.
struct CachedEnvelope<T: Codable & Sendable>: Codable, Sendable {
    let value: T
    let fetchedAt: Date

    var age: TimeInterval { Date().timeIntervalSince(fetchedAt) }

    /// Crime feeds update daily at best, so an hour-old score is still the
    /// current answer; past a day we say so in the UI.
    var isStale: Bool { age > 60 * 60 * 24 }
}

actor OfflineStore {
    static let shared = OfflineStore()

    private let log = Logger(subsystem: "app.communitysafe", category: "cache")
    private let directory: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(directory: URL = AppGroup.containerURL.appendingPathComponent("cache", isDirectory: true)) {
        self.directory = directory
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private func url(for key: String) -> URL {
        // Keys carry slugs and query values; percent-encode so "a/b" can't
        // escape the cache directory or collide with a sibling entry.
        let safe = key.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? key
        return directory.appendingPathComponent("\(safe).json")
    }

    func write<T: Codable & Sendable>(_ value: T, key: String) {
        let envelope = CachedEnvelope(value: value, fetchedAt: Date())
        do {
            let data = try encoder.encode(envelope)
            try data.write(to: url(for: key), options: .atomic)
        } catch {
            // A cache write failing must never break the request that produced
            // the value — the user already has fresh data in hand.
            log.error("cache write failed for \(key, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    func read<T: Codable & Sendable>(_ type: T.Type, key: String) -> CachedEnvelope<T>? {
        guard let data = try? Data(contentsOf: url(for: key)) else { return nil }
        return try? decoder.decode(CachedEnvelope<T>.self, from: data)
    }

    /// Non-isolated convenience for the widget timeline, which runs in a tight
    /// budget and only ever reads.
    nonisolated static func readSync<T: Codable & Sendable>(_ type: T.Type, key: String) -> CachedEnvelope<T>? {
        let dir = AppGroup.containerURL.appendingPathComponent("cache", isDirectory: true)
        let safe = key.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? key
        guard let data = try? Data(contentsOf: dir.appendingPathComponent("\(safe).json")) else { return nil }
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return try? d.decode(CachedEnvelope<T>.self, from: data)
    }

    func clear() {
        try? FileManager.default.removeItem(at: directory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
}
