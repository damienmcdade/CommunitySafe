// v95 — citywide-compose in-flight dedup.
//
// Each /api/* endpoint that asks for the whole city (safety-score,
// trend, citywide totals, area-stats, mix, upticks, insights) runs a
// per-area Promise.all over every neighborhood. Atlanta has 244 areas,
// Phoenix ~200, NYC ~300 — when seven endpoints hit the same city
// concurrently (typical Crime Map first paint), seven independent
// 244-wide fan-outs allocate seven copies of the per-area row arrays.
// Combined with the cache-rebuild that can run alongside (when TTL has
// just expired), this is enough to push the container past Node's
// 4GB heap limit and OOM-kill it (exit 134, observed 2026-05-26).
//
// `dedupe(key, fn)` collapses concurrent calls with the same key onto
// ONE underlying promise. The cache entry is cleared in `.finally` so
// later (cold) calls re-run from scratch. Nothing is persisted across
// the function's resolution — there is no caching of results here.
// Adapter-level result caching still happens in each adapter's
// CACHE_TTL.

const inflight = new Map<string, Promise<unknown>>();

export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p as Promise<unknown>);
  return p;
}
