import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/lib/http";
import { requireSession } from "@/server/lib/auth";
import { tryProxy } from "@/server/lib/proxy-to-api";
import { generateAreaBrief } from "@/server/services/ai/area-brief";

const Query = z.object({
  area: z.string().min(1).max(80),
});

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Auth-gated because each call invokes a paid LLM. Anonymous device
// sessions qualify; the per-IP middleware cap (5/min on /api/ai/*)
// still applies on top.
export const GET = wrap(async (req: NextRequest) => {
  requireSession(req);

  // v38: prefer Railway when API_BASE_URL is set so the brief cache
  // survives Vercel cold starts (Redis-backed on Railway). Local
  // fallback on any upstream error.
  const proxied = await tryProxy(req, "/ai/area-brief");
  if (proxied) return proxied.response;

  const { area } = Query.parse(Object.fromEntries(req.nextUrl.searchParams));
  const brief = await generateAreaBrief(area);
  return NextResponse.json({
    area,
    brief,
    aiConfigured: brief !== null,
    disclaimer:
      "AI-generated summary grounded in the most-reported offenses for this area. " +
      "Not legal or medical advice. Treat as a starting point for awareness, not a verdict.",
  });
});
