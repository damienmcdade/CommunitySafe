import Charts
import SwiftUI

/// Swift Charts analysis of the selected area. Every chart is rendered natively
/// by the system charting framework — none of this is an image or an embedded
/// web chart.
struct TrendsView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    if let score = state.score {
                        RateComparisonChart(rows: score.rows, areaLabel: score.area.label)
                    }
                    if let timeOfDay = state.trend?.timeOfDay {
                        TimeOfDayChart(timeOfDay: timeOfDay)
                    }
                    if !state.reports.isEmpty {
                        DailyVolumeChart(reports: state.reports)
                        CategoryMixChart(reports: state.reports)
                    }
                    if state.reports.isEmpty && state.scopeIsCitywide && state.score != nil {
                        Label(
                            "Pick a neighborhood on the Now tab to add per-day volume and category breakdown for its individual reports.",
                            systemImage: "square.grid.2x2"
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .cardStyle()
                    }
                    if let trend = state.trend {
                        DispatchLogCard(bullets: trend.bullets.filter(\.isDispatch))
                    }
                    if state.score == nil && !state.isLoading {
                        ContentUnavailableView(
                            "No data yet",
                            systemImage: "chart.xyaxis.line",
                            description: Text("Pick an area on the Now tab to see its trends.")
                        )
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .cityBackdrop()
            .navigationTitle("Trends")
            .refreshable { await state.refresh() }
        }
    }
}

/// Local vs city vs national rate, grouped by offence category.
struct RateComparisonChart: View {
    let rows: [SafetyScore.CategoryRow]
    let areaLabel: String

    private struct Bar: Identifiable {
        let id = UUID()
        let category: String
        let series: String
        let value: Double
    }

    private var bars: [Bar] {
        rows.flatMap { row -> [Bar] in
            var out: [Bar] = []
            if let v = row.localPer100k { out.append(Bar(category: row.displayName, series: areaLabel, value: v)) }
            // At citywide scope the local rate IS the city rate; plotting both
            // draws two identical bars under two different labels.
            if let v = row.cityPer100k, !isCitywideScope {
                out.append(Bar(category: row.displayName, series: "Citywide", value: v))
            }
            if let v = row.nationalPer100k { out.append(Bar(category: row.displayName, series: "National", value: v)) }
            return out
        }
    }

    /// True when the local and city series are the same measurement.
    private var isCitywideScope: Bool {
        rows.allSatisfy { row in
            guard let local = row.localPer100k, let city = row.cityPer100k else { return false }
            return abs(local - city) < 0.5
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Rate per 100,000 residents")
                .font(.headline)
            Text("This area against its own city and the FBI national rate.")
                .font(.caption)
                .foregroundStyle(.secondary)

            Chart(bars) { bar in
                BarMark(
                    x: .value("Rate", bar.value),
                    y: .value("Category", bar.category)
                )
                .position(by: .value("Series", bar.series))
                .foregroundStyle(by: .value("Series", bar.series))
            }
            .chartLegend(position: .bottom, spacing: 8)
            .chartXAxis { AxisMarks(preset: .aligned) }
            .frame(height: max(160, CGFloat(rows.count) * 78))
            .accessibilityLabel("Bar chart comparing this area's rate to its city and the national rate")
        }
        .cardStyle()
    }
}

/// When incidents happen — straight from the API's own bucketing.
struct TimeOfDayChart: View {
    let timeOfDay: TrendReport.TimeOfDay

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Time of day")
                    .font(.headline)
                Spacer()
                if let dominant = timeOfDay.dominant {
                    TagPill(text: "Peak: \(TrendReport.TimeOfDay.label(for: dominant))", color: .orange, systemImage: "clock")
                }
            }

            Chart(timeOfDay.ordered, id: \.key) { bucket in
                BarMark(
                    x: .value("Window", bucket.label),
                    y: .value("Reports", bucket.count)
                )
                .foregroundStyle(Color.accentColor.gradient)
                .cornerRadius(4)
            }
            .frame(height: 170)
            .accessibilityLabel("Bar chart of reports by time of day")
        }
        .cardStyle()
    }
}

/// Daily volume, computed on device from the recent-report feed.
struct DailyVolumeChart: View {
    let reports: [IncidentReport]

    private struct Day: Identifiable {
        let id: Date
        let count: Int
    }

    private var days: [Day] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: reports.compactMap(\.occurredAt)) {
            calendar.startOfDay(for: $0)
        }
        return grouped
            .map { Day(id: $0.key, count: $0.value.count) }
            .sorted { $0.id < $1.id }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Reports per day")
                .font(.headline)
            Text("From the most recent reports published for this area.")
                .font(.caption)
                .foregroundStyle(.secondary)

            Chart(days) { day in
                AreaMark(
                    x: .value("Day", day.id, unit: .day),
                    y: .value("Reports", day.count)
                )
                .foregroundStyle(Color.accentColor.opacity(0.25).gradient)
                .interpolationMethod(.monotone)

                LineMark(
                    x: .value("Day", day.id, unit: .day),
                    y: .value("Reports", day.count)
                )
                .foregroundStyle(Color.accentColor)
                .interpolationMethod(.monotone)
            }
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 4)) {
                    AxisGridLine()
                    AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                }
            }
            .frame(height: 170)
            .accessibilityLabel("Line chart of report volume per day")
        }
        .cardStyle()
    }
}

/// Category mix as a native donut.
struct CategoryMixChart: View {
    let reports: [IncidentReport]

    private struct Slice: Identifiable {
        let id: String
        let label: String
        let count: Int
    }

    private var slices: [Slice] {
        Dictionary(grouping: reports, by: \.category)
            .map { Slice(id: $0.key, label: $0.value.first?.displayCategory ?? $0.key, count: $0.value.count) }
            .sorted { $0.count > $1.count }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What kind of reports")
                .font(.headline)

            Chart(slices) { slice in
                SectorMark(
                    angle: .value("Reports", slice.count),
                    innerRadius: .ratio(0.6),
                    angularInset: 2
                )
                .foregroundStyle(Theme.color(forCategory: slice.id))
                .cornerRadius(4)
            }
            .frame(height: 180)
            .accessibilityLabel("Donut chart of report categories")

            HStack(spacing: 14) {
                ForEach(slices) { slice in
                    HStack(spacing: 5) {
                        Circle()
                            .fill(Theme.color(forCategory: slice.id))
                            .frame(width: 8, height: 8)
                        Text("\(slice.label) \(slice.count)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .cardStyle()
    }
}

struct DispatchLogCard: View {
    let bullets: [TrendReport.Bullet]

    var body: some View {
        if !bullets.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Latest dispatches")
                    .font(.headline)
                ForEach(bullets.prefix(10)) { bullet in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "dot.radiowaves.left.and.right")
                            .font(.caption)
                            .foregroundStyle(Theme.color(forCategory: bullet.category ?? ""))
                            .padding(.top, 2)
                        Text(bullet.text)
                            .font(.caption)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .cardStyle()
        }
    }
}
