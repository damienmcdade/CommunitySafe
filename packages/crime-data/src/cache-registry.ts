// Central registry of adapter row-cache evictors + a process memory guard.
//
// Every city adapter keeps its fetched rows in a module-level `cache`
// singleton with a ~5-minute freshness TTL. That TTL controls staleness,
// NOT residency: once populated, a city's rows stay on the heap until the
// module is torn down. With 37 adapters each holding tens of thousands of
// Incident objects (DC ~120k, LA ~100k, NYC/Chicago ~50k), the steady
// resident set plus the transient parse spikes from any worker that sweeps
// many cities at once has repeatedly pushed the API past its old-space cap
// and OOM-crashed it (exit 134, "Ineffective mark-compacts near heap
// limit") at ~15 minutes uptime — see apps/api/src/index.ts history.
//
// Each adapter registers a one-line evictor (`() => { cache = null }`) here
// at module load. A process-level watchdog (installed by apps/api) calls
// evictAllRowCaches() when heapUsed crosses a high-water mark, dropping the
// retained rows so the next GC can reclaim them. Adapters transparently
// refetch on the next request (rebuilding the 5-min cache), trading a
// one-request latency blip under memory pressure for never crashing.
//
// This bounds resident memory regardless of how many cities have been
// touched, which is the root cause the prior warm-worker mitigations
// (bucket trimming, heap-aware backoff, disabling the worker) only ever
// treated symptomatically.

type Evictor = () => void;

const evictors = new Set<Evictor>();

/// Register an adapter's cache-clear callback. Idempotent per callback
/// (Set-deduped); safe to call once at module load.
export function registerRowCache(evict: Evictor): void {
  evictors.add(evict);
}

/// Drop every registered adapter cache. Returns the number cleared.
/// Never throws — a misbehaving evictor can't block the rest.
export function evictAllRowCaches(): number {
  let n = 0;
  for (const evict of evictors) {
    try {
      evict();
      n++;
    } catch {
      // ignore — eviction is best-effort
    }
  }
  return n;
}

/// Count of registered caches (diagnostics / health payload).
export function registeredRowCacheCount(): number {
  return evictors.size;
}
