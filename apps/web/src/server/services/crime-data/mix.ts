import "server-only";
import { crimeData } from ".";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface OffenseSlice {
  offense: string;
  category: "PERSONS" | "PROPERTY" | "SOCIETY";
  count: number;
  lastOccurredAt: string;
}

export interface CrimeMix {
  area: string;
  /** Number of days the response covers, derived from min(latest) → max(latest) of the matched incidents. */
  windowDays: number;
  /** Date of the most recent incident reflected in the response. */
  asOf: string | null;
  totalIncidents: number;
  topOffenses: OffenseSlice[];
}

/// Specific-offense breakdown of the area's most-recent incidents. Originally
/// this used a strict "last 30 days" filter, but several cities publish their
/// open-data feeds with substantial lag (LAPD shows reports from late 2024 in
/// mid-2026; SDPD NIBRS refreshes quarterly). A 30-day window threw away
/// every row, leaving the graph empty.
///
/// New behavior: pull the most recent up-to-5,000 incidents the adapter has
/// for the area without a date filter, then *report* the actual span those
/// incidents cover so the UI can show "last 87 days" or "as of Dec 2024"
/// honestly instead of pretending we have current data.
export async function getCrimeMix(area: string, _windowDays?: number, topN = 12): Promise<CrimeMix> {
  void _windowDays; // legacy param, no longer used — kept so existing callers don't break
  const incidents = await crimeData.getIncidents(area, { limit: 5000 });
  const counts = new Map<string, { count: number; lastAt: number; category: OffenseSlice["category"] }>();
  let earliest = Infinity;
  let latest = 0;
  for (const i of incidents) {
    const key = i.ibrOffenseDescription || "Unknown";
    const t = +new Date(i.occurredAt);
    if (Number.isFinite(t) && t > 0) {
      if (t < earliest) earliest = t;
      if (t > latest) latest = t;
    }
    const e = counts.get(key) ?? { count: 0, lastAt: 0, category: i.nibrsCategory };
    e.count += 1;
    if (t > e.lastAt) e.lastAt = t;
    counts.set(key, e);
  }
  const topOffenses: OffenseSlice[] = Array.from(counts.entries())
    .map(([offense, e]) => ({ offense, category: e.category, count: e.count, lastOccurredAt: new Date(e.lastAt).toISOString() }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
  const windowDays = (latest > 0 && earliest < Infinity)
    ? Math.max(1, Math.round((latest - earliest) / MS_PER_DAY))
    : 0;
  return {
    area,
    windowDays,
    asOf: latest > 0 ? new Date(latest).toISOString() : null,
    totalIncidents: incidents.length,
    topOffenses,
  };
}
