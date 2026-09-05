import Combine
import Foundation
import OSLog

/// Trusted contacts — the people notified if a safety check-in lapses.
///
/// A contact must confirm by email before they will ever be messaged, which is
/// both the API's rule and the right consent model: nobody gets enrolled into
/// receiving someone else's emergency alerts without agreeing to it.
@MainActor
final class ContactsManager: ObservableObject {
    static let shared = ContactsManager()

    @Published private(set) var contacts: [TrustedContact] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let log = Logger(subsystem: "app.communitysafe", category: "contacts")

    /// Only confirmed contacts are actually notified.
    var confirmedContacts: [TrustedContact] { contacts.filter(\.isConfirmed) }
    var confirmedCount: Int { confirmedContacts.count }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            contacts = try await APIClient.shared.authed("GET", "contacts", as: [TrustedContact].self)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func add(label: String, email: String?, phone: String?) async -> Bool {
        do {
            var body: [String: Any] = ["label": label, "permissionAcknowledged": true]
            if let email, !email.isEmpty { body["email"] = email }
            if let phone, !phone.isEmpty { body["phone"] = phone }
            _ = try await APIClient.shared.authed("POST", "contacts", body: body, as: CreatedContact.self)
            await load()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// Drops the in-memory list after the device's server data is deleted.
    func clearLocal() { contacts = [] }

    func remove(_ contact: TrustedContact) async {
        do {
            _ = try await APIClient.shared.authed("DELETE", "contacts/\(contact.id)", as: EmptyResponse.self)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func resendConfirmation(_ contact: TrustedContact) async {
        do {
            _ = try await APIClient.shared.authed("POST", "contacts/\(contact.id)/resend", as: EmptyResponse.self)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
