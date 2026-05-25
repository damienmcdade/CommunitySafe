import "server-only";
import { NextResponse } from "next/server";
import { env } from "./env";

// Shared helper for Vercel route handlers that want to delegate to the
// Railway API when API_BASE_URL is set. Pattern: try Railway, fall back
// to the local implementation on any upstream error so a Railway hiccup
// never blocks a user.
//
// Usage at a Vercel route handler:
//   const proxied = await tryProxy(req, "/safezone/safety-score");
//   if (proxied) return proxied;
//   // ...local fallback path

// 55s leaves ~5s headroom inside Vercel's 60s function max. Citywide
// safety-score on the biggest cities (Detroit 199 areas, KC 145
// areas) can take 30-40s on a cold cache, so the original 25s
// timeout was tripping the divergence-guard path even when Railway
// was healthy.
const TIMEOUT_MS = 55_000;

interface ProxyResult {
  response: NextResponse;
}

export async function tryProxy(
  req: { nextUrl: URL; headers: { get(name: string): string | null } },
  upstreamPath: string,
): Promise<ProxyResult | null> {
  if (!env.API_BASE_URL) return null;
  const url = new URL(upstreamPath, env.API_BASE_URL);
  // Carry over every search param from the inbound request so query
  // semantics round-trip unchanged.
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  // Forward the Authorization header (anon-auth JWT) so Railway's
  // requireAuth / optionalAuth middleware sees the same identity the
  // Vercel handler would have. Cookies stay on Vercel — the Railway
  // API doesn't use them.
  const upstreamHeaders: Record<string, string> = { Accept: "application/json" };
  const auth = req.headers.get("authorization");
  if (auth) upstreamHeaders["Authorization"] = auth;

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: upstreamHeaders,
      signal: controller.signal,
    });
    if (!upstream.ok) {
      // 4xx / 5xx from Railway → let the local fallback kick in. The
      // adapter cache on Vercel might still have data.
      return null;
    }
    const body = await upstream.text();
    const ct = upstream.headers.get("content-type") ?? "application/json";
    const cc = upstream.headers.get("cache-control")
      ?? "public, s-maxage=300, stale-while-revalidate=900";
    return {
      response: new NextResponse(body, {
        status: 200,
        headers: { "Content-Type": ct, "Cache-Control": cc },
      }),
    };
  } catch {
    // Aborted, DNS failure, refused connection, etc. — fall through to
    // the local implementation. Never block the user on a Railway blip.
    return null;
  } finally {
    clearTimeout(to);
  }
}
