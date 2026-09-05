import SwiftUI
import UserNotifications

/// Safety check-in: start a countdown before you set off, and the app puts a
/// live countdown on the Lock Screen and in the Dynamic Island. If it lapses
/// without you confirming, a time-sensitive notification fires.
struct SafetyView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var checkIn: CheckInManager
    @EnvironmentObject private var contacts: ContactsManager

    @State private var destination = ""
    @State private var minutes = 20
    @State private var showingContacts = false
    @State private var selectedContactIDs: Set<String> = []
    @State private var now = Date()

    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    contactsCard
                    if let active = checkIn.active {
                        activeCard(active)
                    } else {
                        startCard
                    }
                    howItWorksCard
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .cityBackdrop()
            .navigationTitle("Check-in")
            // Only advance the clock while something is actually counting
            // down; this used to tick every second for the life of the app.
            .onReceive(ticker) { if checkIn.isRunning { now = $0 } }
            .sheet(isPresented: $showingContacts) {
                NavigationStack { ContactsView() }
            }
            .task { await contacts.load() }
        }
    }

    // MARK: - Active

    private func activeCard(_ active: CheckInManager.ActiveCheckIn) -> some View {
        let remaining = active.expectedBy.timeIntervalSince(now)
        let overdue = remaining < 0

        return VStack(spacing: 16) {
            VStack(spacing: 6) {
                Text(overdue ? "Overdue" : "Time remaining")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(overdue ? .red : .secondary)
                    .textCase(.uppercase)
                Text(Self.format(abs(remaining)))
                    .font(.system(size: 52, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(overdue ? .red : .primary)
                    .contentTransition(.numericText())
                Text("Heading to \(active.destination)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(overdue
                ? "Check-in overdue for \(active.destination)"
                : "\(Int(remaining / 60)) minutes remaining, heading to \(active.destination)")

            if let letter = active.gradeLetter, let label = active.areaLabel {
                HStack(spacing: 10) {
                    GradeBadge(grade: Grade(apiValue: letter), size: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(label).font(.subheadline.weight(.medium))
                        Text(Grade(apiValue: letter).summary)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
            }

            if active.notifiesContacts > 0 {
                Text(active.notifiesContacts == 1
                     ? "1 contact is alerted if this lapses."
                     : "\(active.notifiesContacts) contacts are alerted if this lapses.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let error = checkIn.lastError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button {
                Task { await checkIn.markSafe() }
            } label: {
                Label("I'm safe", systemImage: "checkmark.shield.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            HStack(spacing: 12) {
                Button("+10 min") { Task { await checkIn.extend(byMinutes: 10) } }
                    .buttonStyle(.bordered)
                Button("Cancel", role: .destructive) { Task { await checkIn.cancel() } }
                    .buttonStyle(.bordered)
            }
        }
        .cardStyle()
    }

    // MARK: - Start

    private var startCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Start a check-in")
                .font(.headline)
            Text("Tell CommunitySafe where you're going and when you expect to arrive. If you don't confirm by then, it alerts you.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            TextField("Where are you heading?", text: $destination)
                .textFieldStyle(.roundedBorder)
                .submitLabel(.done)

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Expected in")
                        .font(.subheadline)
                    Spacer()
                    Text("\(minutes) min")
                        .font(.subheadline.weight(.semibold))
                        .monospacedDigit()
                }
                Slider(value: .init(
                    get: { Double(minutes) },
                    set: { minutes = Int($0.rounded()) }
                ), in: 5...120, step: 5)
                .accessibilityValue("\(minutes) minutes")
            }

            Button {
                Task { await start() }
            } label: {
                Label("Start check-in", systemImage: "figure.walk.motion")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(destination.trimmingCharacters(in: .whitespaces).isEmpty)

            if !checkIn.liveActivitiesEnabled {
                Label(
                    "Live Activities are off, so there won't be a Lock Screen countdown. The overdue alert still works.",
                    systemImage: "info.circle"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .cardStyle()
    }

    /// States plainly whether anyone will actually be told if this lapses.
    /// A check-in that silently notifies nobody is worse than no check-in at
    /// all, so this is never hidden behind a settings screen.
    @ViewBuilder
    private var contactsCard: some View {
        if contacts.confirmedCount == 0 {
            Button {
                showingContacts = true
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("No one will be alerted yet")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        Text(contacts.contacts.isEmpty
                             ? "A check-in currently only alerts you on this device. Add a trusted contact so someone is told if you don't confirm."
                             : "Your contacts haven't confirmed by email yet, so they can't be notified.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                }
                .cardStyle()
            }
            .buttonStyle(.plain)
        } else if checkIn.active == nil {
            // Who to alert is a per-trip choice: telling everyone you know
            // that you walked to the shop is how people stop using a check-in.
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("Alert if I don't confirm", systemImage: "person.2.fill")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Button("Manage") { showingContacts = true }
                        .font(.caption)
                }
                ForEach(contacts.confirmedContacts) { contact in
                    Button {
                        if selectedContactIDs.contains(contact.id) {
                            selectedContactIDs.remove(contact.id)
                        } else {
                            selectedContactIDs.insert(contact.id)
                        }
                    } label: {
                        HStack {
                            Image(systemName: isSelected(contact) ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(isSelected(contact) ? Color.accentColor : Color.secondary.opacity(0.5))
                            Text(contact.label).foregroundStyle(.primary)
                            Spacer()
                            if let detail = contact.email ?? contact.phone {
                                Text(detail)
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                                    .lineLimit(1)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(isSelected(contact) ? [.isSelected] : [])
                }
                Text(selectedContactIDs.isEmpty
                     ? "Nobody selected — all \(contacts.confirmedCount) confirmed contacts will be alerted."
                     : "\(selectedContactIDs.count) selected.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .cardStyle()
        }
    }

    /// Selecting nothing means "everyone", so every row reads as selected until
    /// the user narrows it — the checkboxes match what will actually happen.
    private func isSelected(_ contact: TrustedContact) -> Bool {
        selectedContactIDs.isEmpty || selectedContactIDs.contains(contact.id)
    }

    private var howItWorksCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("What a check-in does")
                .font(.headline)
            row("bolt.badge.clock", "Live countdown", "Shows on your Lock Screen and in the Dynamic Island while you travel.")
            row("bell.badge", "Overdue alert", "An alert if you haven't confirmed you arrived by your ETA.")
            row("person.2.fill", "Your people are told", "If the timer lapses, your confirmed trusted contacts are emailed or texted with your last known location.")
            row("shield.lefthalf.filled", "Destination grade", "The safety grade for where you're heading, attached to the countdown.")
            row("iphone.gen3", "Works from Siri", "Say \u{201C}Start a CommunitySafe check-in\u{201D} or add it to a Shortcut.")
        }
        .cardStyle()
    }

    private func row(_ icon: String, _ title: String, _ body: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.body)
                .foregroundStyle(.tint)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium))
                Text(body).font(.caption).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func start() async {
        // Ask for notification permission at the moment it becomes useful —
        // the user has just chosen to be alerted — rather than at launch.
        await NotificationPermission.request()
        await checkIn.start(
            destination: destination.trimmingCharacters(in: .whitespaces),
            minutes: minutes,
            areaSlug: state.area?.slug,
            areaLabel: state.area?.label,
            contactIDs: Array(selectedContactIDs)
        )
        destination = ""
    }

    static func format(_ interval: TimeInterval) -> String {
        let total = Int(interval.rounded())
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%d:%02d", m, s)
    }
}
