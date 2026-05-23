import "server-only";
import type { AreaStats, CrimeDataAdapter, DataProvenance, Incident } from "../types";
import type { KnownArea } from "../neighborhoods";

// Phoenix AZ — Phoenix Police Crime Statistics on phoenixopendata.com.
//
// STATUS (2026-05-22): adapter is in BOOTSTRAP state. The Phoenix
// Open Data Portal publishes "Crime Statistics" as a weekly CSV but
// the dataset identifier rotates and the schema needs verification
// against a live response. Adapter currently returns an empty list
// so /coverage surfaces Phoenix as "Warming up" instead of claiming
// fabricated data. To activate:
//   1. Confirm the dataset endpoint at
//      https://www.phoenixopendata.com/dataset/crime-data
//   2. Map PPD's published fields → Incident shape (NIBRS Crime
//      Against, neighborhood, lat/lng).
//   3. Test against a live response and replace `fetchPhoenix()`
//      below with the real implementation.
//
// The CITY_POPULATION constant in watch/safety-score.ts already has
// Phoenix on the roadmap to add — set it to the US Census Vintage
// 2023 estimate (~1,650,070) when activating.

const PROVENANCE: DataProvenance = {
  source: "Phoenix Police Crime Statistics (Phoenix Open Data) — adapter in bootstrap",
  datasetUrl: "https://www.phoenixopendata.com/dataset/crime-data",
  recency: "Weekly publication when activated",
  granularity: "neighborhood",
  disclaimer:
    "Phoenix adapter is still being wired up. Until then, the city is listed " +
    "in /coverage as a roadmap entry. No fabricated data is returned.",
};

export async function getDiscoveredAreas(): Promise<KnownArea[]> {
  // Returns [] until the adapter is activated. /coverage shows
  // "Warming up" status; the homepage's CitySelector lists Phoenix
  // with a coming-soon visual treatment.
  return [];
}

async function fetchPhoenix(): Promise<Incident[]> {
  // Stub — returns empty. See top-of-file comment for activation steps.
  return [];
}

export const phoenixAdapter: CrimeDataAdapter = {
  name: "phoenix-socrata",

  async getAreaStats(): Promise<AreaStats | null> {
    return null;
  },

  async getIncidents(_area: string, _opts?: { limit?: number; since?: Date }) {
    // Reference fetchPhoenix once so the bootstrap stub stays alive
    // for tree-shaking purposes. Real implementation will call it.
    await fetchPhoenix();
    return [] as Incident[];
  },

  async getRecentReports(_area: string, _opts?: { limit?: number }) {
    return [];
  },
};

// Re-export with the city-prefixed name the cities.ts registry expects.
export { getDiscoveredAreas as getDiscoveredAreasPhoenix };

void PROVENANCE; // silence unused warning until the adapter is activated
