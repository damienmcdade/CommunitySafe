import { NextResponse, type NextRequest } from "next/server";
import { wrap } from "@/server/lib/http";
import { getNews } from "@/server/services/news/google-news";

export const dynamic = "force-dynamic";

export const GET = wrap(async (req: NextRequest) => {
  const area = req.nextUrl.searchParams.get("area");
  const q = area
    ? `San Diego ${area.replace(/-/g, " ")} crime OR safety OR police`
    : "San Diego crime OR safety OR police";
  const items = await getNews(q);
  return NextResponse.json({
    source: "Google News (San Diego safety query)",
    query: q,
    items,
    disclaimer: "Headlines aggregated from Google News. Click through to read the original article at the source.",
  });
});
