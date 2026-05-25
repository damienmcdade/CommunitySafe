import { CITIES } from "@travelsafe/crime-data/cities";
import { crimeData } from "@travelsafe/crime-data/dispatcher";
import { getCitywideSafetyScore } from "@travelsafe/crime-data/safety-score";
import { getCitywideTrend } from "@travelsafe/crime-data/trend-feed";
import { getRedis } from "../../lib/redis.js";

// v69 — Redis L2 cache for warm-worker-computed citywide responses.
// Eliminates the 5-min cold-start cost on Railway container restart:
// when a new container boots, the L1 (in-process) cache is empty,
// but Redis still has the prior warm-worker's serialized results.
// Routes that check Redis first get an instant hit; the worker
// continues populating in-process cache in the background.
const REDIS_KEY_PREFIX = "citywide:";
const REDIS_TTL_SECONDS = 30 * 60; // 30min — well past the 4-min cycle

// v57 — periodic cache warmer for the heaviest cities. The adapter
// cache TTL is 5 minutes; without continuous warming, every cold-
// start request waits 30-60s for the upstream fetch (Detroit / KC /
// Cleveland with 100+ neighborhoods are the worst offenders, and
// Vercel's 60s function ceiling turns those into 504s for users).
//
// Vercel Cron on the Hobby plan only allows daily schedules, so we
// run the 4-minute warmer on Railway alongside the check-in and
// push-digest workers. Same pattern as digest.worker.ts.

const WARM_INTERVAL_MS = 4 * 60 * 1000; // 4m, just under the 5m TTL
let timer: NodeJS.Timeout | null = null;
let inFlight = false;

// Prioritize the cities with the heaviest cold-cache cost. These all
// have 100+ tracked neighborhoods, which fan out into many per-area
// adapter calls during getCitywide. Lighter cities (cambridge, boise)
// warm fast and don't need explicit attention.
const HEAVY_CITIES = [
  "detroit",         // 199 areas
  "kansas-city",     // 145 areas
  "cleveland",       //  35 (but bundled CFS adapter is slow)
  "san-diego",       // 125
  "norfolk",         // 122
  "oakland",         // 123
  "minneapolis",     //  86
  "pittsburgh",      //  90
  "new-orleans",     //  74
  "new-york",        //  78
  "colorado-springs",//  78
  "chicago",         //  77
];

async function warmCity(slug: string) {
  const start = Date.now();
  // v69 — capture the safety-score result and persist to Redis so route
  // handlers can serve cold-start requests in <10ms (Redis round-trip)
  // instead of recomputing per-area aggregation (50-200ms) or worse,
  // re-fetching the upstream adapter (5min on Cleveland cold). Other
  // calls (getCitywide, getCitywideTrend) just warm the in-process
  // cache as before; their payloads are too large for cheap Redis
  // serialization on every cycle.
  const [, scoreResult] = await Promise.allSettled([
    crimeData.getCitywide(slug),
    getCitywideSafetyScore(slug),
    getCitywideTrend(slug),
  ]);
  if (scoreResult.status === "fulfilled" && scoreResult.value) {
    const redis = getRedis();
    if (redis) {
      try {
        await redis.setex(`${REDIS_KEY_PREFIX}${slug}`, REDIS_TTL_SECONDS, JSON.stringify(scoreResult.value));
      } catch (err) {
        // Redis hiccup is non-fatal — in-process cache is still warm
        // for the route to fall back on.
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[warm-worker] redis cache write failed for ${slug}:`, (err as Error).message);
        }
      }
    }
  }
  return Date.now() - start;
}

async function tick() {
  if (inFlight) return; // skip overlap if prior tick is still running
  inFlight = true;
  const cycleStart = Date.now();
  try {
    // Warm heavy cities first in parallel. Other cities also benefit
    // from any Promise.all fan-out via adapter cache reuse.
    const heavyTimings = await Promise.all(HEAVY_CITIES.map((c) => warmCity(c)));
    // Touch every remaining city so the adapter cache stays hot.
    const lightCities = CITIES.map((c) => c.slug).filter((s) => !HEAVY_CITIES.includes(s));
    const lightTimings = await Promise.all(lightCities.map((c) => warmCity(c)));
    const total = Date.now() - cycleStart;
    const avgHeavy = heavyTimings.length
      ? Math.round(heavyTimings.reduce((a, b) => a + b, 0) / heavyTimings.length)
      : 0;
    const avgLight = lightTimings.length
      ? Math.round(lightTimings.reduce((a, b) => a + b, 0) / lightTimings.length)
      : 0;
    console.log(`[warm-worker] cycle ${total}ms · heavy avg ${avgHeavy}ms · light avg ${avgLight}ms`);
  } catch (err) {
    console.error("[warm-worker] cycle failed:", err);
  } finally {
    inFlight = false;
  }
}

export function startWarmWorker() {
  if (timer) return;
  console.log(`[warm-worker] starting (cycle every ${WARM_INTERVAL_MS / 1000}s)`);
  timer = setInterval(() => void tick(), WARM_INTERVAL_MS);
  // Don't fire on startup — let the server finish booting first.
  // The first cycle will run 4 minutes after launch.
}

export function stopWarmWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  inFlight = false;
}
