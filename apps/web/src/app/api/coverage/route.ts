import { NextResponse } from "next/server";
import { wrap } from "@/server/lib/http";
import { getCoverage } from "@/server/services/coverage/status";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 5-minute edge cache matches the adapter row-cache TTL — there's no
// fresher data to surface in the dashboard during a single 5-min window.
// 15-min stale-while-revalidate keeps the dashboard snappy across page
// refreshes while a fresh build runs in the background.
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
};

export const GET = wrap(async () => {
  const coverage = await getCoverage();
  return NextResponse.json(coverage, { headers: CACHE_HEADERS });
});
