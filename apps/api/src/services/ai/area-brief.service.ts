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

async function cachePut(area: string, brief: string): Promise<void> {
  const k = scopedKey(area);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(CACHE_KEY_PREFIX + k, brief, "EX", CACHE_TTL_SECONDS);
      return;
    } catch {
      // fall through
    }
  }
  localCache.set(k, { fetchedAt: Date.now(), brief });
}

const sanitize = (s: string, maxLen = 80): string =>
  s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLen);

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
  if (!result) return null;
  let text = result.text.replace(/^#+\s*/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1");
  if (text.length > 800) text = text.slice(0, 800);
  await cachePut(area, text);
  return text;
}
