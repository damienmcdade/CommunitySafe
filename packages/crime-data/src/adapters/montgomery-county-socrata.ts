import { CrimeCategory } from "../crime-category.js";
import type { AreaStats, CrimeDataAdapter, DataProvenance, Incident } from "../types.js";
import { cityLocalToUtcIso } from "../lib/city-time.js";
import { registerRowCache } from "../cache-registry.js";
import { riskLevelFromAreaCounts } from "../risk-bands.js";
import type { KnownArea } from "../neighborhoods.js";
import { fetchSocrata } from "../lib/http.js";
import { titleCaseOffense } from "../lib/titlecase-offense.js";
import { montgomeryPolygons } from "../data/montgomery-county-neighborhoods.js";

// Montgomery County, MD — Montgomery County Police "Crime" dataset (Socrata
// icn6-v9z3 on data.montgomerycountymd.gov). Keyless, ~495k all-time rows fresh
// to within ~1 day. Each row carries scalar latitude/longitude, a clean NIBRS
// top-level class in `crimename1` ("Crime Against Person/Property/Society" +
// "Crime Against Not a Crime"), and a `city` place tag (Silver Spring, Rockville,
// Bethesda, Gaithersburg, Germantown…).
//
// We place each incident in one of the county's recognizable constituent places
// by point-in-polygon over the Census TIGER place set (see
// data/montgomery-county-neighborhoods.ts), the same polygon set that powers
// apps/web/public/geo/montgomery-county.geojson. The feed's own `city` tag is the
// fallback for rows with no usable coordinate. `crimename1` maps directly to our
// PERSONS / PROPERTY / SOCIETY buckets; "Not a Crime" rows are dropped at ingest.
// Source: https://data.montgomerycountymd.gov/resource/icn6-v9z3.json

const BASE = "https://data.montgomerycountymd.gov/resource/icn6-v9z3.json";
const TZ = "America/New_York";
// Socrata $limit hard-caps at 50k/request. MoCo runs ~120-150 reportable
// incidents/day, so a 365-day window stays well under the cap while giving the
// safety-score a long, stable window (HIGH confidence) and the per-place quintile
// bands a stable distribution.
const ROW_LIMIT = 50_000;
const WINDOW_DAYS = 365;
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { fetchedAt: number; rows: Incident[] } | null = null;
registerRowCache(() => { cache = null; }, "montgomery-county-socrata");

interface MocoRow {
  incident_id?: string;
  start_date?: string;
  crimename1?: string;
  crimename2?: string;
  crimename3?: string;
  city?: string;
  place?: string;
  latitude?: string;
  longitude?: string;
  location?: { type: "Point"; coordinates: [number, number] };
}

// crimename1 is the NIBRS top-level category. Map it straight to our buckets.
// "Crime Against Not a Crime" (admin/non-criminal) is dropped at ingest.
function classify(row: MocoRow): CrimeCategory | null {
  const c1 = (row.crimename1 ?? "").toUpperCase();
  if (!c1 || c1.includes("NOT A CRIME")) return null;
  if (c1.includes("PERSON")) return CrimeCategory.PERSONS;
  if (c1.includes("PROPERTY")) return CrimeCategory.PROPERTY;
  if (c1.includes("SOCIETY")) return CrimeCategory.SOCIETY;
  return null;
}

// ---- Point-in-polygon over the named MoCo places ----------------------------
interface PolyIndex { name: string; bbox: [number, number, number, number]; cx: number; cy: number; rings: number[][][] }
const POLY_INDEX: PolyIndex[] = montgomeryPolygons.map((p) => {
  const rings: number[][][] = p.geometry.type === "Polygon"
    ? (p.geometry.coordinates as number[][][])
    : (p.geometry.coordinates as number[][][][]).flat();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { name: p.name, bbox: [minX, minY, maxX, maxY], cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, rings };
});
// Census places don't tile the whole county (rural/unincorporated gaps between
// CDPs). Snap an out-of-polygon point to the nearest place centroid within this
// cap so coverage stays high; beyond it, fall back to the feed's `city` tag.
const SNAP_CAP_KM = 4;
// Match the feed's ALL-CAPS `city` tag to a known place name.
const NAME_BY_NORM = new Map<string, string>(
  montgomeryPolygons.map((p) => [p.name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim(), p.name]),
);
function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function geocode(lng: number, lat: number): string | null {
  for (const p of POLY_INDEX) {
    const [minX, minY, maxX, maxY] = p.bbox;
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
    let parity = 0;
    for (const ring of p.rings) if (pointInRing(lng, lat, ring)) parity++;
    if (parity % 2 === 1) return p.name;
  }
  let best: string | null = null, bestD2 = Infinity;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (const p of POLY_INDEX) {
    const dx = (lng - p.cx) * cosLat, dy = lat - p.cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = p.name; }
  }
  const capDeg = SNAP_CAP_KM / 111;
  return bestD2 <= capDeg * capDeg ? best : null;
}
// Fallback when a row has no usable coordinate: trust the feed's `city` tag if it
// names a place we carry a polygon for.
function areaFromCityTag(city: string | undefined): string | null {
  if (!city) return null;
  const norm = city.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  return NAME_BY_NORM.get(norm) ?? null;
}

const PROVENANCE: DataProvenance = {
  source: "Montgomery County Police Department Crime (Montgomery County, MD Open Data, Socrata) · place boundaries © US Census Bureau TIGER/Line",
  datasetUrl: "https://data.montgomerycountymd.gov/Public-Safety/Crime/icn6-v9z3",
  recency: "Refreshed daily by Montgomery County Police (recent ~12-month window)",
  granularity: "neighborhood",
  disclaimer:
    "Incidents are reported by the Montgomery County Police Department and placed in one of the " +
    "county's recognizable constituent communities (Silver Spring, Rockville, Bethesda, " +
    "Gaithersburg, Germantown…) by their public coordinate, using US Census place boundaries. " +
    "Incidents outside every mapped place fall back to the report's own city tag; the small " +
    "remainder are bucketed as \"Unmapped\" but still count countywide. CommunitySafe does not track individuals.",
};

async function fetchMoco(): Promise<Incident[]> {
  const rows = await fetchSocrata<MocoRow>("Montgomery County PD", {
    url: BASE,
    select: "incident_id,start_date,crimename1,crimename2,crimename3,city,place,latitude,longitude,location",
    where: "latitude IS NOT NULL OR location IS NOT NULL",
    windowDays: WINDOW_DAYS,
    dateField: "start_date",
    order: "start_date DESC",
    limit: ROW_LIMIT,
  });
  const out: Incident[] = [];
  for (const r of rows) {
    const cat = classify(r);
    if (cat == null) continue;
    const occurredAt = cityLocalToUtcIso(r.start_date, TZ);
    if (+new Date(occurredAt) <= 0) continue;
    const coords = r.location?.coordinates;
    let lng = coords ? Number(coords[0]) : Number(r.longitude);
    let lat = coords ? Number(coords[1]) : Number(r.latitude);
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) { lat = NaN; lng = NaN; }
    const area = (!isNaN(lat) && !isNaN(lng))
      ? (geocode(lng, lat) ?? areaFromCityTag(r.city) ?? "Unmapped")
      : (areaFromCityTag(r.city) ?? "Unmapped");
    const offenseText = (r.crimename3 || r.crimename2 || r.crimename1 || "Unknown").trim();
    out.push({
      id: `moco-${r.incident_id ?? out.length}`,
      area,
      occurredAt,
      nibrsCategory: cat,
      ibrOffenseDescription: titleCaseOffense(offenseText),
      beat: null,
      blockLabel: r.place ?? undefined,
      lat: !isNaN(lat) ? lat : undefined,
      lng: !isNaN(lng) ? lng : undefined,
    });
  }
  return out;
}

let inFlightMocoFetch: Promise<Incident[]> | null = null;
export async function getRowsMontgomeryCounty(): Promise<Incident[]> {
  const now = Date.now();
  if (cache && cache.rows.length > 0 && now - cache.fetchedAt < CACHE_TTL_MS) return cache.rows;
  if (inFlightMocoFetch) return inFlightMocoFetch;
  inFlightMocoFetch = (async () => {
    try {
      const rows = await fetchMoco();
      if (rows.length > 0) cache = { fetchedAt: now, rows };
      return rows;
    } catch (err) {
      console.warn("[montgomery-county] fetch failed:", (err as Error).message);
      return cache?.rows ?? [];
    } finally {
      inFlightMocoFetch = null;
    }
  })();
  return inFlightMocoFetch;
}

export async function getDiscoveredAreasMontgomeryCounty(): Promise<KnownArea[]> {
  const rows = await getRowsMontgomeryCounty();
  const agg = new Map<string, { latSum: number; lngSum: number; count: number }>();
  for (const r of rows) {
    if (!r.area || r.area === "Unknown" || r.area === "Unmapped") continue;
    if (r.lat == null || r.lng == null) continue;
    const e = agg.get(r.area) ?? { latSum: 0, lngSum: 0, count: 0 };
    e.latSum += r.lat; e.lngSum += r.lng; e.count += 1;
    agg.set(r.area, e);
  }
  return Array.from(agg.entries())
    .filter(([, e]) => e.count >= 3)
    .map(([name, e]) => ({
      slug: `moco-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      label: name,
      jurisdiction: "Montgomery County",
      centroid: { lat: e.latSum / e.count, lng: e.lngSum / e.count },
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function labelForMocoSlug(slug: string, rows: Incident[]): string | null {
  const s = slug.toLowerCase();
  const want = s.startsWith("moco-") ? s.slice(5) : s;
  for (const r of rows) {
    const cand = r.area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (cand === want) return r.area;
  }
  return null;
}

export const montgomeryCountyAdapter: CrimeDataAdapter = {
  name: "montgomery-county-socrata",
  async getAreaStats(area: string): Promise<AreaStats | null> {
    const rows = await getRowsMontgomeryCounty();
    const label = labelForMocoSlug(area, rows);
    if (!label) return null;
    const inArea = rows.filter((r) => r.area === label);
    if (inArea.length === 0) return null;
    const riskLevel = riskLevelFromAreaCounts(rows, inArea.length, [60, 180, 400, 900]);
    return { area: label, crimeRate: null, violentCrimeRate: null, propertyCrimeRate: null, riskLevel, provenance: PROVENANCE };
  },
  async getIncidents(area, opts) {
    const rows = await getRowsMontgomeryCounty();
    const label = labelForMocoSlug(area, rows);
    if (!label) return [];
    let filtered = rows.filter((r) => r.area === label);
    if (opts?.since) filtered = filtered.filter((r) => new Date(r.occurredAt) >= opts.since!);
    filtered.sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));
    return filtered.slice(0, opts?.limit ?? 50);
  },
  async getRecentReports(area, opts) { return this.getIncidents(area, { limit: opts?.limit ?? 20 }); },
};
