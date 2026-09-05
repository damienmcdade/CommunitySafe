import Combine
import Foundation
import OSLog

/// The device's CommunitySafe session.
///
/// There is no sign-up: the app mints an anonymous per-device session the
/// first time it needs one, which is what lets trusted contacts and safety
/// check-ins exist server-side without asking anyone to create an account.
/// The token lives in the Keychain, and re-minting with a still-valid token
/// returns the same identity, so saved contacts survive app updates.
@MainActor
final class SessionManager: ObservableObject {
    static let shared = SessionManager()

    @Published private(set) var user: AccountUser?
    @Published private(set) var isPreparing = false
    @Published var errorMessage: String?

    private let log = Logger(subsystem: "app.communitysafe", category: "session")

    var isReady: Bool { user != nil }

    /// Ensures a usable session exists. Safe to call on every launch.
    func prepare() async {
        guard !isPreparing else { return }
        isPreparing = true
        defer { isPreparing = false }
        do {
            if await APIClient.shared.currentToken() == nil {
                _ = try await APIClient.shared.refreshSession()
            }
            user = try await APIClient.shared.authed("GET", "auth/me", as: AccountUser.self)
            errorMessage = nil
        } catch {
            // Offline on first launch is normal; the session is minted lazily
            // the next time an authenticated feature is actually used.
            log.notice("session not ready: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Guideline 5.1.1(v): the data this device created must be deletable from
    /// inside the app. Removes trusted contacts and check-in history server-side.
    func deleteDeviceData() async -> Bool {
        guard let email = user?.email else { return false }
        do {
            _ = try await APIClient.shared.authed(
                "POST", "account/delete",
                body: ["confirmEmail": email, "confirmText": "DELETE"],
                as: EmptyResponse.self
            )
            await APIClient.shared.clearToken()
            Keychain.remove(Keychain.Key.refreshToken)
            user = nil
            ContactsManager.shared.clearLocal()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }
}
