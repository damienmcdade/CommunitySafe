import { CrimeCategory } from "@prisma/client";
import type { AreaStats, CrimeDataAdapter, DataProvenance, Incident } from "../types.js";
import type { KnownArea } from "../neighborhoods.js";
import { socrataHeaders } from "../lib/http.js";
import { titleCaseOffense } from "../lib/titlecase-offense.js";

// Honolulu — Honolulu Police Department incidents published on
// data.honolulu.gov (Socrata dataset vg88-5rn5). The feed publishes
// blockaddress + offense type but does NOT publish per-incident
// lat/lng OR neighborhood. For the MVP we route every row to a
// single citywide bucket "Honolulu". A future iteration can split
// by neighborhood once we either (a) reverse-geocode blockaddress
// to a Honolulu neighborhood polygon, or (b) HPD publishes lat/lng.

const BASE = "https://data.honolulu.gov/resource/vg88-5rn5.json";
const ROW_LIMIT = 50_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface Cache {
  fetchedAt: number;
  rows: Incident[];
}
let cache: Cache | null = null;

interface HnlRow {
  objectid?: string;
  incidentnum?: string;
  blockaddress?: string;
  date?: string;
  type?: string;
  status?: string;
}

// HPD types are short and stable. Map them to the 3-bucket NIBRS
// taxonomy so the safety-score Part-1 filter can score them.
const PERSONS_TYPES = new Set([
  "ASSAULT", "ROBBERY", "HOMICIDE", "SEX CRIMES", "WEAPONS",
]);
const PROPERTY_TYPES = new Set([
  "THEFT/LARCENY", "VANDALISM", "MOTOR VEHICLE THEFT",
  "VEHICLE BREAK-IN/THEFT", "BURGLARY", "FRAUD",
]);

function mapToNibrs(type: string | undefined): CrimeCategory {
  const t = (type ?? "").toUpperCase().trim();
  if (PERSONS_TYPES.has(t)) return CrimeCategory.PERSONS;
  if (PROPERTY_TYPES.has(t)) return CrimeCategory.PROPERTY;
  return CrimeCategory.SOCIETY;
}

const PROVENANCE: DataProvenance = {
  source: "Honolulu Police Department Incidents (data.honolulu.gov, Socrata)",
  datasetUrl: "https://data.honolulu.gov/Public-Safety/Police-Incidents/vg88-5rn5",
  recency: "Refreshed daily by HPD",
  granularity: "jurisdiction",
  disclaimer:
    "These are dispatched incident records published by the Honolulu " +
    "Police Department to the City and County of Honolulu's open-data " +
    "portal. HPD does not publish per-incident latitude/longitude or " +
    "neighborhood labels — only a redacted block-address string — so " +
    "CommunitySafe currently aggregates Honolulu data at the citywide " +
    "level only. Per-neighborhood granularity will land when HPD adds " +
    "geo fields. CommunitySafe does not request demographic columns.",
};

function safeIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime()) || d.getTime() <= 0) return null;
  return d.toISOString();
}

// City centroid (Honolulu, HI). Used as the citywide placeholder.
const HONOLULU_CENTROID = { lat: 21.3099, lng: -157.8581 };

async function fetchHonolulu(): Promise<Incident[]> {
  const select = "objectid,incidentnum,blockaddress,date,type,status";
  const u = `${BASE}?$limit=${ROW_LIMIT}&$select=${select}&$order=date%20DESC&$where=date%20IS%20NOT%20NULL`;
  const res = await fetch(u, {
    headers: socrataHeaders(u),
  });
  if (!res.ok) throw new Error(`Honolulu Socrata ${res.status}`);
  const rows = (await res.json()) as HnlRow[];
  const out: Incident[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const occurredAt = safeIso(r.date);
    if (!occurredAt) continue;
    out.push({
      id: `hnl-${r.objectid ?? r.incidentnum ?? i}`,
      area: "Honolulu",
      occurredAt,
      nibrsCategory: mapToNibrs(r.type),
      ibrOffenseDescription: titleCaseOffense(r.type ?? "Unknown"),
      beat: null,
      blockLabel: r.blockaddress?.trim() || undefined,
      lat: HONOLULU_CENTROID.lat,
      lng: HONOLULU_CENTROID.lng,
    });
  }
  return out;
}

// In-flight Promise dedup (same pattern as detroit-arcgis.ts).
let inFlightHnlFetch: Promise<Incident[]> | null = null;

export async function getRowsHonolulu(): Promise<Incident[]> {
  const now = Date.now();
  if (cache && cache.rows.length > 0 && now - cache.fetchedAt < CACHE_TTL_MS) return cache.rows;
  if (inFlightHnlFetch) return inFlightHnlFetch;
  inFlightHnlFetch = (async () => {
    try {
      const rows = await fetchHonolulu();
      if (rows.length > 0) cache = { fetchedAt: now, rows };
      return rows;
    } catch (err) {
      console.warn("[honolulu] fetch failed:", (err as Error).message);
      return cache?.rows ?? [];
    } finally {
      inFlightHnlFetch = null;
    }
  })();
  return inFlightHnlFetch;
}

// Honolulu publishes one citywide bucket only (MVP). discover()
// returns a single KnownArea so the per-area iteration in safety-
// score / citywide endpoints reads consistently with every other city.
export async function getDiscoveredAreasHonolulu(): Promise<KnownArea[]> {
  return [{
    slug: "honolulu",
    label: "Honolulu",
    jurisdiction: "Honolulu",
    centroid: HONOLULU_CENTROID,
  }];
}

export const honoluluAdapter: CrimeDataAdapter = {
  name: "honolulu-socrata",

  async getAreaStats(_area: string): Promise<AreaStats | null> {
    const rows = await getRowsHonolulu();
    if (rows.length === 0) return null;
    const riskLevel: 1 | 2 | 3 | 4 | 5 = rows.length > 10000 ? 5 : rows.length > 5000 ? 4 : rows.length > 2000 ? 3 : rows.length > 500 ? 2 : 1;
    return { area: "Honolulu", crimeRate: null, violentCrimeRate: null, propertyCrimeRate: null, riskLevel, provenance: PROVENANCE };
  },

  async getIncidents(_area: string, opts?: { limit?: number; since?: Date }) {
    const rows = await getRowsHonolulu();
    let filtered = rows;
    if (opts?.since) filtered = filtered.filter((r) => new Date(r.occurredAt) >= opts.since!);
    return filtered.slice(0, opts?.limit ?? 50);
  },

  async getRecentReports(area: string, opts?: { limit?: number }) {
    return this.getIncidents(area, { limit: opts?.limit ?? 20 });
  },
};
