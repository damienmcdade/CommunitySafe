import { env } from "../../env.js";
import type { AreaRiskAlert, AreaStats, CrimeDataAdapter, Incident } from "./types.js";
import { sandagSocrataAdapter } from "./adapters/sandag-socrata.adapter.js";
import { sdpdNibrsAdapter } from "./adapters/sdpd-nibrs.adapter.js";
import { mockAdapter } from "./adapters/mock.adapter.js";

export * from "./types.js";

const adapters: Record<string, CrimeDataAdapter> = {
  sandag: sandagSocrataAdapter,
  sdpd: sdpdNibrsAdapter,
  mock: mockAdapter,
};

async function tryAdapter<T>(adapter: CrimeDataAdapter, run: (a: CrimeDataAdapter) => Promise<T>): Promise<T | null> {
  try {
    return await run(adapter);
  } catch (err) {
    console.warn(`[crime-data] adapter ${adapter.name} failed:`, (err as Error).message);
    return null;
  }
}

/// Picks adapter(s) per CRIME_DATA_ADAPTER. In "auto" mode, real adapters are
/// tried in order and fall through to the mock if both fail — guaranteeing
/// the UI always renders something.
export const crimeData = {
  async getAreaStats(area: string): Promise<AreaStats | null> {
    const mode = env.CRIME_DATA_ADAPTER;
    if (mode !== "auto") return adapters[mode].getAreaStats(area);
    const stats = await tryAdapter(sandagSocrataAdapter, (a) => a.getAreaStats(area));
    if (stats) return stats;
    const fallback = await tryAdapter(sdpdNibrsAdapter, (a) => a.getAreaStats(area));
    return fallback ?? (await mockAdapter.getAreaStats(area));
  },

  async getIncidents(area: string, opts?: { limit?: number; since?: Date }): Promise<Incident[]> {
    const mode = env.CRIME_DATA_ADAPTER;
    if (mode !== "auto") return adapters[mode].getIncidents(area, opts);
    const incidents = await tryAdapter(sdpdNibrsAdapter, (a) => a.getIncidents(area, opts));
    return incidents ?? (await mockAdapter.getIncidents(area, opts));
  },

  async getRecentReports(area: string, opts?: { limit?: number }): Promise<Incident[]> {
    const mode = env.CRIME_DATA_ADAPTER;
    if (mode !== "auto") return adapters[mode].getRecentReports(area, opts);
    const reports = await tryAdapter(sdpdNibrsAdapter, (a) => a.getRecentReports(area, opts));
    return reports ?? (await mockAdapter.getRecentReports(area, opts));
  },

  /// Derive area-level risk alert cards for the Threat Detection tab from
  /// recent incidents. Returns one alert per NIBRS category present, with a
  /// risk level based on incident count in the window.
  async getAreaAlerts(area: string, opts?: { limit?: number }): Promise<AreaRiskAlert[]> {
    const incidents = await this.getIncidents(area, { limit: opts?.limit ?? 100 });
    if (incidents.length === 0) return [];
    const byCategory = new Map<string, Incident[]>();
    for (const i of incidents) {
      const arr = byCategory.get(i.nibrsCategory) ?? [];
      arr.push(i);
      byCategory.set(i.nibrsCategory, arr);
    }
    const provenance = (incidents[0] as Incident & { provenance?: unknown }).provenance;
    const stats = await this.getAreaStats(area);
    return Array.from(byCategory.entries()).map(([category, items]) => ({
      area,
      category: category as AreaRiskAlert["category"],
      riskLevel: items.length > 60 ? 5 : items.length > 30 ? 4 : items.length > 10 ? 3 : items.length > 3 ? 2 : 1,
      summary: `${items.length} ${category.toLowerCase()} incidents reported in the cached window.`,
      recency: stats?.provenance.recency ?? "see source",
      provenance: stats?.provenance ?? (provenance as AreaRiskAlert["provenance"]),
    }));
  },
};
