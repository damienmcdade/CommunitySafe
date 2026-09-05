import SwiftUI

/// Visual language shared by the app and the widget so a grade reads the same
/// on a card, on the Lock Screen and in the Dynamic Island.
enum Theme {
    /// Grade colours. Deliberately not a pure red/green ramp: colour alone
    /// never carries the meaning, the letter and its plain-language summary
    /// always accompany it, which keeps the app legible for colour-blind users.
    static func color(for grade: Grade) -> Color {
        switch grade {
        case .a: return Color(red: 0.13, green: 0.60, blue: 0.38)
        case .b: return Color(red: 0.40, green: 0.60, blue: 0.20)
        case .c: return Color(red: 0.82, green: 0.62, blue: 0.09)
        case .d: return Color(red: 0.85, green: 0.42, blue: 0.13)
        case .e: return Color(red: 0.78, green: 0.22, blue: 0.22)
        case .unknown: return Color.secondary
        }
    }

    static func color(forCategory category: String) -> Color {
        switch category.uppercased() {
        case "PERSONS": return Color(red: 0.78, green: 0.22, blue: 0.22)
        case "PROPERTY": return Color(red: 0.20, green: 0.45, blue: 0.78)
        case "SOCIETY": return Color(red: 0.55, green: 0.40, blue: 0.72)
        default: return .secondary
        }
    }

    static let cardCorner: CGFloat = 16
}

/// Standard card chrome. One definition keeps spacing and elevation consistent
/// across every screen.
struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            // Material rather than a solid fill: the city photograph behind
            // the app reads through, and the blur keeps text legible over any
            // image. The hairline border stops cards from dissolving into a
            // busy backdrop.
            .background(
                RoundedRectangle(cornerRadius: Theme.cardCorner, style: .continuous)
                    .fill(.regularMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.cardCorner, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
            )
    }
}

extension View {
    func cardStyle() -> some View { modifier(CardModifier()) }
}

/// Big letter grade badge.
struct GradeBadge: View {
    let grade: Grade
    var size: CGFloat = 88

    var body: some View {
        ZStack {
            Circle()
                .fill(Theme.color(for: grade).opacity(0.15))
            Circle()
                .strokeBorder(Theme.color(for: grade), lineWidth: size > 60 ? 4 : 2)
            Text(grade == .unknown ? "?" : grade.rawValue)
                .font(.system(size: size * 0.46, weight: .bold, design: .rounded))
                .foregroundStyle(Theme.color(for: grade))
                .minimumScaleFactor(0.5)
        }
        .frame(width: size, height: size)
        .accessibilityElement()
        .accessibilityLabel("Safety grade \(grade == .unknown ? "unavailable" : grade.rawValue)")
        .accessibilityValue(grade.summary)
    }
}

/// Small pill used for confidence, freshness and category tags.
struct TagPill: View {
    let text: String
    var color: Color = .secondary
    var systemImage: String?

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage { Image(systemName: systemImage).font(.caption2) }
            Text(text).font(.caption).fontWeight(.medium)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Capsule().fill(color.opacity(0.14)))
        .foregroundStyle(color)
    }
}

extension Date {
    /// "just now" / "12 min ago" / "Sep 2" — used wherever the app states how
    /// old a number is, which it does everywhere it shows one.
    var relativeDescription: String {
        let seconds = Date().timeIntervalSince(self)
        if seconds < 90 { return "just now" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: self, relativeTo: Date())
    }
}
