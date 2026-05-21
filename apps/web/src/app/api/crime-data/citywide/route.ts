import { NextResponse, type NextRequest } from "next/server";
import { wrap } from "@/server/lib/http";
import { crimeData } from "@/server/services/crime-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export const GET = wrap(async (req: NextRequest) => {
  const city = req.nextUrl.searchParams.get("city") ?? "san-diego";
  return NextResponse.json(await crimeData.getCitywide(city));
});
