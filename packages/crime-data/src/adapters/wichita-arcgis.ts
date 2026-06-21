import { CrimeCategory } from "../crime-category.js";
import type { AreaStats, CrimeDataAdapter, DataProvenance, Incident } from "../types.js";
import { registerRowCache } from "../cache-registry.js";
import { riskLevelFromAreaCounts } from "../risk-bands.js";
import type { KnownArea } from "../neighborhoods.js";
import { USER_AGENT, readJson, fetchWithRetry } from "../lib/http.js";
import { titleCaseOffense } from "../lib/titlecase-offense.js";
import { wichitaPolygons } from "../data/wichita-neighborhoods.js";

// Wichita, KS — Wichita Police Department "Wichita Crimes 90 Days" ArcGIS
// MapServer. Incident-level rows on a rolling ~90-day window (~29k rows) with
// explicit LATITUDE/LONGITUDE attribute columns (WGS84) and a free-text
// offense (`OFFENSE_DE`) plus a coarser `CATEGORY` bucket (e.g. AGG_ASSAULT,
// LARCENY, ROBBERY, RESBURG). `STARTDATETIME` is an epoch-ms timestamp. We
// geocode each incident to one of 76 official Wichita neighborhood
// associations via point-in-polygon ("Unknown" for the point outside every
// polygon — counted citywide but excluded from neighborhood discovery). The
// feed's own numbered BEAT field is ignored.
// Source: https://gismaps.wichita.gov/ageweb/rest/services/OpenData/Crime/MapServer/0

const BASE =
  "https://gismaps.wichita.gov/ageweb/rest/services/OpenData/Crime/MapServer/0/query";
const PAGE_SIZE = 2000; // = server maxRecordCount
// Feed is a rolling ~90-day window of ~29k rows; 20 pages (40k) covers it
// fully with headroom as the window grows.
const PAGES = 20;
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { fetchedAt: number; rows: Incident[] } | null = null;
registerRowCache(() => {
  cache = null;
}, "wichita-arcgis");

interface WichitaFeature {
  attributes: {
    OBJECTID?: number;
    INCREPORT?: string;
    OFFENSE_DE?: string; // free-text offense, e.g. "AGGRAVATED ASSAULT"
    CATEGORY?: string; // coarse bucket, e.g. "AGG_ASSAULT" | "LARCENY" | "ROBBERY"
    CLASS_TYPE?: string;
    LATITUDE?: number;
    LONGITUDE?: number;
    STARTDATETIME?: number; // epoch ms
    BEAT?: string;
  };
}

// CATEGORY / OFFENSE_DE → CommunitySafe bucket (Crimes Against Persons /
// Property / Society). Robbery is filed under property in many schemes but the
// FBI UCR counts it as a Part-1 VIOLENT offense, so force it to PERSONS (same
// convention as the Long Beach / Dallas / Saint Paul adapters). We scan both
// the coded CATEGORY and the free-text OFFENSE_DE so e.g. "BATTERY ABW" or
// "CRIMINAL DISCHARGE OF FIREARM" lands in PERSONS even when CATEGORY is coarse.
function classify(category: string | undefined, offense: string | undefined): CrimeCategory {
  const cat = (category ?? "").toUpperCase();
  const off = (offense ?? "").toUpperCase();
  const blob = `${cat} ${off}`;

  if (cat.includes("ROBBERY") || off.includes("ROBBERY")) return CrimeCategory.PERSONS;

  // Crimes Against Persons.
  if (
    cat === "AGG_ASSAULT" ||
    cat === "SIM_ASSAULT" ||
    cat === "SEX_OFFENSE" ||
    cat === "SEX_OFFENSES1" ||
    cat === "SEX_OFFENSES2" ||
    cat === "RAPE" ||
    cat === "FAMILY" ||
    cat === "DRIVEBY" ||
    /\b(ASSAULT|BATTERY|HOMICIDE|MURDER|MANSLAUGHTER|KIDNAP|ABDUCT|RAPE|SODOMY|SEX OFFENSE|SEXUAL|HUMAN TRAFFICK|INTIMIDATION|STRANGULATION|DISCHARGE OF FIREARM|SHOOTING|STABBING)\b/.test(
      blob,
    )
  ) {
    return CrimeCategory.PERSONS;
  }

  // Crimes Against Property.
  if (
    cat === "LARCENY" ||
    cat === "AUTOTHEFT" ||
    cat === "RESBURG" ||
    cat === "NRESBURG" ||
    cat === "VANDALISM" ||
    cat === "FRAUD" ||
    cat === "FORGERY" ||
    cat === "EMBEZZLEMENT" ||
    cat === "ARSON" ||
    cat === "STOLEN_PROP" ||
    /\b(LARCENY|THEFT|BURGLARY|SHOPLIFT|STOLEN|AUTO THEFT|MOTOR VEHICLE THEFT|DESTRUCT|VANDALISM|DESTRUCTION OF PROP|ARSON|FRAUD|FORGERY|COUNTERFEIT|EMBEZZL|EXTORTION|FINANCIAL CARD)\b/.test(
      blob,
    )
  ) {
    return CrimeCategory.PROPERTY;
  }

  // Everything else (drugs, traffic, misc, mental-health, disorderly, weapons
  // possession, liquor, DUI, welfare checks) → Society.
  return CrimeCategory.SOCIETY;
}

// Title-case the all-caps neighborhood-association names so they match the
// polygon labels in wichita-neighborhoods.ts (which are already title-cased).
function titleCaseArea(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Of|And|The)\b/g, (w) => w.toLowerCase())
    .trim();
}

// Point-in-polygon geocoder over the 76 official Wichita neighborhood
// associations. bbox-prefiltered ray casting — same self-contained pattern as
// the Long Beach / Indianapolis / Boston adapters.
interface PolyIndex { name: string; bbox: [number, number, number, number]; rings: number[][][] }
const POLY_INDEX: PolyIndex[] = wichitaPolygons.map((p) => {
  const rings: number[][][] = p.geometry.type === "Polygon"
    ? (p.geometry.coordinates as number[][][])
    : (p.geometry.coordinates as number[][][][]).flat();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { name: titleCaseArea(p.name), bbox: [minX, minY, maxX, maxY], rings };
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
function geocodeWichita(lng: number, lat: number): string | null {
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
  source: "Wichita Police Department (City of Wichita ArcGIS Open Data)",
  datasetUrl: "https://gismaps.wichita.gov/",
  recency: "Refreshed daily by the Wichita Police Department (rolling ~90-day incident feed)",
  granularity: "neighborhood",
  disclaimer:
    "Incidents are reported by the Wichita Police Department and geocoded to one of " +
    "76 official Wichita neighborhood associations (\"Unknown\" for the rare point outside " +
    "every polygon) — not live, not street-level. CommunitySafe does not track individuals.",
};

async function fetchPage(offset: number): Promise<WichitaFeature[]> {
  const url = new URL(BASE);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "OBJECTID,INCREPORT,OFFENSE_DE,CATEGORY,CLASS_TYPE,LATITUDE,LONGITUDE,STARTDATETIME,BEAT");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("orderByFields", "STARTDATETIME DESC");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(PAGE_SIZE));
  url.searchParams.set("cacheHint", "true");
  url.searchParams.set("f", "json");
  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Wichita ArcGIS ${res.status} offset=${offset}`);
  const body = (await readJson(res)) as { features?: WichitaFeature[]; error?: unknown };
  // Throw on the embedded ArcGIS error envelope (HTTP 200 + {error:{...}}) so a
  // token-gated/failed layer serves last-known-good instead of grading as zero-crime.
  if (body.error) throw new Error(`Wichita ArcGIS body error offset=${offset}`);
  return body.features ?? [];
}

function validCoord(lat: number | undefined, lng: number | undefined): boolean {
  // Filter null-island and obviously-out-of-region coords. Wichita sits at
  // ~37.6,-97.3, so a tight sanity box around south-central Kansas is fine.
  return (
    typeof lat === "number" && typeof lng === "number" &&
    lat !== 0 && lng !== 0 &&
    lat > 37.0 && lat < 38.2 && lng > -98.0 && lng < -96.8
  );
}

async function fetchWichita(): Promise<Incident[]> {
  const results: WichitaFeature[][] = new Array(PAGES);
  let cursor = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= PAGES) return;
      results[i] = await fetchPage(i * PAGE_SIZE).catch(() => [] as WichitaFeature[]);
    }
  });
  await Promise.all(workers);
  const feats = results.flat();
  return feats
    .filter((f) => typeof f.attributes.STARTDATETIME === "number")
    .map((f, i) => {
      const a = f.attributes;
      const ok = validCoord(a.LATITUDE, a.LONGITUDE);
      const lat = ok ? a.LATITUDE : undefined;
      const lng = ok ? a.LONGITUDE : undefined;
      const nbhd = lat != null && lng != null ? geocodeWichita(lng, lat) : null;
      return {
        id: `ict-${a.INCREPORT ?? a.OBJECTID ?? i}`,
        area: nbhd ?? "Unknown",
        occurredAt: new Date(a.STARTDATETIME!).toISOString(),
        nibrsCategory: classify(a.CATEGORY, a.OFFENSE_DE),
        ibrOffenseDescription: titleCaseOffense(a.OFFENSE_DE ?? a.CATEGORY ?? "Unknown"),
        beat: a.BEAT ?? null,
        blockLabel: undefined,
        lat,
        lng,
      } as Incident;
    });
}

// In-flight fetch dedup: the dispatcher fans a per-area Promise.all over every
// neighbourhood, so a cold cache would otherwise fire N concurrent full fetches.
let inFlightFetch: Promise<Incident[]> | null = null;
export async function getRowsWichita(): Promise<Incident[]> {
  const now = Date.now();
  if (cache && cache.rows.length > 0 && now - cache.fetchedAt < CACHE_TTL_MS) return cache.rows;
  if (inFlightFetch) return inFlightFetch;
  inFlightFetch = (async () => {
    try {
      const rows = await fetchWichita();
      if (rows.length > 0) cache = { fetchedAt: now, rows };
      return rows;
    } catch (err) {
      console.warn("[wichita] fetch failed:", (err as Error).message);
      return cache?.rows ?? [];
    } finally {
      inFlightFetch = null;
    }
  })();
  return inFlightFetch;
}

function slugify(name: string): string {
  return `ict-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export async function getDiscoveredAreasWichita(): Promise<KnownArea[]> {
  const rows = await getRowsWichita();
  const agg = new Map<string, { latSum: number; lngSum: number; count: number }>();
  for (const r of rows) {
    if (!r.area || r.area === "Unknown") continue;
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
      slug: slugify(name),
      label: name,
      jurisdiction: "Wichita",
      centroid: { lat: e.latSum / e.count, lng: e.lngSum / e.count },
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function labelForSlug(slug: string, rows: Incident[]): string | null {
  const want = slug.toLowerCase();
  for (const r of rows) {
    if (slugify(r.area) === want) return r.area;
  }
  return null;
}

export const wichitaAdapter: CrimeDataAdapter = {
  name: "wichita-arcgis",
  async getAreaStats(area: string): Promise<AreaStats | null> {
    const rows = await getRowsWichita();
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
    const rows = await getRowsWichita();
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
