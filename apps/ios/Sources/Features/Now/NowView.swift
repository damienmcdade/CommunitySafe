import CoreLocation
import SwiftUI

/// The landing screen: the grade where you are (or where you've selected),
/// what's driving it, and what has happened recently.
struct NowView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var location: LocationManager
    @State private var showingScopePicker = false
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    scopeButton
                    if let score = state.score {
                        GradeCard(score: score, lastUpdated: state.lastUpdated, isCached: state.isShowingCachedData)
                        CategoryBreakdownCard(rows: score.rows)
                        if let disclaimer = score.disclaimer {
                            MethodologyCard(disclaimer: disclaimer, source: score.source)
                        }
                    } else if state.isLoading {
                        LoadingCard()
                    } else if let message = state.errorMessage {
                        ErrorCard(message: message) { Task { await state.refresh() } }
                    }

                    if let trend = state.trend, !trend.bullets.isEmpty {
                        WhatChangedCard(trend: trend)
                    }
                    if !state.reports.isEmpty {
                        RecentReportsCard(reports: Array(state.reports.prefix(8)))
                    }
                    coverageNote
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Now")
            .refreshable { await state.refresh() }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("Settings")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await state.adoptCurrentLocation(force: true) }
                    } label: {
                        Image(systemName: "location.circle")
                    }
                    .accessibilityLabel("Use my current location")
                    .disabled(!location.hasAnyAuthorization)
                }
            }
            .sheet(isPresented: $showingScopePicker) { ScopePicker() }
            .sheet(isPresented: $showingSettings) { SettingsView() }
        }
    }

    private var scopeButton: some View {
        Button {
            showingScopePicker = true
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.displayLabel)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text(state.scopeIsCitywide ? "Tap to pick a neighborhood" : state.city.label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.up.chevron.down")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .cardStyle()
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var coverageNote: some View {
        if location.isOutsideCoverage {
            Label(
                "You're outside the \(CityRegistry.all.count) cities CommunitySafe covers. Showing the city you selected instead.",
                systemImage: "mappin.slash"
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
            .cardStyle()
        }
    }
}

// MARK: - Cards

struct GradeCard: View {
    let score: SafetyScore
    let lastUpdated: Date?
    let isCached: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 16) {
                GradeBadge(grade: score.letter)
                VStack(alignment: .leading, spacing: 6) {
                    Text(score.area.label)
                        .font(.title3.weight(.semibold))
                    Text(score.letter.summary)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }

            if let headline = score.headline {
                Text(headline)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // Data honesty row — confidence and age are always visible, never
            // buried, because a stale grade is itself safety-relevant.
            HStack(spacing: 8) {
                TagPill(
                    text: score.confidence.label,
                    color: score.confidence == .high ? .green : .orange,
                    systemImage: score.confidence == .high ? "checkmark.seal" : "exclamationmark.triangle"
                )
                if let windowDays = score.windowDays {
                    TagPill(text: "\(windowDays)-day window", systemImage: "calendar")
                }
                if isCached {
                    TagPill(text: "Offline copy", color: .blue, systemImage: "arrow.down.circle")
                }
            }

            if score.confidence != .high {
                Text(score.confidence.explanation)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let lastUpdated {
                Text(isCached
                     ? "Saved \(lastUpdated.relativeDescription) — reconnect to update."
                     : "Updated \(lastUpdated.relativeDescription)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .cardStyle()
    }
}

struct CategoryBreakdownCard: View {
    let rows: [SafetyScore.CategoryRow]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("How it compares")
                .font(.headline)
            Text("Reports per 100,000 residents, against the FBI national rate.")
                .font(.caption)
                .foregroundStyle(.secondary)

            ForEach(rows) { row in
                CategoryRowView(row: row)
            }
        }
        .cardStyle()
    }
}

struct CategoryRowView: View {
    let row: SafetyScore.CategoryRow

    private var deltaText: String? {
        guard let delta = row.deltaPct else { return nil }
        let rounded = Int(delta.rounded())
        if rounded == 0 { return "at the national rate" }
        return rounded > 0 ? "\(rounded)% above national" : "\(abs(rounded))% below national"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Circle()
                    .fill(Theme.color(forCategory: row.category))
                    .frame(width: 8, height: 8)
                Text(row.displayName)
                    .font(.subheadline.weight(.medium))
                Spacer()
                Text("\(row.count) reports")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }

            if let local = row.localPer100k, let national = row.nationalPer100k, national > 0 {
                ComparisonBar(local: local, national: national, color: Theme.color(forCategory: row.category))
            }

            if let deltaText {
                Text(deltaText)
                    .font(.caption)
                    .foregroundStyle((row.deltaPct ?? 0) > 0 ? .orange : .green)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// Local rate drawn against the national rate as a reference line, so the
/// magnitude is readable at a glance without reading the numbers.
struct ComparisonBar: View {
    let local: Double
    let national: Double
    let color: Color

    var body: some View {
        GeometryReader { geo in
            // Scale so the national reference sits at 40% width; that keeps an
            // area running well above it on-screen instead of clipped.
            let scale = geo.size.width * 0.4 / max(national, 1)
            let localWidth = min(geo.size.width, local * scale)
            let nationalX = geo.size.width * 0.4

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color(.tertiarySystemFill))
                    .frame(height: 8)
                Capsule()
                    .fill(color)
                    .frame(width: max(4, localWidth), height: 8)
                Rectangle()
                    .fill(Color.primary.opacity(0.5))
                    .frame(width: 2, height: 14)
                    .offset(x: nationalX)
            }
            .frame(height: 14)
        }
        .frame(height: 14)
        .accessibilityHidden(true)
    }
}

struct WhatChangedCard: View {
    let trend: TrendReport

    private var trendBullets: [TrendReport.Bullet] {
        trend.bullets.filter { !$0.isDispatch }.prefix(4).map { $0 }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("What changed")
                    .font(.headline)
                Spacer()
                if let f = trend.freshness, let status = f.status {
                    TagPill(
                        text: status.capitalized,
                        color: status == "fresh" ? .green : .orange,
                        systemImage: "clock"
                    )
                }
            }
            ForEach(trendBullets) { bullet in
                HStack(alignment: .top, spacing: 8) {
                    Circle()
                        .fill(Theme.color(forCategory: bullet.category ?? ""))
                        .frame(width: 6, height: 6)
                        .padding(.top, 6)
                    Text(bullet.text)
                        .font(.subheadline)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .cardStyle()
    }
}

struct RecentReportsCard: View {
    let reports: [IncidentReport]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recent reports")
                .font(.headline)
            ForEach(reports, id: \.rowID) { report in
                HStack(alignment: .top, spacing: 10) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Theme.color(forCategory: report.category))
                        .frame(width: 3)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(report.title)
                            .font(.subheadline)
                            .fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 6) {
                            Text(report.displayCategory)
                            if let at = report.occurredAt {
                                Text("·")
                                Text(at.formatted(date: .abbreviated, time: .shortened))
                            }
                        }
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 2)
                .accessibilityElement(children: .combine)
            }
            Text("Reports are as published by the local police department and aggregated to neighborhood. Not live and not street-level.")
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .padding(.top, 4)
        }
        .cardStyle()
    }
}

struct MethodologyCard: View {
    let disclaimer: String
    let source: SourceRef?
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.snappy) { expanded.toggle() }
            } label: {
                HStack {
                    Label("How this grade is calculated", systemImage: "info.circle")
                        .font(.subheadline.weight(.medium))
                    Spacer()
                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                }
                .foregroundStyle(.primary)
            }
            .buttonStyle(.plain)

            if expanded {
                Text(disclaimer)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if let source, let urlString = source.url, let url = URL(string: urlString) {
                    Link(destination: url) {
                        Label(source.label, systemImage: "arrow.up.right.square")
                            .font(.caption)
                    }
                }
            }
        }
        .cardStyle()
    }
}

struct LoadingCard: View {
    var body: some View {
        HStack(spacing: 12) {
            ProgressView()
            Text("Loading the safety picture…")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .cardStyle()
    }
}

struct ErrorCard: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Couldn't load", systemImage: "wifi.exclamationmark")
                .font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Button("Try again", action: retry)
                .buttonStyle(.borderedProminent)
        }
        .cardStyle()
    }
}
