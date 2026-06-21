import { CrimeCategory } from "../crime-category.js";
import type { AreaStats, CrimeDataAdapter, DataProvenance, Incident } from "../types.js";
import { registerRowCache } from "../cache-registry.js";
import { riskLevelFromAreaCounts } from "../risk-bands.js";
import type { KnownArea } from "../neighborhoods.js";
import { USER_AGENT, readJson, fetchWithRetry } from "../lib/http.js";
import { titleCaseOffense } from "../lib/titlecase-offense.js";
import { cityLocalToUtcIso } from "../lib/city-time.js";

// Salt Lake City, UT — SLCPD "Public Crime At Intersections" hosted ArcGIS
// FeatureServer. Incident-level rows with intersection-snapped point geometry
// (privacy: coords are nudged to the nearest intersection, but block-level
// accurate), a coarse `crime_type` bucket (Violent | Property), a detailed
// `crime` offense (e.g. "Aggravated Assault - Family", "Robbery - Business"),
// the city's own community-council name in EVERY row (`com_council`), a
// local-midnight calendar date (`occur_dt`, epoch ms) and a separate
// hour-of-day (`occur_hr`). We take the area straight from `com_council` — no
// point-in-polygon needed (same in-feed-area pattern as the Dayton adapter).
// The `com_council` labels match the city's 48 community-council polygons
// (Community_Councils_No_Overlap_10_14_23 layer 4, field `ccname1`) verbatim,
// so the display geojson lights up without relabeling.
// Source: https://maps.slc.gov/server/rest/services/Hosted/PublicCrime_At_Intersections/FeatureServer/0

const BASE =
  "https://maps.slc.gov/server/rest/services/Hosted/PublicCrime_At_Intersections/FeatureServer/0/query";
const SLC_TZ = "America/Denver";
const PAGE_SIZE = 2000; // = server maxRecordCount
const WINDOW_DAYS = 400; // a touch over a year so the 365d score window is fully covered
// Feed is a rolling window of ~5k rows; 6 pages (12k) covers it with headroom
// as the window grows.
const PAGES = 6;
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { fetchedAt: number; rows: Incident[] } | null = null;
registerRowCache(() => {
  cache = null;
}, "salt-lake-city-arcgis");

interface SlcFeature {
  attributes: {
    objectid?: number;
    case_nbr?: string;
    occur_hr?: number; // hour of day 0-23
    crime_type?: string; // coarse bucket: "Violent" | "Property"
    crime?: string; // detailed offense, e.g. "Robbery - Business"
    district_nbr?: number;
    division?: string;
    com_council?: string; // SLC community-council name (matches ccname1 polygons)
    occur_dt?: number; // epoch ms, calendar date at local (Denver) midnight
  };
  geometry?: { x: number; y: number }; // x=lng, y=lat (WGS84 when outSR=4326)
}

// SLCPD offense → CommunitySafe bucket. We classify on the detailed `crime`
// field (it carries the specific offense keyword) and fall back to the coarse
// `crime_type` bucket. Robbery is filed by NIBRS under Property but the FBI UCR
// counts it as a Part-1 VIOLENT offense, so it is forced to PERSONS (same
// convention as the Long Beach / Dallas / Saint Paul adapters).
function classify(crime: string | undefined, crimeType: string | undefined): CrimeCategory {
  const c = (crime ?? "").toUpperCase();
  if (
    c.includes("ROBBERY") ||
    c.includes("ASSAULT") ||
    c.includes("HOMICIDE") ||
    c.includes("MURDER") ||
    c.includes("MANSLAUGHTER") ||
    c.includes("RAPE") ||
    c.includes("SEX") ||
    c.includes("KIDNAP")
  ) {
    return CrimeCategory.PERSONS;
  }
  if (
    c.includes("BURGLARY") ||
    c.includes("THEFT") ||
    c.includes("LARCENY") ||
    c.includes("VEHICLE") ||
    c.includes("AUTO") ||
    c.includes("ARSON") ||
    c.includes("VANDALISM") ||
    c.includes("FRAUD")
  ) {
    return CrimeCategory.PROPERTY;
  }
  // Fall back to the coarse SLCPD bucket when the detailed offense matched no
  // keyword (e.g. an unseen future offense label).
  const t = (crimeType ?? "").toUpperCase();
  if (t === "VIOLENT") return CrimeCategory.PERSONS;
  if (t === "PROPERTY") return CrimeCategory.PROPERTY;
  return CrimeCategory.SOCIETY;
}

// The `com_council` values are already published in proper display case and
// must match the polygon-layer `ccname1` labels verbatim for the map to color
// (incl. composite names like "Downtown Community/Downtown Alliance" and
// "Central 9th"), so we only trim and collapse internal whitespace — re-casing
// would corrupt e.g. "Central 9th" → "Central 9Th" and break the polygon match.
function normalizeArea(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

// Feed catch-all bucket for points with no community council — counts citywide
// but is not a browsable neighborhood, so it's excluded from discovery.
const NON_AREA = new Set(["Unknown", "Unincorporated", ""]);

function slugifyArea(name: string): string {
  return `slc-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

const PROVENANCE: DataProvenance = {
  source: "Salt Lake City Police Department (City of Salt Lake City ArcGIS)",
  datasetUrl: "https://www.slc.gov/police/crime-statistics/",
  recency: "Refreshed by the Salt Lake City Police Department (rolling incident feed)",
  granularity: "neighborhood",
  disclaimer:
    "Incidents are reported by the Salt Lake City Police Department and grouped by the " +
    "city's community councils; map points are snapped to the nearest intersection for " +
    "privacy — not live, not exact-address. CommunitySafe does not track individuals.",
};

function occurredAtFor(occurDtMs: number | undefined, hour: number | undefined): string {
  if (typeof occurDtMs !== "number") return cityLocalToUtcIso(null, SLC_TZ);
  // occur_dt is the calendar date at local midnight; extract Y-M-D in SLC local
  // time, attach occur_hr, then convert the wall-clock back to UTC.
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: SLC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(occurDtMs));
  const hh = String(Math.min(23, Math.max(0, hour ?? 0))).padStart(2, "0");
  return cityLocalToUtcIso(`${ymd}T${hh}:00:00`, SLC_TZ);
}

async function fetchPage(offset: number, sinceTs: string): Promise<SlcFeature[]> {
  const url = new URL(BASE);
  url.searchParams.set("where", `occur_dt >= timestamp '${sinceTs}'`);
  url.searchParams.set(
    "outFields",
    "objectid,case_nbr,occur_hr,crime_type,crime,district_nbr,division,com_council,occur_dt",
  );
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("orderByFields", "occur_dt DESC");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(PAGE_SIZE));
  url.searchParams.set("cacheHint", "true");
  url.searchParams.set("f", "json");
  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Salt Lake City ArcGIS ${res.status} offset=${offset}`);
  const body = (await readJson(res)) as { features?: SlcFeature[]; error?: unknown };
  // Throw on the embedded ArcGIS error envelope (HTTP 200 + {error:{...}}) so a
  // token-gated/failed layer serves last-known-good instead of grading as zero-crime.
  if (body.error) throw new Error(`Salt Lake City ArcGIS body error offset=${offset}`);
  return body.features ?? [];
}

async function fetchSaltLakeCity(): Promise<Incident[]> {
  const sinceTs = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const results: SlcFeature[][] = new Array(PAGES);
  let cursor = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= PAGES) return;
      results[i] = await fetchPage(i * PAGE_SIZE, sinceTs).catch(() => [] as SlcFeature[]);
    }
  });
  await Promise.all(workers);
  const feats = results.flat();
  return feats
    .filter((f) => typeof f.attributes.occur_dt === "number" && (f.attributes.com_council ?? "").trim())
    .map((f, i) => {
      const a = f.attributes;
      const lng = f.geometry && f.geometry.x !== 0 ? f.geometry.x : undefined;
      const lat = f.geometry && f.geometry.y !== 0 ? f.geometry.y : undefined;
      return {
        id: `slc-${a.objectid ?? i}`,
        area: normalizeArea((a.com_council ?? "").trim()),
        occurredAt: occurredAtFor(a.occur_dt, a.occur_hr),
        nibrsCategory: classify(a.crime, a.crime_type),
        ibrOffenseDescription: titleCaseOffense(a.crime ?? a.crime_type ?? "Unknown"),
        beat: a.division ?? null,
        blockLabel: undefined,
        lat,
        lng,
      } as Incident;
    });
}

// In-flight fetch dedup: the dispatcher fans a per-area Promise.all over every
// neighbourhood, so a cold cache would otherwise fire N concurrent full fetches.
let inFlightFetch: Promise<Incident[]> | null = null;
export async function getRowsSaltLakeCity(): Promise<Incident[]> {
  const now = Date.now();
  if (cache && cache.rows.length > 0 && now - cache.fetchedAt < CACHE_TTL_MS) return cache.rows;
  if (inFlightFetch) return inFlightFetch;
  inFlightFetch = (async () => {
    try {
      const rows = await fetchSaltLakeCity();
      if (rows.length > 0) cache = { fetchedAt: now, rows };
      return rows;
    } catch (err) {
      console.warn("[salt-lake-city] fetch failed:", (err as Error).message);
      return cache?.rows ?? [];
    } finally {
      inFlightFetch = null;
    }
  })();
  return inFlightFetch;
}

export async function getDiscoveredAreasSaltLakeCity(): Promise<KnownArea[]> {
  const rows = await getRowsSaltLakeCity();
  const agg = new Map<string, { latSum: number; lngSum: number; count: number }>();
  for (const r of rows) {
    if (!r.area || NON_AREA.has(r.area)) continue;
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
      slug: slugifyArea(name),
      label: name,
      jurisdiction: "Salt Lake City",
      centroid: { lat: e.latSum / e.count, lng: e.lngSum / e.count },
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function labelForSlug(slug: string, rows: Incident[]): string | null {
  const want = slug.toLowerCase();
  for (const r of rows) {
    if (slugifyArea(r.area) === want) return r.area;
  }
  return null;
}

export const saltLakeCityAdapter: CrimeDataAdapter = {
  name: "salt-lake-city-arcgis",
  async getAreaStats(area: string): Promise<AreaStats | null> {
    const rows = await getRowsSaltLakeCity();
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
    const rows = await getRowsSaltLakeCity();
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
