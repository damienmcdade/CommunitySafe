import { aiConfigured, generateTextWithFallback } from "./provider.js";
import { getCrimeMix } from "@travelsafe/crime-data/mix";
import { cityForArea, humanizeArea } from "@travelsafe/crime-data/cities";
import { getRedis } from "../../lib/redis.js";

// Per-neighborhood AI brief. Ported from apps/web for v38 — same
// prompt, same algorithm, but now Redis-backed so the brief survives
// cold starts. Sibling of incident-explain.service.ts (which also
// migrated for the same reason).

const SYSTEM_PROMPT = `
You are a calm, factual safety summarizer for a US neighborhood.

Output: exactly TWO short paragraphs, no markdown formatting, no headings,
no bullets. Plain prose only.

Paragraph 1 (what the data shows): 2-3 sentences describing the
neighborhood's most-reported offense categories. Use the offense names
from the list verbatim where natural. Mention the rolling window
("the most recent ~N days") as context. No alarmism, no minimization.

Paragraph 2 (practical context): 1-2 sentences with non-vigilante
guidance grounded in the dominant offense category — e.g. for high
property crime, parking + visible-belongings advice; for assault-heavy
areas, transit + late-hour awareness. Direct to 911 only for active
emergencies; do not encourage confronting anyone.

Hard rules:
- NEVER mention demographics (race, ethnicity, religion, age, gender,
  orientation, immigration status).
- NEVER name or describe individual people, vehicles, or addresses.
- NEVER encourage confronting, following, recording, or approaching
  any person.
- Stay neutral on the neighborhood's character — describe data, not vibes.
- Maximum 600 characters total.
`.trim();

const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6h per area
// v95p32 — cache-key prefix bumped v1 → v2 BECAUSE the v1 key was
// `ai:area-brief:v1:` + neighborhood slug only, which collides across
// cities (Sacramento's "downtown" and SF's "downtown" shared an entry,
// users saw blended/wrong AI briefs). v2 prefixes the city slug.
// Bumping the version invalidates every poisoned v1 entry immediately
// rather than waiting out the 6h TTL.
// v106 — bumped v2 -> v3 so briefs regenerate with the humanized neighborhood
// name in the prose (was emitting the raw slug, e.g. "gnv-appletree").
const CACHE_KEY_PREFIX = "ai:area-brief:v3:";
const localCache = new Map<string, { fetchedAt: number; brief: string }>();
const LOCAL_TTL_MS = CACHE_TTL_SECONDS * 1000;

function scopedKey(area: string): string {
  // Scope the cache key to the area's parent city so a neighborhood
  // slug shared across cities does not collide.
  const city = cityForArea(area);
  return `${city.slug}:${area}`;
}

async function cacheGet(area: string): Promise<string | null> {
  const k = scopedKey(area);
  const redis = getRedis();
  if (redis) {
    try {
      const hit = await redis.get(CACHE_KEY_PREFIX + k);
      if (hit) return hit;
    } catch {
      // fall through to local
    }
  }
  const local = localCache.get(k);
  if (local && Date.now() - local.fetchedAt < LOCAL_TTL_MS) return local.brief;
  return null;
}

async function cachePutTtl(area: string, brief: string, ttlSeconds: number): Promise<void> {
  const k = scopedKey(area);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(CACHE_KEY_PREFIX + k, brief, "EX", ttlSeconds);
      return;
    } catch {
      // fall through
    }
  }
  // For the local cache, age the entry so a shorter TTL expires sooner: store a
  // fetchedAt offset into the past so (now - fetchedAt) crosses LOCAL_TTL_MS at
  // the requested ttl rather than the 6h default.
  const ageOffsetMs = Math.max(0, LOCAL_TTL_MS - ttlSeconds * 1000);
  localCache.set(k, { fetchedAt: Date.now() - ageOffsetMs, brief });
}

async function cachePut(area: string, brief: string): Promise<void> {
  return cachePutTtl(area, brief, CACHE_TTL_SECONDS);
}

const sanitize = (s: string, maxLen = 80): string =>
  s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLen);

// v113 — deterministic, non-LLM fallback brief. The AI provider chain
// (Groq → Gemini → gateway) can return null fleet-wide on a free-tier
// daily-token exhaustion or transient outage; area-brief previously
// surfaced that as a BLANK "AI Summary" card. When we have real crime-mix
// data we can always produce a calm, factual two-sentence brief from the
// offense list itself — same safety rules as the LLM prompt (no
// demographics, no people/vehicles/addresses, no confrontation guidance).
// This guarantees the card is never empty when data exists; a live LLM
// result still takes precedence and overwrites the cache on next call.
function deterministicBrief(
  areaLabel: string,
  windowDays: number,
  dominant: "PERSONS" | "PROPERTY" | "SOCIETY",
  top: Array<{ offense: string; count: number }>,
): string {
  const names = top.slice(0, 3).map((o) => sanitize(o.offense, 48).toLowerCase()).filter(Boolean);
  const offensePhrase =
    names.length === 0 ? "a range of offenses"
    : names.length === 1 ? names[0]
    : names.length === 2 ? `${names[0]} and ${names[1]}`
    : `${names[0]}, ${names[1]}, and ${names[2]}`;
  const p1 = `In ${areaLabel}, the most-reported offenses over the most recent ~${windowDays} days were ${offensePhrase}.`;
  const guidance: Record<typeof dominant, string> = {
    PROPERTY: "Most activity here is property-related, so keeping valuables out of sight and securing vehicles and entry points are sensible precautions; call 911 only for an active emergency.",
    PERSONS: "A notable share of reports involve person-directed offenses, so staying aware on transit and during late hours is worthwhile; call 911 for any active emergency and avoid confronting anyone.",
    SOCIETY: "Many reports here are public-order offenses, so ordinary situational awareness applies; call 911 only for an active emergency.",
  };
  return `${p1} ${guidance[dominant]}`.slice(0, 600);
}

export async function generateAreaBrief(area: string): Promise<string | null> {
  if (!aiConfigured()) return null;
  const cached = await cacheGet(area);
  if (cached) return cached;

  const city = cityForArea(area);
  const mix = await getCrimeMix(area).catch(() => null);
  const top = mix?.topOffenses ?? [];
  if (top.length === 0) return null;

  const totals = { PERSONS: 0, PROPERTY: 0, SOCIETY: 0 };
  for (const o of top) totals[o.category] += o.count;
  const dominant = (Object.entries(totals) as Array<["PERSONS"|"PROPERTY"|"SOCIETY", number]>)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "PROPERTY";

  const offenseList = top.slice(0, 6)
    .map((o) => `${sanitize(o.offense, 60)} (${o.count})`)
    .join("; ");

  const userPrompt = `
City: ${sanitize(city.label)}
Neighborhood / area: ${sanitize(humanizeArea(area))}
Rolling window: ${mix?.windowDays ?? 30} days
Dominant category: ${dominant}
Total recent incidents: ${mix?.totalIncidents ?? 0}
Top reported offenses (offense (count)):
${offenseList}

Write the two-paragraph brief now.
`.trim();

  // v96 — generateTextWithFallback handles Groq → Gemini → gateway
  // chain at call time. Replaced manual single-provider getAIModel
  // path after the coverage probe found Groq's daily token cap
  // silently dropped every brief once exhausted.
  const result = await generateTextWithFallback({
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    temperature: 0.3,
  });
  // v113 — if the LLM chain is unavailable (free-tier exhaustion / outage),
  // fall back to a deterministic factual brief built from the offense mix so
  // the "AI Summary" card is never blank when data exists. Cache it with a
  // shorter TTL so a recovered LLM can replace it sooner than the 6h default.
  if (!result || !result.text.trim()) {
    const fallback = deterministicBrief(humanizeArea(area), mix?.windowDays ?? 30, dominant, top);
    await cachePutTtl(area, fallback, 30 * 60);
    return fallback;
  }
  let text = result.text.replace(/^#+\s*/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1");
  if (text.length > 800) text = text.slice(0, 800);
  await cachePut(area, text);
  return text;
}
