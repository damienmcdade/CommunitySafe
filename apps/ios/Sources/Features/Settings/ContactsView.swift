import SwiftUI

/// Manage the people a lapsed check-in will notify.
struct ContactsView: View {
    @EnvironmentObject private var contacts: ContactsManager
    @State private var showingAdd = false

    var body: some View {
        List {
            if contacts.contacts.isEmpty && !contacts.isLoading {
                ContentUnavailableView {
                    Label("No trusted contacts", systemImage: "person.2.slash")
                } description: {
                    Text("Add someone who should hear from us if a check-in lapses. They'll get an email asking them to confirm first.")
                } actions: {
                    Button("Add a contact") { showingAdd = true }
                        .buttonStyle(.borderedProminent)
                }
            }

            ForEach(contacts.contacts) { contact in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(contact.label).font(.body)
                        Spacer()
                        TagPill(
                            text: contact.isConfirmed ? "Confirmed" : "Awaiting confirmation",
                            color: contact.isConfirmed ? .green : .orange,
                            systemImage: contact.isConfirmed ? "checkmark.seal" : "clock"
                        )
                    }
                    if let detail = contact.email ?? contact.phone {
                        Text(detail).font(.caption).foregroundStyle(.secondary)
                    }
                    if !contact.isConfirmed {
                        Button("Resend confirmation") {
                            Task { await contacts.resendConfirmation(contact) }
                        }
                        .font(.caption)
                    }
                }
                .padding(.vertical, 2)
                .swipeActions {
                    Button("Remove", role: .destructive) {
                        Task { await contacts.remove(contact) }
                    }
                }
            }

            if let error = contacts.errorMessage {
                Text(error).font(.caption).foregroundStyle(.red)
            }
        }
        .navigationTitle("Trusted contacts")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Add a contact")
            }
        }
        .sheet(isPresented: $showingAdd) { AddContactView() }
        .task { await contacts.load() }
        .refreshable { await contacts.load() }
        .overlay { if contacts.isLoading && contacts.contacts.isEmpty { ProgressView() } }
    }
}

struct AddContactView: View {
    @EnvironmentObject private var contacts: ContactsManager
    @Environment(\.dismiss) private var dismiss

    @State private var label = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var hasPermission = false
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Who is this?") {
                    TextField("Name, e.g. Mom", text: $label)
                        .textContentType(.name)
                }
                Section {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Phone (optional)", text: $phone)
                        .textContentType(.telephoneNumber)
                        .keyboardType(.phonePad)
                } footer: {
                    Text("We'll email them a link to confirm. Until they confirm, they won't be contacted.")
                }
                Section {
                    Toggle("I have their permission to add them", isOn: $hasPermission)
                } footer: {
                    Text("Required: this person will receive alerts about you, so they need to have agreed to it.")
                }
            }
            .navigationTitle("Add contact")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            isSaving = true
                            let ok = await contacts.add(
                                label: label,
                                email: email.isEmpty ? nil : email,
                                phone: phone.isEmpty ? nil : phone
                            )
                            isSaving = false
                            if ok { dismiss() }
                        }
                    }
                    .disabled(label.isEmpty || (email.isEmpty && phone.isEmpty) || !hasPermission || isSaving)
                }
            }
        }
    }
}
