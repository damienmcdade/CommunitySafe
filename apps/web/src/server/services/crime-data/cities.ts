import "server-only";
import type { CrimeDataAdapter } from "./types";
import type { KnownArea } from "./neighborhoods";
import { sdpdNibrsAdapter, getDiscoveredAreas as getDiscoveredAreasSD } from "./adapters/sdpd-nibrs";
import { lapdAdapter, getDiscoveredAreasLA } from "./adapters/lapd-socrata";

// City registry. Each city pairs a bounding box (for lat/lng → city detection)
// with its incident adapter and its discovery function. Adding a new city is
// a single entry here + one adapter file. See README "Adding a city".
//
// Confirmed cities: San Diego (SDPD NIBRS), Los Angeles (LAPD Socrata 2nrs-mtv8).
// Candidate additions (need to verify each city's public crime API + map to
// the NIBRS three-way classification): Long Beach (Socrata), San Francisco
// (DataSF), Oakland (OakData), San Jose (SJPD). Anaheim, Santa Ana, Riverside,
// Bakersfield, Irvine, Fontana — verify if a public crime API exists; many
// publish only quarterly PDFs which aren't ingestible.

export interface CityEntry {
  slug: string;
  label: string;
  bbox: { south: number; west: number; north: number; east: number };
  adapter: CrimeDataAdapter;
  discover: () => Promise<KnownArea[]>;
}

export const CITIES: CityEntry[] = [
  {
    slug: "san-diego",
    label: "San Diego",
    bbox: { south: 32.53, west: -117.30, north: 33.10, east: -116.90 },
    adapter: sdpdNibrsAdapter,
    discover: getDiscoveredAreasSD,
  },
  {
    slug: "los-angeles",
    label: "Los Angeles",
    bbox: { south: 33.70, west: -118.67, north: 34.34, east: -118.15 },
    adapter: lapdAdapter,
    discover: getDiscoveredAreasLA,
  },
];

export function cityFromLatLng(point: { lat: number; lng: number }): CityEntry | null {
  for (const c of CITIES) {
    if (point.lat >= c.bbox.south && point.lat <= c.bbox.north && point.lng >= c.bbox.west && point.lng <= c.bbox.east) {
      return c;
    }
  }
  return null;
}

/// Decide which city's adapter to use for an area slug. SF-prefixed slugs
/// (like "la-hollywood") are unambiguous; bare slugs default to San Diego.
export function cityForArea(slug: string): CityEntry {
  if (slug.startsWith("la-") || slug === "los-angeles") return CITIES[1];
  return CITIES[0];
}

export function cityBySlug(slug: string): CityEntry | null {
  return CITIES.find((c) => c.slug === slug) ?? null;
}
