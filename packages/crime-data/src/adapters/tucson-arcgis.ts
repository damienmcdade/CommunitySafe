import { CrimeCategory } from "../crime-category.js";
import type { AreaStats, CrimeDataAdapter, DataProvenance, Incident } from "../types.js";
import { registerRowCache } from "../cache-registry.js";
import { riskLevelFromAreaCounts } from "../risk-bands.js";
import type { KnownArea } from "../neighborhoods.js";
import { USER_AGENT, readJson, fetchWithRetry } from "../lib/http.js";
import { titleCaseOffense } from "../lib/titlecase-offense.js";
import { cityLocalToUtcIso } from "../lib/city-time.js";
import { tucsonPolygons } from "../data/tucson-neighborhoods.js";

// Tucson, AZ — Tucson Police Department "TPD Incidents (Public)" layer on the
// City of Tucson ArcGIS Server (PublicMaps/OpenData_PublicSafety MapServer/24,
// TPD_INCIDENTS_PUBLIC). Incident-level rows with a statute description
// (`STATUTDESC`), an occurrence date (`DATE_OCCU`, epoch-ms at local midnight)
// and a real hour-of-day (`HOUR_OCCU`, "HHMM" string). We geocode each
// incident to one of 154 official Tucson neighborhood-association boundaries
// (NHA_CITY layer) via point-in-polygon.
//
// CRITICAL GOTCHA: the `X`/`Y` attribute columns are GARBAGE (null on every
// row sampled). Real coordinates only come from the row geometry — we request
// outSR=4326 and read geometry.x/y. Many rows also carry NULL geometry
// (suppressed/sensitive locations) — those are filtered out (they still count
// citywide via the "Unknown" bucket, just not browsable per-neighborhood).
//
// Tucson observes NO daylight saving (America/Phoenix is a fixed UTC-7), so the
// date/hour combine is offset-stable year-round.
// Source: https://gis.tucsonaz.gov/arcgis/rest/services/PublicMaps/OpenData_PublicSafety/MapServer/24

const BASE =
  "https://gis.tucsonaz.gov/arcgis/rest/services/PublicMaps/OpenData_PublicSafety/MapServer/24/query";
const TUCSON_TZ = "America/Phoenix"; // fixed UTC-7, no DST
const PAGE_SIZE = 2000; // = server maxRecordCount
const WINDOW_DAYS = 400; // a touch over a year so the 365d score window is fully covered
const PAGES = 6; // ~5.7k rows/400d observed → 6 pages (12k) has comfortable headroom
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { fetchedAt: number; rows: Incident[] } | null = null;
registerRowCache(() => {
  cache = null;
}, "tucson-arcgis");

interface TucsonFeature {
  attributes: {
    OBJECTID?: number;
    INCI_ID?: string;
    DATE_OCCU?: number; // epoch ms, occurrence calendar date at local midnight
    HOUR_OCCU?: string; // "HHMM" 24h, e.g. "0620"
    STATUTDESC?: string; // statute/offense description, e.g. "Burglary - Force"
    OFFENSE?: string;
    DIVISION?: string;
    WARD?: string;
  };
  geometry?: { x: number; y: number }; // x=lng, y=lat (WGS84 when outSR=4326)
}

// STATUTDESC → CommunitySafe bucket (Crimes Against Persons / Property /
// Society). Robbery is filed under Property by NIBRS but the FBI UCR counts it
// as a Part-1 VIOLENT offense, so force it to PERSONS (same convention as the
// Long Beach / Dallas / Saint Paul adapters).
function classify(statutDesc: string | undefined): CrimeCategory {
  const s = (statutDesc ?? "").toUpperCase();
  if (s.includes("ROBBERY")) return CrimeCategory.PERSONS;
  if (
    s.includes("ASSAULT") ||
    s.includes("HOMICIDE") ||
    s.includes("MURDER") ||
    s.includes("RAPE") ||
    s.includes("SEX") || // "Sex Offenses ...", "Sexual Assault ..."
    s.includes("KIDNAP")
  ) {
    return CrimeCategory.PERSONS;
  }
  if (
    s.includes("BURGLARY") ||
    s.includes("THEFT") ||
    s.includes("LARCENY") ||
    s.includes("VEHICLE") ||
    s.includes("AUTO") ||
    s.includes("ARSON") ||
    s.includes("VANDALISM") ||
    s.includes("FRAUD")
  ) {
    return CrimeCategory.PROPERTY;
  }
  return CrimeCategory.SOCIETY;
}

// Catch-all bucket for points outside every neighborhood polygon (county
// edges, washes, the rare NULL-geometry row). Counts citywide but is not a
// browsable neighborhood, so it's excluded from discovery.
const NON_NEIGHBORHOOD = new Set(["Unknown", ""]);

function slugifyNeighborhood(name: string): string {
  return `tuc-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

// Point-in-polygon geocoder over the 154 official Tucson neighborhoods.
// bbox-prefiltered ray casting — same self-contained pattern as the
// Long Beach / Indianapolis / Boston adapters. All ArcGIS rings of a feature
// are XOR-folded so interior holes are respected.
interface PolyIndex { name: string; bbox: [number, number, number, number]; rings: number[][][] }
const POLY_INDEX: PolyIndex[] = tucsonPolygons.map((p) => {
  const rings = p.geometry.coordinates;
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

// Distance (in degrees) from a point to a line segment — used by the
// boundary-seam snap below.
function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Tucson's 154 neighborhood-association boundaries do NOT tile the whole city,
// and the polygons are rounded to 5 decimals (~1m). An incident geocoded to a
// street centerline that runs along an NHA edge can land a few meters OUTSIDE
// the polygon. SNAP_TOLERANCE_DEG ≈ 50m recovers those genuine seam losses
// while leaving incidents that fall in real coverage gaps (commercial
// corridors, areas with no neighborhood association) as "Unknown" — they still
// count citywide but aren't attributed to an arbitrary nearest neighborhood.
const SNAP_TOLERANCE_DEG = 0.0005; // ~50m at Tucson's latitude

function geocodeTucson(lng: number, lat: number): string | null {
  let nearestName: string | null = null;
  let nearestDist = SNAP_TOLERANCE_DEG;
  for (const p of POLY_INDEX) {
    const [minX, minY, maxX, maxY] = p.bbox;
    // Exact containment (fast path).
    if (lng >= minX && lng <= maxX && lat >= minY && lat <= maxY) {
      let parity = 0;
      for (const ring of p.rings) if (pointInRing(lng, lat, ring)) parity++;
      if (parity % 2 === 1) return p.name;
    }
    // Boundary-seam snap: only consider polygons whose bbox is within the
    // tolerance, then measure true distance to the nearest edge.
    if (lng < minX - SNAP_TOLERANCE_DEG || lng > maxX + SNAP_TOLERANCE_DEG ||
        lat < minY - SNAP_TOLERANCE_DEG || lat > maxY + SNAP_TOLERANCE_DEG) continue;
    for (const ring of p.rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const d = distPointToSegment(lng, lat, ring[j][0], ring[j][1], ring[i][0], ring[i][1]);
        if (d < nearestDist) { nearestDist = d; nearestName = p.name; }
      }
    }
  }
  return nearestName;
}

const PROVENANCE: DataProvenance = {
  source: "Tucson Police Department (City of Tucson ArcGIS Open Data)",
  datasetUrl: "https://gisdata.tucsonaz.gov/",
  recency: "Refreshed regularly by the Tucson Police Department (rolling incident feed)",
  granularity: "neighborhood",
  disclaimer:
    "Incidents are reported by the Tucson Police Department and geocoded to one of " +
    "154 official Tucson neighborhood-association boundaries — not live, not street-level. " +
    "CommunitySafe does not track individuals.",
};

// DATE_OCCU is the occurrence calendar date at local midnight (epoch ms);
// HOUR_OCCU is a real "HHMM" wall-clock string. Extract Y-M-D in Tucson local
// time, attach the hour, then convert the wall-clock back to UTC.
function occurredAtFor(dateMs: number | undefined, hourStr: string | undefined): string {
  if (typeof dateMs !== "number") return cityLocalToUtcIso(null, TUCSON_TZ);
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TUCSON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dateMs));
  const raw = (hourStr ?? "").padStart(4, "0");
  let hh = Number(raw.slice(0, 2));
  let mm = Number(raw.slice(2, 4));
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) hh = 0;
  if (!Number.isFinite(mm) || mm < 0 || mm > 59) mm = 0;
  const h2 = String(hh).padStart(2, "0");
  const m2 = String(mm).padStart(2, "0");
  return cityLocalToUtcIso(`${ymd}T${h2}:${m2}:00`, TUCSON_TZ);
}

async function fetchPage(offset: number, sinceIso: string): Promise<TucsonFeature[]> {
  const url = new URL(BASE);
  url.searchParams.set("where", `DATE_OCCU >= DATE '${sinceIso}'`);
  url.searchParams.set("outFields", "OBJECTID,INCI_ID,DATE_OCCU,HOUR_OCCU,STATUTDESC,OFFENSE,DIVISION,WARD");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("orderByFields", "DATE_OCCU DESC");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(PAGE_SIZE));
  url.searchParams.set("cacheHint", "true");
  url.searchParams.set("f", "json");
  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Tucson ArcGIS ${res.status} offset=${offset}`);
  const body = (await readJson(res)) as { features?: TucsonFeature[]; error?: unknown };
  // Throw on the embedded ArcGIS error envelope (HTTP 200 + {error:{...}}) so a
  // token-gated/failed layer serves last-known-good instead of grading as zero-crime.
  if (body.error) throw new Error(`Tucson ArcGIS body error offset=${offset}`);
  return body.features ?? [];
}

async function fetchTucson(): Promise<Incident[]> {
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const results: TucsonFeature[][] = new Array(PAGES);
  let cursor = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= PAGES) return;
      results[i] = await fetchPage(i * PAGE_SIZE, sinceIso).catch(() => [] as TucsonFeature[]);
    }
  });
  await Promise.all(workers);
  const feats = results.flat();
  return feats
    .filter((f) => typeof f.attributes.DATE_OCCU === "number")
    .map((f, i) => {
      const a = f.attributes;
      // GOTCHA: trust ONLY the geometry — the X/Y attribute columns are null.
      // Filter NULL geometry and null-island (0,0).
      const gx = f.geometry?.x;
      const gy = f.geometry?.y;
      const valid = gx != null && gy != null && (gx !== 0 || gy !== 0);
      const lng = valid ? gx : undefined;
      const lat = valid ? gy : undefined;
      const nbhd = lat != null && lng != null ? geocodeTucson(lng, lat) : null;
      return {
        id: `tuc-${a.INCI_ID ?? a.OBJECTID ?? i}`,
        area: nbhd ?? "Unknown",
        occurredAt: occurredAtFor(a.DATE_OCCU, a.HOUR_OCCU),
        nibrsCategory: classify(a.STATUTDESC),
        ibrOffenseDescription: titleCaseOffense(a.STATUTDESC ?? "Unknown"),
        beat: a.DIVISION ?? null,
        blockLabel: undefined,
        lat,
        lng,
      } as Incident;
    });
}

// In-flight fetch dedup: the dispatcher fans a per-area Promise.all over every
// neighbourhood, so a cold cache would otherwise fire N concurrent full fetches.
let inFlightFetch: Promise<Incident[]> | null = null;
export async function getRowsTucson(): Promise<Incident[]> {
  const now = Date.now();
  if (cache && cache.rows.length > 0 && now - cache.fetchedAt < CACHE_TTL_MS) return cache.rows;
  if (inFlightFetch) return inFlightFetch;
  inFlightFetch = (async () => {
    try {
      const rows = await fetchTucson();
      if (rows.length > 0) cache = { fetchedAt: now, rows };
      return rows;
    } catch (err) {
      console.warn("[tucson] fetch failed:", (err as Error).message);
      return cache?.rows ?? [];
    } finally {
      inFlightFetch = null;
    }
  })();
  return inFlightFetch;
}

export async function getDiscoveredAreasTucson(): Promise<KnownArea[]> {
  const rows = await getRowsTucson();
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
      jurisdiction: "Tucson",
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

export const tucsonAdapter: CrimeDataAdapter = {
  name: "tucson-arcgis",
  async getAreaStats(area: string): Promise<AreaStats | null> {
    const rows = await getRowsTucson();
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
    const rows = await getRowsTucson();
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
