import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/lib/http";
import { getSafetyTipsForArea } from "@/server/services/safety/tips";
import { cityForArea } from "@/server/services/crime-data/cities";

const Query = z.object({
  neighborhood: z.string().optional(),
  jurisdiction: z.string().optional(),
  city: z.string().optional(),
});

export const dynamic = "force-dynamic";
// v60 — bump from Vercel's 5s default. getSafetyTipsForArea invokes
// the LLM (Groq → Gemini fallback) on cold cache for a city it hasn't
// generated tips for yet. The 6-hour in-process cache means warm calls
// return in ms, but the first cold call per city needs headroom.
export const maxDuration = 45;

// Safety tips are hard-coded per city — long-lived edge cache is safe.
const STABLE_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

export const GET = wrap(async (req: NextRequest) => {
  const q = Query.parse(Object.fromEntries(req.nextUrl.searchParams));
  let area = q.neighborhood ?? q.jurisdiction ?? q.city ?? "san-diego";
  // fix(safety-tips-city-ignored): unprefixed neighborhood slugs (e.g. "lincoln-park")
  // fall through to the San Diego default in cityForArea. When the caller also
  // passes city=chicago, use the city slug so tips show the correct city.
  if (q.city && cityForArea(area).slug !== q.city) {
    area = q.city;
  }
  return NextResponse.json(await getSafetyTipsForArea(area), { headers: STABLE_CACHE_HEADERS });
});
