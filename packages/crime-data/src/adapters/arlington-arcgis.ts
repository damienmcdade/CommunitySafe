import { CrimeCategory } from "../crime-category.js";
import type { AreaStats, CrimeDataAdapter, DataProvenance, Incident } from "../types.js";
import { registerRowCache } from "../cache-registry.js";
import { riskLevelFromAreaCounts } from "../risk-bands.js";
import type { KnownArea } from "../neighborhoods.js";
import { USER_AGENT, readJson, fetchWithRetry } from "../lib/http.js";
import { titleCaseOffense } from "../lib/titlecase-offense.js";
// NOTE: DateOfOccurrence carries the real time-of-day, so no cityLocalToUtcIso
// (America/Chicago) reconstruction is needed — the epoch-ms value is used directly.

// Arlington, TX — Arlington Police Department "PoliceExternal" on-prem ArcGIS
// MapServer (layer 1). Incident-level NIBRS rows with point geometry, the
// offense text (`Description`), the APD police district (`District`:
// NORTH/EAST/SOUTH/WEST) plus a finer `Beat`, and an epoch-ms `DateOfOccurrence`
// that carries the real wall-clock time (minutes present — NOT date-only), so
// we use it directly. The whole dataset is a rolling ~365-day window (~21k
// rows). We take the police district straight from the feed as the area —
// no point-in-polygon needed.
// Source: https://gis2.arlingtontx.gov/agsext2/rest/services/Police/PoliceExternal/MapServer/1

const BASE =
  "https://gis2.arlingtontx.gov/agsext2/rest/services/Police/PoliceExternal/MapServer/1/query";
const PAGE_SIZE = 2000; // = server maxRecordCount
const WINDOW_DAYS = 400; // a touch over a year so the 365d score window is fully covered
const PAGES = 14; // ~21k rows in the full rolling window → 14 pages (28k) has comfortable headroom
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { fetchedAt: number; rows: Incident[] } | null = null;
registerRowCache(() => {
  cache = null;
}, "arlington-arcgis");

interface ArlingtonFeature {
  attributes: {
    OBJECTID?: number;
    ID?: number;
    CaseNumber?: string;
    District?: string; // APD police district: NORTH | EAST | SOUTH | WEST (may be null)
    Beat?: string;
    DateOfOccurrence?: number; // epoch ms, carries real time-of-day
    CrimeCode?: string;
    Description?: string; // offense text, e.g. "ASSAULT; AGGRAVATED ASSAULT"
  };
  geometry?: { x: number; y: number }; // x=lng, y=lat (WGS84 when outSR=4326)
}

// Offense Description → CommunitySafe bucket (Crimes Against Persons / Property /
// Society). Keyword classifier tuned against the 41 distinct Arlington
// Descriptions. NIBRS files robbery under Property, but the FBI UCR counts it
// as a Part-1 VIOLENT offense, so force it to PERSONS (same convention as the
// Long Beach / Dallas / Saint Paul / Dayton adapters).
function classify(description: string | undefined): CrimeCategory {
  const d = (description ?? "").toUpperCase();
  // PERSONS — robbery + violent / against-person offenses.
  if (
    d.includes("ROBBERY") ||
    d.includes("ASSAULT") ||
    d.includes("HOMICIDE") ||
    d.includes("MURDER") ||
    d.includes("MANSLAUGHTER") ||
    d.includes("RAPE") ||
    d.includes("SODOMY") ||
    d.includes("SEX OFFENSE") ||
    d.includes("FONDLING") ||
    d.includes("INCEST") ||
    d.includes("KIDNAP") ||
    d.includes("ABDUCTION") ||
    d.includes("HUMAN TRAFFICKING") ||
    d.includes("INTIMIDATION")
  ) {
    return CrimeCategory.PERSONS;
  }
  // PROPERTY — burglary / theft / vehicle / arson / vandalism / fraud / forgery.
  if (
    d.includes("BURGLARY") ||
    d.includes("THEFT") ||
    d.includes("LARCENY") ||
    d.includes("SHOPLIFTING") ||
    d.includes("POCKET-PICKING") ||
    d.includes("PURSE-SNATCHING") ||
    d.includes("MOTOR VEHICLE") ||
    d.includes("AUTO") ||
    d.includes("ARSON") ||
    d.includes("VANDALISM") ||
    d.includes("DESTRUCTION") ||
    d.includes("DAMAGE") ||
    d.includes("FRAUD") ||
    d.includes("FORGERY") ||
    d.includes("COUNTERFEIT") ||
    d.includes("EMBEZZLEMENT") ||
    d.includes("EXTORTION") ||
    d.includes("BLACKMAIL") ||
    d.includes("STOLEN PROPERTY")
  ) {
    return CrimeCategory.PROPERTY;
  }
  // Everything else (drugs, weapons, prostitution, gambling) → SOCIETY.
  return CrimeCategory.SOCIETY;
}

// Title-case the APD district (feed values are ALL-CAPS: "NORTH", "SOUTH"…).
function titleCaseDistrict(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function slugifyDistrict(name: string): string {
  return `arl-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

const PROVENANCE: DataProvenance = {
  source: "Arlington Police Department (City of Arlington, TX ArcGIS)",
  datasetUrl: "https://www.arlingtontx.gov/city_hall/departments/police",
  recency: "Refreshed daily by the Arlington Police Department (rolling ~12-month NIBRS incident feed)",
  granularity: "neighborhood",
  disclaimer:
    "Incidents are reported by the Arlington Police Department and grouped by APD police " +
    "district — not live, not street-level. CommunitySafe does not track individuals.",
};

async function fetchPage(offset: number, sinceTs: string): Promise<ArlingtonFeature[]> {
  const url = new URL(BASE);
  url.searchParams.set("where", `DateOfOccurrence >= timestamp '${sinceTs}'`);
  url.searchParams.set("outFields", "OBJECTID,ID,CaseNumber,District,Beat,DateOfOccurrence,CrimeCode,Description");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("orderByFields", "DateOfOccurrence DESC");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(PAGE_SIZE));
  url.searchParams.set("cacheHint", "true");
  url.searchParams.set("f", "json");
  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Arlington ArcGIS ${res.status} offset=${offset}`);
  const body = (await readJson(res)) as { features?: ArlingtonFeature[]; error?: unknown };
  // Throw on the embedded ArcGIS error envelope (HTTP 200 + {error:{...}}) so a
  // token-gated/failed layer serves last-known-good instead of grading as zero-crime.
  if (body.error) throw new Error(`Arlington ArcGIS body error offset=${offset}`);
  return body.features ?? [];
}

async function fetchArlington(): Promise<Incident[]> {
  const sinceTs = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const results: ArlingtonFeature[][] = new Array(PAGES);
  let cursor = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= PAGES) return;
      results[i] = await fetchPage(i * PAGE_SIZE, sinceTs).catch(() => [] as ArlingtonFeature[]);
    }
  });
  await Promise.all(workers);
  const feats = results.flat();
  return feats
    .filter((f) => typeof f.attributes.DateOfOccurrence === "number" && (f.attributes.District ?? "").trim())
    .map((f, i) => {
      const a = f.attributes;
      const lng = f.geometry && f.geometry.x !== 0 ? f.geometry.x : undefined;
      const lat = f.geometry && f.geometry.y !== 0 ? f.geometry.y : undefined;
      return {
        id: `arl-${a.ID ?? a.OBJECTID ?? i}`,
        area: titleCaseDistrict((a.District ?? "").trim()),
        // DateOfOccurrence carries the real wall-clock time (minutes present),
        // so use the epoch-ms value directly — no date-only reconstruction needed.
        occurredAt: new Date(a.DateOfOccurrence!).toISOString(),
        nibrsCategory: classify(a.Description),
        ibrOffenseDescription: titleCaseOffense(a.Description ?? "Unknown"),
        beat: a.Beat ?? null,
        blockLabel: undefined,
        lat,
        lng,
      } as Incident;
    });
}

// In-flight fetch dedup: the dispatcher fans a per-area Promise.all over every
// district, so a cold cache would otherwise fire N concurrent full fetches.
let inFlightFetch: Promise<Incident[]> | null = null;
export async function getRowsArlington(): Promise<Incident[]> {
  const now = Date.now();
  if (cache && cache.rows.length > 0 && now - cache.fetchedAt < CACHE_TTL_MS) return cache.rows;
  if (inFlightFetch) return inFlightFetch;
  inFlightFetch = (async () => {
    try {
      const rows = await fetchArlington();
      if (rows.length > 0) cache = { fetchedAt: now, rows };
      return rows;
    } catch (err) {
      console.warn("[arlington] fetch failed:", (err as Error).message);
      return cache?.rows ?? [];
    } finally {
      inFlightFetch = null;
    }
  })();
  return inFlightFetch;
}

export async function getDiscoveredAreasArlington(): Promise<KnownArea[]> {
  const rows = await getRowsArlington();
  const agg = new Map<string, { latSum: number; lngSum: number; count: number }>();
  for (const r of rows) {
    if (!r.area) continue;
    if (r.lat == null || r.lng == null) continue;
    const e = agg.get(r.area) ?? { latSum: 0, lngSum: 0, count: 0 };
    e.latSum += r.lat;
    e.lngSum += r.lng;
    e.count += 1;
    agg.set(r.area, e);
  }
  return Array.from(agg.entries())
    .filter(([, e]) => e.count >= 3)
    .map(([name, e]) => ({
      slug: slugifyDistrict(name),
      label: name,
      jurisdiction: "Arlington",
      centroid: { lat: e.latSum / e.count, lng: e.lngSum / e.count },
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function labelForSlug(slug: string, rows: Incident[]): string | null {
  const want = slug.toLowerCase();
  for (const r of rows) {
    if (slugifyDistrict(r.area) === want) return r.area;
  }
  return null;
}

export const arlingtonAdapter: CrimeDataAdapter = {
  name: "arlington-arcgis",
  async getAreaStats(area: string): Promise<AreaStats | null> {
    const rows = await getRowsArlington();
    const label = labelForSlug(area, rows);
    if (!label) return null;
    const inArea = rows.filter((r) => r.area === label);
    if (inArea.length === 0) return null;
    const riskLevel = riskLevelFromAreaCounts(rows, inArea.length, [40, 120, 250, 500]);
    return {
      area: label,
      crimeRate: null,
      violentCrimeRate: null,
      propertyCrimeRate: null,
      riskLevel,
      provenance: PROVENANCE,
    };
  },
  async getIncidents(area, opts) {
    const rows = await getRowsArlington();
    const label = labelForSlug(area, rows);
    if (!label) return [];
    let filtered = rows.filter((r) => r.area === label);
    if (opts?.since) filtered = filtered.filter((r) => new Date(r.occurredAt) >= opts.since!);
    filtered.sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));
    return filtered.slice(0, opts?.limit ?? 50);
  },
  async getRecentReports(area, opts) {
    return this.getIncidents(area, { limit: opts?.limit ?? 20 });
  },
};
