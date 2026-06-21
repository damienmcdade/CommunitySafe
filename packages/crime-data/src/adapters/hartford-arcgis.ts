import { CrimeCategory } from "../crime-category.js";
import type { AreaStats, CrimeDataAdapter, DataProvenance, Incident } from "../types.js";
import { registerRowCache } from "../cache-registry.js";
import { riskLevelFromAreaCounts } from "../risk-bands.js";
import type { KnownArea } from "../neighborhoods.js";
import { USER_AGENT, readJson, fetchWithRetry } from "../lib/http.js";
import { titleCaseOffense } from "../lib/titlecase-offense.js";
import { cityLocalToUtcIso } from "../lib/city-time.js";
import { hartfordPolygons } from "../data/hartford-neighborhoods.js";

// Hartford, CT — Hartford Police "Police Incidents Current Year to 10 Days
// before the Current Date" ArcGIS FeatureServer (OpenData_PublicSafety/21).
// Incident-level NIBRS rows with point geometry; the city refreshes a
// current-calendar-year window (~47k rows) with a deliberate ~10-day lag.
// Rows carry a NIBRS offense description (`NibrsDesc`), a calendar `Date`
// (epoch-ms UTC midnight) and a separate `Time` ("HHMM") string. There is no
// neighborhood in the feed, so we geocode every incident to one of Hartford's
// 17 official neighborhood districts via point-in-polygon ("Unknown" for the
// rare point outside every polygon).
// Source: https://utility.arcgis.com/usrsvcs/servers/4bc28c820ebd45df8a62feae6dc8822d/rest/services/OpenData_PublicSafety/FeatureServer/21

const BASE =
  "https://utility.arcgis.com/usrsvcs/servers/4bc28c820ebd45df8a62feae6dc8822d/rest/services/OpenData_PublicSafety/FeatureServer/21/query";
const HARTFORD_TZ = "America/New_York";
const PAGE_SIZE = 2000; // = server maxRecordCount
const WINDOW_DAYS = 400; // a touch over a year so the 365d score window is fully covered
const PAGES = 30; // ~47k rows/current-year → 30 pages (60k) has comfortable headroom
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { fetchedAt: number; rows: Incident[] } | null = null;
registerRowCache(() => {
  cache = null;
}, "hartford-arcgis");

interface HartfordFeature {
  attributes: {
    OBJECTID?: number;
    CaseNum?: string;
    Date?: number; // epoch ms, calendar date at UTC midnight
    Time?: string; // "HHMM" local clock string
    NibrsCode?: string;
    NibrsDesc?: string; // e.g. "AGGRAVATED ASSAULT"
    OffenseDesc?: string;
    Address?: string;
  };
  geometry?: { x: number; y: number }; // x=lng, y=lat (WGS84 when outSR=4326)
}

// NIBRS offense description → CommunitySafe bucket (Crimes Against Persons /
// Property / Society). Robbery is filed by NIBRS under Property but the FBI UCR
// counts it as a Part-1 VIOLENT offense, so force it to PERSONS (same
// convention as the Long Beach / Dallas / Saint Paul / Dayton adapters).
function classify(nibrsDesc: string | undefined): CrimeCategory {
  const d = (nibrsDesc ?? "").toUpperCase();
  if (d.includes("ROBBERY")) return CrimeCategory.PERSONS;
  if (
    d.includes("ASSAULT") ||
    d.includes("HOMICIDE") ||
    d.includes("MURDER") ||
    d.includes("MANSLAUGHTER") ||
    d.includes("KIDNAPPING") ||
    d.includes("ABDUCTION") ||
    d.includes("SEX OFFENSE") ||
    d.includes("RAPE") ||
    d.includes("SODOMY") ||
    d.includes("FONDLING") ||
    d.includes("INCEST") ||
    d.includes("HUMAN TRAFFICKING") ||
    d.includes("INTIMIDATION")
  ) {
    return CrimeCategory.PERSONS;
  }
  if (
    d.includes("BURGLARY") ||
    d.includes("BREAKING AND ENTERING") ||
    d.includes("LARCENY") ||
    d.includes("THEFT") ||
    d.includes("SHOPLIFTING") ||
    d.includes("MOTOR VEHICLE") ||
    d.includes("ARSON") ||
    d.includes("VANDALISM") ||
    d.includes("DAMAGE") ||
    d.includes("DESTRUCTION") ||
    d.includes("FRAUD") ||
    d.includes("FORGERY") ||
    d.includes("COUNTERFEIT") ||
    d.includes("EMBEZZLEMENT") ||
    d.includes("EXTORTION") ||
    d.includes("STOLEN PROPERTY") ||
    d.includes("BRIBERY")
  ) {
    return CrimeCategory.PROPERTY;
  }
  return CrimeCategory.SOCIETY;
}

// Catch-all for the rare point outside every neighborhood polygon — counts
// citywide but is not a browsable neighborhood, so it's excluded from discovery.
const NON_NEIGHBORHOOD = new Set(["Unknown", ""]);

function slugifyNeighborhood(name: string): string {
  return `htfd-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

// Point-in-polygon geocoder over Hartford's 17 official neighborhood districts.
// bbox-prefiltered ray casting — same self-contained pattern as the Long Beach
// / Indianapolis / Boston adapters.
interface PolyIndex { name: string; bbox: [number, number, number, number]; rings: number[][][] }
const POLY_INDEX: PolyIndex[] = hartfordPolygons.map((p) => {
  const rings: number[][][] = p.geometry.type === "Polygon"
    ? (p.geometry.coordinates as number[][][])
    : (p.geometry.coordinates as number[][][][]).flat();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { name: p.name, bbox: [minX, minY, maxX, maxY], rings };
});
function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function geocodeHartford(lng: number, lat: number): string | null {
  for (const p of POLY_INDEX) {
    const [minX, minY, maxX, maxY] = p.bbox;
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
    let parity = 0;
    for (const ring of p.rings) if (pointInRing(lng, lat, ring)) parity++;
    if (parity % 2 === 1) return p.name;
  }
  return null;
}

const PROVENANCE: DataProvenance = {
  source: "Hartford Police Department (City of Hartford ArcGIS Open Data)",
  datasetUrl: "https://data.hartford.gov/",
  recency: "Refreshed by the Hartford Police Department (current-year incident feed, ~10-day lag)",
  granularity: "neighborhood",
  disclaimer:
    "Incidents are reported by the Hartford Police Department and geocoded to one of " +
    "17 official Hartford neighborhood districts (a rare point outside every polygon is " +
    "labeled Unknown) — not live, not street-level. CommunitySafe does not track individuals.",
};

// Date is the calendar date at UTC midnight; Time is a separate "HHMM" local
// clock string. Extract the UTC-midnight Y-M-D, attach the local hour:minute,
// and convert the Hartford wall-clock back to UTC.
function occurredAtFor(dateMs: number | undefined, time: string | undefined): string {
  if (typeof dateMs !== "number") return cityLocalToUtcIso(null, HARTFORD_TZ);
  const ymd = new Date(dateMs).toISOString().slice(0, 10); // UTC date portion
  const t = (time ?? "").replace(/\D/g, "").padStart(4, "0").slice(0, 4);
  const hh = String(Math.min(23, Math.max(0, parseInt(t.slice(0, 2) || "0", 10)))).padStart(2, "0");
  const mm = String(Math.min(59, Math.max(0, parseInt(t.slice(2, 4) || "0", 10)))).padStart(2, "0");
  return cityLocalToUtcIso(`${ymd}T${hh}:${mm}:00`, HARTFORD_TZ);
}

async function fetchPage(offset: number, sinceTs: string): Promise<HartfordFeature[]> {
  const url = new URL(BASE);
  url.searchParams.set("where", `Date >= timestamp '${sinceTs}'`);
  url.searchParams.set("outFields", "OBJECTID,CaseNum,Date,Time,NibrsCode,NibrsDesc,OffenseDesc,Address");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("orderByFields", "Date DESC");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(PAGE_SIZE));
  url.searchParams.set("cacheHint", "true");
  url.searchParams.set("f", "json");
  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Hartford ArcGIS ${res.status} offset=${offset}`);
  const body = (await readJson(res)) as { features?: HartfordFeature[]; error?: unknown };
  // Throw on the embedded ArcGIS error envelope (HTTP 200 + {error:{...}}) so a
  // token-gated/failed layer serves last-known-good instead of grading as zero-crime.
  if (body.error) throw new Error(`Hartford ArcGIS body error offset=${offset}`);
  return body.features ?? [];
}

async function fetchHartford(): Promise<Incident[]> {
  const sinceTs = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const results: HartfordFeature[][] = new Array(PAGES);
  let cursor = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= PAGES) return;
      results[i] = await fetchPage(i * PAGE_SIZE, sinceTs).catch(() => [] as HartfordFeature[]);
    }
  });
  await Promise.all(workers);
  const feats = results.flat();
  return feats
    .filter((f) => typeof f.attributes.Date === "number")
    .map((f, i) => {
      const a = f.attributes;
      // filter null-island / origin sentinels
      const lng = f.geometry && f.geometry.x !== 0 && f.geometry.y !== 0 ? f.geometry.x : undefined;
      const lat = f.geometry && f.geometry.x !== 0 && f.geometry.y !== 0 ? f.geometry.y : undefined;
      const nbhd = (lat != null && lng != null) ? geocodeHartford(lng, lat) : null;
      const area = nbhd ?? "Unknown";
      return {
        id: `htfd-${a.CaseNum ?? a.OBJECTID ?? i}`,
        area,
        occurredAt: occurredAtFor(a.Date, a.Time),
        nibrsCategory: classify(a.NibrsDesc),
        ibrOffenseDescription: titleCaseOffense(a.NibrsDesc ?? a.OffenseDesc ?? "Unknown"),
        beat: null,
        blockLabel: undefined,
        lat,
        lng,
      } as Incident;
    });
}

// In-flight fetch dedup: the dispatcher fans a per-area Promise.all over every
// neighbourhood, so a cold cache would otherwise fire N concurrent full fetches.
let inFlightFetch: Promise<Incident[]> | null = null;
export async function getRowsHartford(): Promise<Incident[]> {
  const now = Date.now();
  if (cache && cache.rows.length > 0 && now - cache.fetchedAt < CACHE_TTL_MS) return cache.rows;
  if (inFlightFetch) return inFlightFetch;
  inFlightFetch = (async () => {
    try {
      const rows = await fetchHartford();
      if (rows.length > 0) cache = { fetchedAt: now, rows };
      return rows;
    } catch (err) {
      console.warn("[hartford] fetch failed:", (err as Error).message);
      return cache?.rows ?? [];
    } finally {
      inFlightFetch = null;
    }
  })();
  return inFlightFetch;
}

export async function getDiscoveredAreasHartford(): Promise<KnownArea[]> {
  const rows = await getRowsHartford();
  const agg = new Map<string, { latSum: number; lngSum: number; count: number }>();
  for (const r of rows) {
    if (!r.area || NON_NEIGHBORHOOD.has(r.area)) continue;
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
      slug: slugifyNeighborhood(name),
      label: name,
      jurisdiction: "Hartford",
      centroid: { lat: e.latSum / e.count, lng: e.lngSum / e.count },
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function labelForSlug(slug: string, rows: Incident[]): string | null {
  const want = slug.toLowerCase();
  for (const r of rows) {
    if (slugifyNeighborhood(r.area) === want) return r.area;
  }
  return null;
}

export const hartfordAdapter: CrimeDataAdapter = {
  name: "hartford-arcgis",
  async getAreaStats(area: string): Promise<AreaStats | null> {
    const rows = await getRowsHartford();
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
    const rows = await getRowsHartford();
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
