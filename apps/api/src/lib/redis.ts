import Redis from "ioredis";
import { env } from "../env.js";

// Shared Redis client for Railway services that need a cross-restart
// cache. Lazy-initialized so the API still boots cleanly when REDIS_URL
// is unset (every consumer must handle a null client and fall back to
// in-memory or no-cache). When REDIS_URL is set, the client connects
// lazily on first command — startup never blocks waiting for Redis to
// be reachable.
//
// Railway: provision the Redis plugin from the dashboard. It auto-injects
// REDIS_URL into the service env. No further config needed.

let client: Redis | null = null;
let initFailed = false;

export function getRedis(): Redis | null {
  if (client) return client;
  if (initFailed) return null;
  if (!env.REDIS_URL) return null;
  try {
    client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      // Don't crash the API on a transient Redis blip — let the cache
      // call fail-soft and the caller fall through to its in-memory
      // path or recompute.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    client.on("error", (err) => {
      console.warn("[redis] error:", err.message);
    });
    client.on("connect", () => {
      console.log("[redis] connected");
    });
    return client;
  } catch (err) {
    console.warn("[redis] init failed:", (err as Error).message);
    initFailed = true;
    return null;
  }
}

export function isRedisEnabled(): boolean {
  return !!env.REDIS_URL;
}
