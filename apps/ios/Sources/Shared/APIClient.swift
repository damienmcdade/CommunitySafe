import Foundation
import OSLog

/// Result of a fetch, carrying where the data came from so the UI can be honest
/// about it. A safety app that silently shows week-old numbers as if they were
/// current is worse than one that says it is offline.
struct Fresh<T: Sendable>: Sendable {
    let value: T
    let fetchedAt: Date
    let isFromCache: Bool

    var age: TimeInterval { Date().timeIntervalSince(fetchedAt) }
}

enum APIError: LocalizedError {
    case badStatus(Int)
    case warmingUp
    case offlineAndNoCache
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .badStatus(let code): return "The safety service returned an error (\(code))."
        case .warmingUp: return "This city's data feed is warming up. Try again in a moment."
        case .offlineAndNoCache: return "You're offline and this area hasn't been downloaded yet."
        case .decoding(let detail): return "Unexpected response from the safety service. \(detail)"
        }
    }
}

/// Thin, typed client over the CommunitySafe REST API.
///
/// Every read goes through `get(_:key:)`, which caches on success and falls
/// back to the cache on any failure. Callers therefore never need to write
/// offline handling themselves.
actor APIClient {
    static let shared = APIClient()

    /// Crime-data + scoring service. The app talks to it directly — there is
    /// no embedded web view rendering a website.
    static let baseURL = URL(string: "https://communitysafe-api-production.up.railway.app")!

    /// Account, trusted contacts and safety check-ins. These live on the
    /// Next.js API; the Express service's parallel auth stack is retired and
    /// answers 410, so they must not be pointed at `baseURL`.
    /// Apex host only — `www` 307-redirects, and URLSession drops the
    /// Authorization header across a redirect.
    static let accountBaseURL = URL(string: "https://communitysafe.app/api")!

    private let log = Logger(subsystem: "app.communitysafe", category: "api")
    fileprivate let session: URLSession
    fileprivate let decoder: JSONDecoder
    /// Fallback for when the Keychain refuses to persist (an unsigned build,
    /// or a device whose keychain is unavailable). Keeps the session alive for
    /// the lifetime of the process instead of failing every authed call.
    private var inMemoryToken: String?

    init(session: URLSession? = nil) {
        if let session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.default
            // Cold city adapters can take 15-25s server-side; the API itself
            // returns 503 "warming up" past its own deadline, so allow room for
            // that rather than timing out first and showing a generic error.
            config.timeoutIntervalForRequest = 30
            config.timeoutIntervalForResource = 60
            config.waitsForConnectivity = false
            config.requestCachePolicy = .reloadIgnoringLocalCacheData
            self.session = URLSession(configuration: config)
        }
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { d in
            let raw = try d.singleValueContainer().decode(String.self)
            if let date = ISO8601DateFormatter.withFractionalSeconds.date(from: raw) { return date }
            if let date = ISO8601DateFormatter.plain.date(from: raw) { return date }
            throw DecodingError.dataCorrupted(
                .init(codingPath: d.codingPath, debugDescription: "Unrecognised date: \(raw)")
            )
        }
    }

    // MARK: - Core request

    private func get<T: Codable & Sendable>(_ path: String, query: [String: String], cacheKey: String) async throws -> Fresh<T> {
        guard var comps = URLComponents(url: Self.baseURL.appendingPathComponent(path),
                                        resolvingAgainstBaseURL: false) else {
            throw APIError.decoding("Couldn't build a request for \(path).")
        }
        comps.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        guard let url = comps.url else {
            throw APIError.decoding("Couldn't build a request for \(path).")
        }
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(Self.userAgent, forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw APIError.badStatus(-1) }
            // 503 is the API's documented "this city's adapter is cold" signal.
            if http.statusCode == 503 { throw APIError.warmingUp }
            guard (200..<300).contains(http.statusCode) else { throw APIError.badStatus(http.statusCode) }

            let value = try decoder.decode(T.self, from: data)
            await OfflineStore.shared.write(value, key: cacheKey)
            return Fresh(value: value, fetchedAt: Date(), isFromCache: false)
        } catch {
            // Any failure — offline, timeout, cold adapter, a decode change —
            // falls back to the last good copy rather than an empty screen.
            if let cached: CachedEnvelope<T> = await OfflineStore.shared.read(T.self, key: cacheKey) {
                log.notice("serving cached \(cacheKey, privacy: .public) after: \(error.localizedDescription, privacy: .public)")
                return Fresh(value: cached.value, fetchedAt: cached.fetchedAt, isFromCache: true)
            }
            if error is APIError { throw error }
            if (error as NSError).domain == NSURLErrorDomain { throw APIError.offlineAndNoCache }
            throw APIError.decoding(String(describing: error))
        }
    }

    fileprivate static let userAgent: String = {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "CommunitySafe-iOS/\(v) (\(b))"
    }()

    // MARK: - Endpoints

    /// Citywide grade. Exactly one of `city`/`area` may be sent, per the API.
    func citywideScore(city: String) async throws -> Fresh<SafetyScore> {
        try await get("safezone/safety-score", query: ["city": city], cacheKey: "score-city-\(city)")
    }

    /// Neighbourhood-level grade.
    func areaScore(area: String) async throws -> Fresh<SafetyScore> {
        try await get("safezone/safety-score", query: ["area": area], cacheKey: "score-area-\(area)")
    }

    /// Cache-only read of a neighbourhood grade, used by the map.
    ///
    /// The map needs a grade for every neighbourhood in the city at once. Going
    /// to the network for all of them on every visit meant ~40 round-trips to
    /// redraw pins whose underlying feeds update daily at best — slow for the
    /// user, and needless load on the scoring service. This serves anything
    /// recent enough and lets the caller fetch only the genuine misses.
    func cachedAreaScore(area: String, maxAge: TimeInterval) async -> SafetyScore? {
        guard let cached: CachedEnvelope<SafetyScore> = await OfflineStore.shared.read(
            SafetyScore.self, key: "score-area-\(area)"
        ) else { return nil }
        return cached.age <= maxAge ? cached.value : nil
    }

    func citywideTrend(city: String) async throws -> Fresh<TrendReport> {
        try await get("safezone/trend", query: ["city": city], cacheKey: "trend-city-\(city)")
    }

    func areaTrend(area: String) async throws -> Fresh<TrendReport> {
        try await get("safezone/trend", query: ["area": area], cacheKey: "trend-area-\(area)")
    }

    func areas(city: String) async throws -> Fresh<AreasResponse> {
        try await get("geo/areas", query: ["city": city], cacheKey: "areas-\(city)")
    }

    func recentReports(area: String, limit: Int = 60) async throws -> Fresh<RecentReportsResponse> {
        try await get(
            "crime-data/recent",
            query: ["neighborhood": area, "limit": String(limit)],
            cacheKey: "recent-\(area)"
        )
    }
}

extension ISO8601DateFormatter {
    static let withFractionalSeconds: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
}

extension APIClient {
    /// The current session token, preferring the Keychain and falling back to
    /// the in-process copy.
    func currentToken() -> String? {
        Keychain.get(Keychain.Key.accessToken) ?? inMemoryToken
    }

    /// Persists a freshly minted token, keeping a copy in memory so a failed
    /// Keychain write doesn't cost us the session.
    func storeToken(_ token: String) {
        inMemoryToken = token
        Keychain.set(token, for: Keychain.Key.accessToken)
    }

    func clearToken() {
        inMemoryToken = nil
        Keychain.remove(Keychain.Key.accessToken)
    }
}

// MARK: - Authenticated requests

/// Account + trusted-contact + check-in models. These endpoints all require a
/// bearer token; the API rejects anything else with 401.
/// `POST /auth/anonymous` — every device gets a session automatically; there
/// is no sign-up. `reused` is true when the server recognised our token and
/// re-issued for the same user.
struct AnonymousSession: Codable, Sendable {
    let token: String
    let uid: String
    let reused: Bool?
}

struct AccountUser: Codable, Sendable, Hashable {
    let id: String
    let email: String
    let displayName: String?
}

struct TrustedContact: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let label: String
    let email: String?
    let phone: String?
    let status: String
    let confirmedAt: Date?
    let confirmationSentAt: Date?

    /// Only confirmed contacts are notified when a check-in lapses, so the UI
    /// has to distinguish them clearly.
    var isConfirmed: Bool { status.uppercased() == "CONFIRMED" }
}

/// `POST /contacts` answers with just the new row's id and status.
struct CreatedContact: Codable, Sendable {
    let id: String
    let status: String
}

struct ArmedCheckIn: Codable, Sendable {
    let id: String
    let scheduledFor: Date
    let confirmedContactCount: Int
}

enum AuthError: LocalizedError {
    case unauthorized
    case server(String)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "This device's session expired. Reopen the app to renew it."
        case .server(let message): return message
        }
    }
}

extension APIClient {
    /// Sends an authenticated JSON request, refreshing the access token once on
    /// a 401 before giving up. Callers get a typed value or a descriptive error.
    func authed<T: Decodable & Sendable>(
        _ method: String,
        _ path: String,
        body: [String: Any]? = nil,
        as type: T.Type,
        allowRefresh: Bool = true
    ) async throws -> T {
        if currentToken() == nil {
            guard try await refreshSession() else { throw AuthError.unauthorized }
        }
        guard let token = currentToken() else { throw AuthError.unauthorized }
        do {
            return try await perform(method, path, body: body, bearer: token, as: T.self)
        } catch AuthError.unauthorized where allowRefresh {
            guard try await refreshSession() else { throw AuthError.unauthorized }
            return try await authed(method, path, body: body, as: T.self, allowRefresh: false)
        }
    }

    /// Unauthenticated JSON request (register / login / MFA verify).
    func publicPost<T: Decodable & Sendable>(_ path: String, body: [String: Any], as type: T.Type) async throws -> T {
        try await perform("POST", path, body: body, bearer: nil, as: T.self)
    }

    private func perform<T: Decodable & Sendable>(
        _ method: String,
        _ path: String,
        body: [String: Any]?,
        bearer: String?,
        as type: T.Type
    ) async throws -> T {
        var request = URLRequest(url: Self.accountBaseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(Self.userAgentValue, forHTTPHeaderField: "User-Agent")
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AuthError.server("No response from the server.") }

        if http.statusCode == 401 { throw AuthError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            throw AuthError.server(Self.message(from: data, status: http.statusCode))
        }
        if T.self == EmptyResponse.self, let empty = EmptyResponse() as? T { return empty }
        return try decoder.decode(T.self, from: data)
    }

    /// Re-mints the device session. `POST /auth/anonymous` echoes the SAME
    /// user back when given a still-valid bearer, so saved contacts survive;
    /// with a dead token it mints a fresh device identity.
    @discardableResult
    func refreshSession() async throws -> Bool {
        let existing = currentToken()
        do {
            let result: AnonymousSession = try await perform(
                "POST", "auth/anonymous", body: [:], bearer: existing, as: AnonymousSession.self
            )
            storeToken(result.token)
            return true
        } catch {
            return false
        }
    }

    /// Surfaces the API's own error copy where it has any — its messages are
    /// more useful than a generic status string ("Account locked after
    /// repeated failed logins…").
    private static func message(from data: Data, status: Int) -> String {
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let message = json["message"] as? String, !message.isEmpty { return message }
            if let error = json["error"] as? String, !error.isEmpty {
                return error.replacingOccurrences(of: "_", with: " ").capitalized
            }
        }
        return "The server returned an error (\(status))."
    }

    static var userAgentValue: String { userAgent }
}

/// Marker for endpoints that return a body we don't need.
struct EmptyResponse: Codable, Sendable {}
