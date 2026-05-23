import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "./env";

// Shared Bearer-secret gate used by /api/cron/* and /api/diag/* — any
// route that should be reachable only by Vercel platform crons and
// authorized operators, not by anonymous traffic. Returns a NextResponse
// on failure (which the caller should return as-is); returns null when
// the request is authorized so the route can continue.
//
// The "soft" mode accepts the secret EITHER in the Authorization header
// (Bearer scheme — the way Vercel cron sends it) OR in a ?secret=...
// query string. Browsers can't easily set custom headers, so the query
// string is the only practical way to hit a diag route from the URL bar.
// Don't enable softMode on cron routes — they receive a real Bearer
// header from Vercel and shouldn't accept query strings.
export function requireCronSecret(
  req: NextRequest,
  opts: { softMode?: boolean } = {},
): NextResponse | null {
  // If the secret isn't configured we deliberately FAIL CLOSED — return
  // 503 rather than silently allowing the request through. A missing
  // secret means the protection isn't real, and "missing config" is a
  // different state from "configured and refused".
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "cron_secret_required" }, { status: 503 });
  }
  const header = req.headers.get("authorization");
  if (header === `Bearer ${env.CRON_SECRET}`) return null;
  if (opts.softMode) {
    const queryParam = req.nextUrl.searchParams.get("secret");
    if (queryParam === env.CRON_SECRET) return null;
  }
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
