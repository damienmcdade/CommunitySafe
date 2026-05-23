import { crimeData } from ".";
import { cityBySlug } from "./cities";
import type { Incident } from "./types";

const WEEKS = 12;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
// Per-area cap for citywide aggregation; same rationale as mix.ts —
// keeps memory bounded for cities with 100+ neighborhoods.
const CITYWIDE_PER_AREA_LIMIT = 1000;

export interface CategoryTrend {
  category: "PERSONS" | "PROPERTY" | "SOCIETY";
  weekly: number[];        // length = WEEKS, oldest -> newest
  baseline: number;        // mean of all-but-most-recent weeks
  currentVsBaseline: number; // (newest - baseline) / max(baseline, 1)
}

export interface AreaInsights {
  area: string;
  windowWeeks: number;
  totalIncidents: number;
  trends: CategoryTrend[];
  brief: string;
}

function bucketByWeek(incidents: Incident[]): Map<string, number[]> {
  // key -> array length WEEKS
  const byCat = new Map<string, number[]>();
  const now = Date.now();
  const oldestCutoff = now - WEEKS * MS_PER_WEEK;
  for (const i of incidents) {
    const t = new Date(i.occurredAt).getTime();
    if (isNaN(t) || t < oldestCutoff) continue;
    const weekIdx = Math.min(WEEKS - 1, Math.floor((now - t) / MS_PER_WEEK));
    const slot = (WEEKS - 1) - weekIdx; // oldest -> newest
    const arr = byCat.get(i.nibrsCategory) ?? new Array(WEEKS).fill(0);
    arr[slot] += 1;
    byCat.set(i.nibrsCategory, arr);
  }
  return byCat;
}

function buildBrief(area: string, trends: CategoryTrend[]): string {
  if (trends.length === 0 || trends.every((t) => t.weekly.every((w) => w === 0))) {
    return `${area} has had few or no recorded incidents in the recent cached window. Long periods of low activity are typical for many neighborhoods.`;
  }
  const elevated = trends.filter((t) => t.currentVsBaseline > 0.25);
  const calm = trends.filter((t) => t.currentVsBaseline < -0.1);
  const parts: string[] = [];
  if (elevated.length === 0 && calm.length === 0) {
    parts.push(`${area} has been close to its baseline this week.`);
  } else if (elevated.length > 0) {
    const list = elevated.map((t) => `${t.category.toLowerCase()} reports`).join(" and ");
    parts.push(`${area} is showing ${list} above its recent baseline.`);
  } else {
    parts.push(`${area} is running below its recent baseline this week.`);
  }
  if (elevated.length > 0) {
    parts.push("Context: a single-week uptick is common in any neighborhood and does not by itself indicate a trend.");
  }
  return parts.join(" ");
}

function trendsFromIncidents(incidents: Incident[]): CategoryTrend[] {
  const buckets = bucketByWeek(incidents);
  const trends: CategoryTrend[] = [];
  for (const [category, weekly] of buckets) {
    const head = weekly.slice(0, -1);
    const baseline = head.length ? head.reduce((s, n) => s + n, 0) / head.length : 0;
    const newest = weekly[weekly.length - 1];
    trends.push({
      category: category as CategoryTrend["category"],
      weekly,
      baseline,
      currentVsBaseline: baseline > 0 ? (newest - baseline) / baseline : newest > 0 ? 1 : 0,
    });
  }
  trends.sort((a, b) => b.weekly.reduce((s, n) => s + n, 0) - a.weekly.reduce((s, n) => s + n, 0));
  return trends;
}

/// Compute weekly sparkline trends and a plain-language brief for an area.
/// Falls back gracefully if the underlying incident feed returns nothing.
export async function getAreaInsights(area: string): Promise<AreaInsights> {
  const incidents = await crimeData.getIncidents(area, { limit: 5000 });
  const trends = trendsFromIncidents(incidents);
  return {
    area,
    windowWeeks: WEEKS,
    totalIncidents: incidents.length,
    trends,
    brief: buildBrief(area, trends),
  };
}

/// Citywide variant of getAreaInsights. Aggregates the 12-week trend
/// sparklines across every neighborhood of a city. Replaces the previous
/// "pass jurisdiction=<citySlug>" path which fetched zero incidents
/// because the city slug isn't an area slug — that path made the
/// citywide trend graph silently empty.
export async function getCitywideInsights(citySlug: string): Promise<AreaInsights> {
  const city = cityBySlug(citySlug);
  if (!city) {
    return { area: citySlug, windowWeeks: WEEKS, totalIncidents: 0, trends: [], brief: buildBrief(citySlug, []) };
  }
  const areas = await city.discover().catch(() => []);
  const perArea = await Promise.all(
    areas.map((a) => crimeData.getIncidents(a.slug, { limit: CITYWIDE_PER_AREA_LIMIT }).catch(() => [])),
  );
  const incidents = perArea.flat();
  const trends = trendsFromIncidents(incidents);
  const label = `${city.label} (citywide)`;
  return {
    area: label,
    windowWeeks: WEEKS,
    totalIncidents: incidents.length,
    trends,
    brief: buildBrief(label, trends),
  };
}
