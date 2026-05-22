import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/lib/http";
import { getCrimeMix } from "@/server/services/crime-data/mix";

const Query = z.object({
  neighborhood: z.string().optional(),
  jurisdiction: z.string().optional(),
  // Retained for legacy callers; the service now derives the window from
  // actual incident dates rather than truncating by `days`.
  days: z.coerce.number().int().min(1).max(730).optional(),
});

export const dynamic = "force-dynamic";
export const GET = wrap(async (req: NextRequest) => {
  const q = Query.parse(Object.fromEntries(req.nextUrl.searchParams));
  const area = q.neighborhood ?? q.jurisdiction ?? "san-diego";
  return NextResponse.json(await getCrimeMix(area, q.days));
});
