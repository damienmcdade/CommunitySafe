import { findArea, nearestArea, listKnownAreas, listKnownAreasSync, type KnownArea } from "../crime-data/neighborhoods";

const SD_ZIP_TO_AREA: Record<string, string> = {
  "92101": "downtown-sd",
  "92103": "hillcrest",
  "92104": "north-park",
  "92108": "mission-valley",
  "92109": "pacific-beach",
  "92037": "la-jolla",
  "92126": "mira-mesa",
  "92121": "mira-mesa",
  "92123": "mission-valley",
};

export interface LookupResult {
  area: KnownArea;
  matchedVia: "exact" | "zip" | "fuzzy" | "geocode";
  rawQuery: string;
}

function fuzzyMatch(needle: string, areas: KnownArea[]): KnownArea | null {
  const n = needle.toLowerCase().replace(/[^a-z0-9 ]+/g, "");
  if (!n) return null;
  const tokens = n.split(/\s+/).filter(Boolean);
  let best: { area: KnownArea; score: number } | null = null;
  for (const area of areas) {
    const hay = `${area.slug} ${area.label}`.toLowerCase();
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += t.length;
    if (score > 0 && (!best || score > best.score)) best = { area, score };
  }
  return best?.area ?? null;
}

async function nominatimGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${query}, San Diego, California`);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("viewbox", "-117.6,33.5,-116.0,32.5");
  url.searchParams.set("bounded", "1");
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CommunitySafe/0.1 (https://github.com/damienmcdade/CommunitySafe)" },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!arr.length) return null;
    return { lat: Number(arr[0].lat), lng: Number(arr[0].lon) };
  } catch {
    return null;
  }
}

export async function lookupLocation(q: string): Promise<LookupResult | null> {
  const trimmed = q.trim();
  if (!trimmed) return null;

  // Try the cheap matches first BEFORE doing the heavy 30-adapter
  // listKnownAreas() fan-out. exact + zip + nominatim hit synchronous
  // tables or a single HTTP call; they complete in <500ms. Only fall
  // back to the full discovery list for the fuzzy-match path.
  // Previously this loaded the full list up-front and routinely
  // exceeded the 30s Vercel timeout on cold cache.
  const exact = findArea(trimmed);
  if (exact) return { area: exact, matchedVia: "exact", rawQuery: trimmed };

  const zipMatch = trimmed.match(/\b(9\d{4})\b/);
  if (zipMatch && SD_ZIP_TO_AREA[zipMatch[1]]) {
    const area = findArea(SD_ZIP_TO_AREA[zipMatch[1]]);
    if (area) return { area, matchedVia: "zip", rawQuery: trimmed };
  }

  // Only now pull the discovered list for fuzzy matching. Use the
  // sync (last-known-good) variant first — it returns whatever the
  // most-recent listKnownAreas() call populated. If the cache is
  // cold, we still try the async load but wrap in a timeout so
  // the lookup endpoint never blocks past ~12s.
  let areas = listKnownAreasSync();
  if (areas.length < 50) {
    // Cache is cold or fallback-only — pull fresh but cap the wait
    // at 12s so the endpoint returns SOMETHING within Vercel's budget.
    const timeout = new Promise<KnownArea[]>((resolve) =>
      setTimeout(() => resolve(areas), 12_000));
    areas = await Promise.race([listKnownAreas(), timeout]);
  }
  const fuzzy = fuzzyMatch(trimmed, areas);
  if (fuzzy) return { area: fuzzy, matchedVia: "fuzzy", rawQuery: trimmed };

  const geo = await nominatimGeocode(trimmed);
  if (geo) {
    const area = nearestArea(geo);
    if (area) return { area, matchedVia: "geocode", rawQuery: trimmed };
  }
  return null;
}

export async function allKnownAreas(): Promise<KnownArea[]> {
  return listKnownAreas();
}
