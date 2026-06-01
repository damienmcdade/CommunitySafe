// Concurrency gate for heavy whole-city composes — keyed by CITY.
//
// The memory watchdog (apps/api/src/index.ts) bounds the resident row-cache
// baseline on a poll; a burst of concurrent COLD city composes can still spike
// heap past the old-space cap between polls and OOM-crash (exit 134). Each cold
// compose parses one city's full incident set (DC ~120k, LA ~100k objects) and
// fans out over every neighborhood; many DISTINCT cities parsing at once is the
// memory driver this gate bounds.
//
// v103 keyed it wrong — it counted COMPOSERS, but a single page load fires ~7
// composers for ONE city (citywide / area-stats / safety-score / trend / mix /
// upticks / insights). At a global limit of 4 that serialized every page load
// ~4x (a warm San Diego load went 0.5s -> 1.9s) even though those 7 composers
// share ONE row-cache parse and cost one city's worth of memory.
//
// So the gate is keyed by city slug: all composers for the same city share ONE
// slot (they run together — no false throttling), and the limit bounds the
// number of DISTINCT cities composing concurrently — which is exactly the
// memory model. Warm or cold, one page = one slot. A pathological many-city
// sweep is still capped.
//
// SAFETY: only the six dedupe-wrapped citywide composers are gated; their
// bodies call ONLY leaf getIncidents/getAreaStats, never another composer, so
// there is no gate-within-gate and the semaphore cannot deadlock. Same-city
// composers piggyback an existing slot rather than queue, so a single page can
// never deadlock against its own concurrent endpoints.

// Distinct concurrent cities. Tunable via COMPUTE_CONCURRENCY without a
// redeploy. Default 6: comfortably above the 1 city a single page load needs
// (so no user ever queues on themselves) and above normal multi-user spread,
// while still capping the 38-city sweep that OOM'd the box. Clamped to >=1.
const MAX = (() => {
  const raw = Number(process.env.COMPUTE_CONCURRENCY);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 6;
})();

let activeCities = 0;                                   // distinct cities holding a slot
const refs = new Map<string, number>();                // city key -> in-flight composer count
const queue: Array<{ key: string; resolve: () => void }> = [];

function acquire(key: string): Promise<void> {
  // Same-city composer → piggyback the city's existing slot (no new slot).
  const cur = refs.get(key);
  if (cur !== undefined) { refs.set(key, cur + 1); return Promise.resolve(); }
  // New city with a free slot → take one.
  if (activeCities < MAX) { activeCities += 1; refs.set(key, 1); return Promise.resolve(); }
  // No free slot → queue until a city drains.
  return new Promise<void>((resolve) => { queue.push({ key, resolve }); });
}

function drain(): void {
  // 1) Any queued waiter whose city is already active piggybacks immediately.
  for (let i = 0; i < queue.length; ) {
    const w = queue[i];
    if (refs.has(w.key)) {
      queue.splice(i, 1);
      refs.set(w.key, (refs.get(w.key) ?? 0) + 1);
      w.resolve();
    } else i += 1;
  }
  // 2) Fill free slots with new cities (FIFO), sweeping same-city piggybacks.
  while (activeCities < MAX && queue.length > 0) {
    const w = queue.shift()!;
    activeCities += 1;
    refs.set(w.key, 1);
    w.resolve();
    for (let i = 0; i < queue.length; ) {
      if (queue[i].key === w.key) {
        const p = queue.splice(i, 1)[0];
        refs.set(w.key, (refs.get(w.key) ?? 0) + 1);
        p.resolve();
      } else i += 1;
    }
  }
}

function release(key: string): void {
  const cur = refs.get(key);
  if (cur === undefined) return;            // defensive — never throw on release
  if (cur > 1) { refs.set(key, cur - 1); return; }
  refs.delete(key);
  activeCities -= 1;
  drain();
}

/// Run `fn` (a heavy compose for `key`, the city slug) under the per-city gate.
/// Resolves/rejects with fn's result; a rejection still releases the slot.
export function withComputeLimit<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return acquire(key).then(() =>
    Promise.resolve().then(fn).finally(() => release(key)),
  );
}

/// Diagnostics for the /health payload.
export function computeLimitStats(): { max: number; activeCities: number; queued: number } {
  return { max: MAX, activeCities, queued: queue.length };
}
