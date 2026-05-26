// v87 — Global HTTP dispatcher with keep-alive + per-origin connection
// pooling. Pre-v87 every adapter page-fetch opened a fresh TCP+TLS
// connection (Node's global fetch uses an ephemeral undici dispatcher).
// Per the perf audit: Cleveland 30 pages, DC 60 pages, NYPD 4 pages,
// LA 2 pages = ~50 cold handshakes/min during warm-worker cycles, each
// 200-400ms. Switching to a pooled dispatcher cuts that overhead to
// ~zero on the second-and-subsequent pages.
//
// Sized for our concurrency: per-origin connections=10 (warm-worker
// runs heavy=2 concurrent cities × bounded-pool=4 pages = 8 simultaneous;
// 10 leaves headroom for the routes that also hit upstreams).
import { Agent, setGlobalDispatcher } from "undici";

let installed = false;

export function installPooledDispatcher(): void {
  if (installed) return;
  installed = true;
  setGlobalDispatcher(new Agent({
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 600_000,
    connections: 10,
    pipelining: 1,
  }));
}

// v89 — shared User-Agent so every adapter identifies itself uniformly
// to upstream open-data portals (Socrata, ArcGIS, CKAN). Several portals
// rate-limit anonymous traffic differently from identified traffic.
export const USER_AGENT = "CommunitySafe/0.1 (https://github.com/damienmcdade/CommunitySafe)";

// v89 — Socrata X-App-Token lookup. Anonymous SoQL queries share a
// global throttle pool (50 req/min per IP at the time of writing);
// adding an app token moves the calling app into a per-app pool with
// much higher limits. Tokens are free at dev.socrata.com.
//
// Per-host env vars take precedence over the generic SOCRATA_APP_TOKEN
// so an operator can grant different tokens to different cities (or
// only some cities). Lookup order for `data.cityofnewyork.us`:
//   SOCRATA_APP_TOKEN_DATA_CITYOFNEWYORK_US > SOCRATA_APP_TOKEN
export function socrataAppToken(host: string): string | undefined {
  const k = "SOCRATA_APP_TOKEN_" + host.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return process.env[k] || process.env.SOCRATA_APP_TOKEN;
}

// Convenience: build the headers most Socrata adapters use, with
// X-App-Token attached automatically when a token is configured.
// Caller may pass a base headers object to extend.
export function socrataHeaders(url: string | URL, extra: Record<string, string> = {}): Record<string, string> {
  const host = typeof url === "string" ? new URL(url).host : url.host;
  const tok = socrataAppToken(host);
  const h: Record<string, string> = { Accept: "application/json", "User-Agent": USER_AGENT, ...extra };
  if (tok) h["X-App-Token"] = tok;
  return h;
}
