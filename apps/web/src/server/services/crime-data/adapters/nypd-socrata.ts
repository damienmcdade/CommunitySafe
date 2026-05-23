import "server-only";
import { CrimeCategory } from "@prisma/client";
import type { AreaStats, CrimeDataAdapter, DataProvenance, Incident } from "../types";
import type { KnownArea } from "../neighborhoods";

// City of New York — NYPD Complaint Data Current (Year-To-Date).
// Socrata dataset 5uac-w243 on data.cityofnewyork.us. We use the YTD feed
// rather than the 2006-present historical feed (qgea-i56i) so users see
// fresh data; the historical feed is decades-large but updated yearly.
// Doc: https://dev.socrata.com/foundry/data.cityofnewyork.us/5uac-w243

const BASE = "https://data.cityofnewyork.us/resource/5uac-w243.json";
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { fetchedAt: number; rows: Incident[] } | null = null;

interface SodaRow {
  cmplnt_num?: string;
  cmplnt_fr_dt?: string;     // ISO date, time portion always 00:00:00.000
  cmplnt_fr_tm?: string;     // HH:MM:SS — concatenate with cmplnt_fr_dt
  boro_nm?: string;          // MANHATTAN | BRONX | BROOKLYN | QUEENS | STATEN ISLAND
  addr_pct_cd?: string;      // precinct number, 1..123 (gaps)
  ofns_desc?: string;
  pd_desc?: string;
  law_cat_cd?: string;       // FELONY | MISDEMEANOR | VIOLATION
  latitude?: string;
  longitude?: string;
}

// NYPD doesn't tag complaints with a NIBRS category. We infer from the
// offense description; the substring matches below cover the bulk of the
// distinct ofns_desc values that appear in the dataset.
const PERSONS_KEYWORDS = [
  "ASSAULT", "ROBBERY", "MURDER", "HOMICIDE", "SEX", "RAPE",
  "KIDNAPPING", "HARRASSMENT", "STRANGULATION", "MENACING",
  "OFFENSES AGAINST THE PERSON",
];
const PROPERTY_KEYWORDS = [
  "LARCENY", "BURGLARY", "THEFT", "STOLEN", "ARSON",
  "VEHICLE", "FRAUD", "FORGERY", "CRIMINAL MISCHIEF",
  "TRESPASS", "PROPERTY",
];
function mapToNibrs(row: SodaRow): CrimeCategory {
  const desc = (row.ofns_desc ?? "").toUpperCase();
  if (PERSONS_KEYWORDS.some((k) => desc.includes(k))) return CrimeCategory.PERSONS;
  if (PROPERTY_KEYWORDS.some((k) => desc.includes(k))) return CrimeCategory.PROPERTY;
  return CrimeCategory.SOCIETY;
}

const PROVENANCE: DataProvenance = {
  source: "NYPD Complaint Data Current Year-To-Date (NYC Open Data)",
  datasetUrl: "https://data.cityofnewyork.us/Public-Safety/NYPD-Complaint-Data-Current-Year-To-Date-/5uac-w243",
  recency: "Refreshed weekly by NYPD; current calendar year only",
  granularity: "neighborhood",
  disclaimer:
    "Incidents are reported by the New York City Police Department and " +
    "aggregated by NYPD precinct, then surfaced under each precinct's " +
    "primary-coverage neighborhood (per nyc.gov/site/nypd) — not live, " +
    "not street-level. TravelSafe does not track individuals and " +
    "intentionally ignores victim-demographic columns published by NYPD.",
};

function ordinal(n: number): string {
  const j = n % 10, k = n % 100;
  if (k >= 10 && k <= 20) return `${n}th`;
  return `${n}${j === 1 ? "st" : j === 2 ? "nd" : j === 3 ? "rd" : "th"}`;
}

// NYPD precinct → recognizable-neighborhood label. NYPD publishes the
// canonical precinct boundaries and primary-coverage neighborhoods at
// nyc.gov/site/nypd/bureaus/patrol/precincts-landing.page. Every
// precinct number that ships in NYPD complaint data is keyed here;
// any unmapped number falls back to "<ordinal> Precinct" so the
// adapter never drops rows.
const PRECINCT_TO_NEIGHBORHOOD: Record<number, string> = {
  // Manhattan (22 precincts)
  1:  "Tribeca / Financial District (Manhattan)",
  5:  "Chinatown / Little Italy (Manhattan)",
  6:  "West Village (Manhattan)",
  7:  "Lower East Side (Manhattan)",
  9:  "East Village (Manhattan)",
  10: "Chelsea (Manhattan)",
  13: "Flatiron / Gramercy (Manhattan)",
  14: "Midtown South / Hudson Yards (Manhattan)",
  17: "Murray Hill / Turtle Bay (Manhattan)",
  18: "Midtown North (Manhattan)",
  19: "Upper East Side (Manhattan)",
  20: "Upper West Side (Manhattan)",
  22: "Central Park (Manhattan)",
  23: "East Harlem South (Manhattan)",
  24: "Morningside Heights (Manhattan)",
  25: "East Harlem North (Manhattan)",
  26: "Hamilton Heights (Manhattan)",
  28: "Central Harlem South (Manhattan)",
  30: "West Harlem (Manhattan)",
  32: "Central Harlem North (Manhattan)",
  33: "Washington Heights South (Manhattan)",
  34: "Washington Heights North / Inwood (Manhattan)",
  // Bronx (12 precincts)
  40: "Mott Haven / Melrose (Bronx)",
  41: "Hunts Point / Longwood (Bronx)",
  42: "Morrisania (Bronx)",
  43: "Soundview / Castle Hill (Bronx)",
  44: "Highbridge / Concourse (Bronx)",
  45: "Throgs Neck / Pelham Bay (Bronx)",
  46: "Fordham (Bronx)",
  47: "Wakefield / Williamsbridge (Bronx)",
  48: "East Tremont / Belmont (Bronx)",
  49: "Pelham Parkway / Allerton (Bronx)",
  50: "Riverdale / Kingsbridge (Bronx)",
  52: "Bedford Park / Norwood (Bronx)",
  // Brooklyn (23 precincts)
  60: "Coney Island / Brighton Beach (Brooklyn)",
  61: "Sheepshead Bay (Brooklyn)",
  62: "Bensonhurst (Brooklyn)",
  63: "Marine Park / Mill Basin (Brooklyn)",
  66: "Borough Park (Brooklyn)",
  67: "East Flatbush (Brooklyn)",
  68: "Bay Ridge / Dyker Heights (Brooklyn)",
  69: "Canarsie (Brooklyn)",
  70: "Midwood / Flatbush (Brooklyn)",
  71: "Crown Heights South (Brooklyn)",
  72: "Sunset Park (Brooklyn)",
  73: "Brownsville (Brooklyn)",
  75: "East New York (Brooklyn)",
  76: "Cobble Hill / Red Hook (Brooklyn)",
  77: "Crown Heights North (Brooklyn)",
  78: "Park Slope (Brooklyn)",
  79: "Bedford-Stuyvesant West (Brooklyn)",
  81: "Bedford-Stuyvesant East (Brooklyn)",
  83: "Bushwick (Brooklyn)",
  84: "Brooklyn Heights / DUMBO / Downtown Brooklyn (Brooklyn)",
  88: "Fort Greene / Clinton Hill (Brooklyn)",
  90: "Williamsburg South (Brooklyn)",
  94: "Greenpoint / Williamsburg North (Brooklyn)",
  // Queens (16 precincts)
  100: "Rockaway (Queens)",
  101: "Far Rockaway / Edgemere (Queens)",
  102: "Richmond Hill / Woodhaven (Queens)",
  103: "Jamaica Center (Queens)",
  104: "Ridgewood / Glendale / Middle Village (Queens)",
  105: "Queens Village / Cambria Heights (Queens)",
  106: "Ozone Park (Queens)",
  107: "Fresh Meadows / Briarwood (Queens)",
  108: "Long Island City / Sunnyside / Woodside (Queens)",
  109: "Flushing / Whitestone (Queens)",
  110: "Elmhurst / Corona (Queens)",
  111: "Bayside / Auburndale (Queens)",
  112: "Forest Hills / Rego Park (Queens)",
  113: "South Jamaica / St. Albans (Queens)",
  114: "Astoria (Queens)",
  115: "Jackson Heights / East Elmhurst (Queens)",
  116: "Rosedale / Laurelton (Queens)",
  // Staten Island (4 precincts)
  120: "St. George / Stapleton (Staten Island)",
  121: "Mariners Harbor / Port Richmond (Staten Island)",
  122: "South Beach / New Dorp (Staten Island)",
  123: "Tottenville (Staten Island)",
};

/// Translate a raw NYPD precinct number into the recognizable
/// neighborhood label users expect. Unmapped numbers fall back to
/// "<ordinal> Precinct" so the adapter still ingests them; PSA
/// (Police Service Area) housing-bureau codes and transit-bureau
/// codes that NYPD occasionally writes into addr_pct_cd will land
/// in that fallback bucket rather than being dropped.
function precinctName(p: string | undefined): string | null {
  if (!p) return null;
  const n = Number(p);
  if (!Number.isFinite(n) || n <= 0) return null;
  return PRECINCT_TO_NEIGHBORHOOD[n] ?? `${ordinal(n)} Precinct`;
}

async function fetchNypd(): Promise<Incident[]> {
  const url = new URL(BASE);
  url.searchParams.set("$select", "cmplnt_num,cmplnt_fr_dt,cmplnt_fr_tm,boro_nm,addr_pct_cd,ofns_desc,pd_desc,law_cat_cd,latitude,longitude");
  url.searchParams.set("$order", "cmplnt_fr_dt DESC");
  url.searchParams.set("$limit", "50000");
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "TravelSafe/0.1 (https://github.com/damienmcdade/TravelSafe)" },
  });
  if (!res.ok) throw new Error(`NYPD SODA ${res.status} ${url}`);
  const rows = (await res.json()) as SodaRow[];
  // Drop rows with no parseable date BEFORE constructing Incidents. The
  // earlier `new Date(0).toISOString()` fallback survived row mapping
  // but was filtered out by the citywide aggregator's `t > 0` invariant,
  // collapsing windowDays → 0 → 0/100k → misleading "below national"
  // score. Same fix as Charlotte/DC/MPLS/KC/Cincinnati earlier.
  const out: Incident[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const datePart = (r.cmplnt_fr_dt ?? "").slice(0, 10); // YYYY-MM-DD
    if (!datePart) continue;
    const timePart = r.cmplnt_fr_tm ?? "00:00:00";
    const d = new Date(`${datePart}T${timePart}`);
    if (Number.isNaN(d.getTime()) || d.getTime() <= 0) continue;
    const lat = Number(r.latitude);
    const lon = Number(r.longitude);
    const area = precinctName(r.addr_pct_cd) ?? "Unknown";
    out.push({
      id: `ny-${r.cmplnt_num ?? i}`,
      area,
      occurredAt: d.toISOString(),
      nibrsCategory: mapToNibrs(r),
      ibrOffenseDescription: r.pd_desc?.trim() || r.ofns_desc?.trim() || "Unknown",
      beat: null,
      blockLabel: undefined,
      lat: !isNaN(lat) && lat !== 0 ? lat : undefined,
      lng: !isNaN(lon) && lon !== 0 ? lon : undefined,
    });
  }
  return out;
}

export async function getRowsNYC(): Promise<Incident[]> {
  const now = Date.now();
  if (cache && cache.rows.length > 0 && now - cache.fetchedAt < CACHE_TTL_MS) return cache.rows;
  try {
    const rows = await fetchNypd();
    if (rows.length > 0) cache = { fetchedAt: now, rows };
    return rows;
  } catch (err) {
    console.warn("[nypd] fetch failed:", (err as Error).message);
    return cache?.rows ?? [];
  }
}

export async function getDiscoveredAreasNYC(): Promise<KnownArea[]> {
  const rows = await getRowsNYC();
  const agg = new Map<string, { latSum: number; lngSum: number; count: number }>();
  for (const r of rows) {
    if (!r.area || r.area === "Unknown") continue;
    if (r.lat == null || r.lng == null) continue;
    const e = agg.get(r.area) ?? { latSum: 0, lngSum: 0, count: 0 };
    e.latSum += r.lat; e.lngSum += r.lng; e.count += 1;
    agg.set(r.area, e);
  }
  return Array.from(agg.entries())
    .filter(([, e]) => e.count >= 3)
    .map(([name, e]) => ({
      // Slug derived from the full label (neighborhood + borough),
      // including the "(Brooklyn)" / "(Queens)" suffix so two
      // similarly-named neighborhoods across boroughs (e.g.,
      // Washington Heights vs the imaginary collision) stay
      // unambiguous. Round-trip works because labelForNYCSlug() does
      // the same slugify().
      slug: `ny-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      label: name,
      jurisdiction: "New York City",
      centroid: { lat: e.latSum / e.count, lng: e.lngSum / e.count },
    }))
    // Alpha sort by neighborhood name. The old precinct-number sort
    // no longer applies — labels are now neighborhood names, so
    // alphabetical is the natural reading order in the picker wheel.
    .sort((a, b) => a.label.localeCompare(b.label));
}

function labelForNYCSlug(slug: string, rows: Incident[]): string | null {
  const s = slug.toLowerCase();
  const want = s.startsWith("ny-") ? s.slice(3) : s;
  for (const r of rows) {
    const candidate = r.area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (candidate === want) return r.area;
  }
  return null;
}

export const nypdAdapter: CrimeDataAdapter = {
  name: "nypd-socrata",

  async getAreaStats(area: string): Promise<AreaStats | null> {
    const rows = await getRowsNYC();
    const label = labelForNYCSlug(area, rows);
    if (!label) return null;
    const inArea = rows.filter((r) => r.area === label);
    if (inArea.length === 0) return null;
    const riskLevel: 1 | 2 | 3 | 4 | 5 = inArea.length > 2000 ? 5 : inArea.length > 1200 ? 4 : inArea.length > 600 ? 3 : inArea.length > 200 ? 2 : 1;
    return { area: label, crimeRate: null, violentCrimeRate: null, propertyCrimeRate: null, riskLevel, provenance: PROVENANCE };
  },

  async getIncidents(area: string, opts?: { limit?: number; since?: Date }) {
    const rows = await getRowsNYC();
    const label = labelForNYCSlug(area, rows);
    if (!label) return [];
    let filtered = rows.filter((r) => r.area === label);
    if (opts?.since) filtered = filtered.filter((r) => new Date(r.occurredAt) >= opts.since!);
    filtered.sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));
    return filtered.slice(0, opts?.limit ?? 50);
  },

  async getRecentReports(area: string, opts?: { limit?: number }) {
    return this.getIncidents(area, { limit: opts?.limit ?? 20 });
  },
};
