import { CrimeCategory } from "../crime-category.js";
import type { AreaStats, CrimeDataAdapter, DataProvenance, Incident } from "../types.js";
import { registerRowCache } from "../cache-registry.js";
import { riskLevelFromAreaCounts } from "../risk-bands.js";
import type { KnownArea } from "../neighborhoods.js";
import { USER_AGENT, readJson, fetchWithRetry } from "../lib/http.js";
import { titleCaseOffense } from "../lib/titlecase-offense.js";
import { cityLocalToUtcIso } from "../lib/city-time.js";

// Rochester, NY — Rochester Police Department "RPD Part I Crime - 2011 to
// Present" ArcGIS FeatureServer. Incident-level UCR Part I rows with point
// geometry (native wkid 2262 NY State Plane — we request outSR=4326 so the
// FeatureServer reprojects geometry.x/y to WGS84 lng/lat). Each row carries an
// integer UCR Part I crime category (`Statute_CrimeCategory`: 1=Murder,
// 2=Rape, 3=Robbery, 4=Aggravated Assault, 5=Burglary, 6=Larceny, 7=Motor
// Vehicle Theft, 8=Arson), a free-text offense (`Statute_Description`), and the
// RPD patrol section (`Patrol_Section`: Clinton/Genesee/Goodman/Lake — a real
// geographic area). The occurrence timestamp (`OccurredFrom_Timestamp`) is
// epoch-ms with a real hour-of-day, so we take it straight as UTC. We take the
// section straight from the feed — no point-in-polygon needed.
// Source: https://maps.cityofrochester.gov/arcgis/rest/services/RPD/RPD_Part_I_Crime/FeatureServer/3

const BASE =
  "https://maps.cityofrochester.gov/arcgis/rest/services/RPD/RPD_Part_I_Crime/FeatureServer/3/query";
const ROCHESTER_TZ = "America/New_York";
const PAGE_SIZE = 2000; // server maxRecordCount is 100000 but we page conservatively
const WINDOW_DAYS = 400; // a touch over a year so the 365d score window is fully covered
const PAGES = 8; // ~7.4k rows/400d observed → 8 pages (16k) has comfortable headroom
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { fetchedAt: number; rows: Incident[] } | null = null;
registerRowCache(() => {
  cache = null;
}, "rochester-arcgis");

interface RochesterFeature {
  attributes: {
    OBJECTID?: number;
    OccurredFrom_Timestamp?: number; // epoch ms, with a real hour-of-day
    OccurredFrom_Time?: string; // "HHMM" local fallback when timestamp is absent
    OccurredFrom_Date_Year?: number;
    OccurredFrom_Date_Month?: number;
    Statute_CrimeCategory?: number; // UCR Part I code 1-8
    Statute_Description?: string; // free-text offense
    Patrol_Section?: string; // RPD patrol section, e.g. "Goodman"
    Patrol_Beat?: string;
  };
  geometry?: { x: number; y: number }; // x=lng, y=lat (WGS84 when outSR=4326)
}

// UCR Part I integer category → CommunitySafe bucket. These are already serious
// (Part I) crimes. Crimes Against Persons / Property / Society. Robbery (code 3)
// is a Part-1 VIOLENT offense in the FBI UCR, so it lands in PERSONS along with
// murder/rape/aggravated-assault (same robbery→PERSONS convention as the Long
// Beach / Dallas / Saint Paul adapters). Burglary/larceny/MV-theft/arson →
// PROPERTY. We map by the integer code, falling back to the free-text offense
// description for the rare row with a missing/out-of-range code.
function classify(code: number | undefined, description: string | undefined): CrimeCategory {
  switch (code) {
    case 1: // Murder / non-negligent manslaughter
    case 2: // Rape
    case 3: // Robbery (UCR Part-1 violent)
    case 4: // Aggravated assault
      return CrimeCategory.PERSONS;
    case 5: // Burglary
    case 6: // Larceny-theft
    case 7: // Motor vehicle theft
    case 8: // Arson
      return CrimeCategory.PROPERTY;
    default:
      break;
  }
  const d = (description ?? "").toUpperCase();
  if (d.includes("ROBBERY") || d.includes("ROB ")) return CrimeCategory.PERSONS;
  if (
    d.includes("MURDER") ||
    d.includes("HOMICIDE") ||
    d.includes("MANSLAUGHTER") ||
    d.includes("RAPE") ||
    d.includes("ASSAULT") ||
    d.includes("ASLT") ||
    d.includes("MENACING") ||
    d.includes("STRANGULATION")
  ) {
    return CrimeCategory.PERSONS;
  }
  if (
    d.includes("BURGLARY") ||
    d.includes("LARCENY") ||
    d.includes("LAR ") ||
    d.includes("THEFT") ||
    d.includes("STOLEN") ||
    d.includes("ARSON") ||
    d.includes("VEHICLE")
  ) {
    return CrimeCategory.PROPERTY;
  }
  return CrimeCategory.SOCIETY;
}

// Title-case to match the City of Rochester's official "City_Sections" polygon
// names (the rochester.geojson `name`s). The feed already supplies them title-
// cased (Clinton/Genesee/Goodman/Lake) but we normalize defensively, preserving
// Mc/Mac and O' prefixes.
function titleCaseSection(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bMc(\w)/g, (_, c) => "Mc" + c.toUpperCase())
    .replace(/\bMac([a-z])/g, (_, c) => "Mac" + c.toUpperCase())
    .replace(/\bO'(\w)/g, (_, c) => "O'" + c.toUpperCase())
    .replace(/\b(Of|And|The)\b/g, (w) => w.toLowerCase())
    .trim();
}

// Feed catch-all bucket for unassigned points ("***") — still counts citywide
// but is not a browsable section, so it's excluded from discovery.
const NON_SECTION = new Set(["", "***", "Unknown"]);

function slugifySection(name: string): string {
  return `roc-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

const PROVENANCE: DataProvenance = {
  source: "Rochester Police Department (City of Rochester ArcGIS Open Data)",
  datasetUrl: "https://data.cityofrochester.gov/",
  recency: "Refreshed daily by the Rochester Police Department (rolling UCR Part I incident feed)",
  granularity: "neighborhood",
  disclaimer:
    "Incidents are reported by the Rochester Police Department and grouped by the city's " +
    "own patrol sections — not live, not street-level. CommunitySafe does not track individuals.",
};

// OccurredFrom_Timestamp is epoch-ms carrying the real hour-of-day, so we take
// it straight as UTC. For the rare row missing the timestamp we fall back to
// the local Y-M (OccurredFrom_Date_Year/Month) + "HHMM" wall-clock time
// converted back to UTC via the America/New_York rule.
function occurredAtFor(a: RochesterFeature["attributes"]): string {
  if (typeof a.OccurredFrom_Timestamp === "number") {
    return new Date(a.OccurredFrom_Timestamp).toISOString();
  }
  const y = a.OccurredFrom_Date_Year;
  const m = a.OccurredFrom_Date_Month;
  if (typeof y === "number" && typeof m === "number") {
    const hhmm = (a.OccurredFrom_Time ?? "0000").padStart(4, "0");
    const hh = hhmm.slice(0, 2);
    const mm = hhmm.slice(2, 4);
    return cityLocalToUtcIso(`${y}-${String(m).padStart(2, "0")}-01T${hh}:${mm}:00`, ROCHESTER_TZ);
  }
  return cityLocalToUtcIso(null, ROCHESTER_TZ);
}

async function fetchPage(offset: number, sinceTs: string): Promise<RochesterFeature[]> {
  const url = new URL(BASE);
  url.searchParams.set("where", `OccurredFrom_Timestamp >= timestamp '${sinceTs}'`);
  url.searchParams.set(
    "outFields",
    "OBJECTID,OccurredFrom_Timestamp,OccurredFrom_Time,OccurredFrom_Date_Year,OccurredFrom_Date_Month,Statute_CrimeCategory,Statute_Description,Patrol_Section,Patrol_Beat",
  );
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("orderByFields", "OccurredFrom_Timestamp DESC");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(PAGE_SIZE));
  url.searchParams.set("cacheHint", "true");
  url.searchParams.set("f", "json");
  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Rochester ArcGIS ${res.status} offset=${offset}`);
  const body = (await readJson(res)) as { features?: RochesterFeature[]; error?: unknown };
  // Throw on the embedded ArcGIS error envelope (HTTP 200 + {error:{...}}) so a
  // token-gated/failed layer serves last-known-good instead of grading as zero-crime.
  if (body.error) throw new Error(`Rochester ArcGIS body error offset=${offset}`);
  return body.features ?? [];
}

async function fetchRochester(): Promise<Incident[]> {
  const sinceTs = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const results: RochesterFeature[][] = new Array(PAGES);
  let cursor = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= PAGES) return;
      results[i] = await fetchPage(i * PAGE_SIZE, sinceTs).catch(() => [] as RochesterFeature[]);
    }
  });
  await Promise.all(workers);
  const feats = results.flat();
  return feats
    .filter((f) => (f.attributes.Patrol_Section ?? "").trim() && !NON_SECTION.has((f.attributes.Patrol_Section ?? "").trim()))
    .map((f, i) => {
      const a = f.attributes;
      const lng = f.geometry && f.geometry.x !== 0 ? f.geometry.x : undefined;
      const lat = f.geometry && f.geometry.y !== 0 ? f.geometry.y : undefined;
      return {
        id: `roc-${a.OBJECTID ?? i}`,
        area: titleCaseSection((a.Patrol_Section ?? "").trim()),
        occurredAt: occurredAtFor(a),
        nibrsCategory: classify(a.Statute_CrimeCategory, a.Statute_Description),
        ibrOffenseDescription: titleCaseOffense((a.Statute_Description ?? "Unknown").trim()),
        beat: a.Patrol_Beat ?? null,
        blockLabel: undefined,
        lat,
        lng,
      } as Incident;
    });
}

// In-flight fetch dedup: the dispatcher fans a per-area Promise.all over every
// section, so a cold cache would otherwise fire N concurrent full fetches.
let inFlightFetch: Promise<Incident[]> | null = null;
export async function getRowsRochester(): Promise<Incident[]> {
  const now = Date.now();
  if (cache && cache.rows.length > 0 && now - cache.fetchedAt < CACHE_TTL_MS) return cache.rows;
  if (inFlightFetch) return inFlightFetch;
  inFlightFetch = (async () => {
    try {
      const rows = await fetchRochester();
      if (rows.length > 0) cache = { fetchedAt: now, rows };
      return rows;
    } catch (err) {
      console.warn("[rochester] fetch failed:", (err as Error).message);
      return cache?.rows ?? [];
    } finally {
      inFlightFetch = null;
    }
  })();
  return inFlightFetch;
}

export async function getDiscoveredAreasRochester(): Promise<KnownArea[]> {
  const rows = await getRowsRochester();
  const agg = new Map<string, { latSum: number; lngSum: number; count: number }>();
  for (const r of rows) {
    if (!r.area || NON_SECTION.has(r.area)) continue;
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
      slug: slugifySection(name),
      label: name,
      jurisdiction: "Rochester",
      centroid: { lat: e.latSum / e.count, lng: e.lngSum / e.count },
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function labelForSlug(slug: string, rows: Incident[]): string | null {
  const want = slug.toLowerCase();
  for (const r of rows) {
    if (slugifySection(r.area) === want) return r.area;
  }
  return null;
}

export const rochesterAdapter: CrimeDataAdapter = {
  name: "rochester-arcgis",
  async getAreaStats(area: string): Promise<AreaStats | null> {
    const rows = await getRowsRochester();
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
    const rows = await getRowsRochester();
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
