import { NextResponse } from "next/server";
import { getRowsLA, getDiscoveredAreasLA } from "@/server/services/crime-data/adapters/lapd-socrata";
import { listKnownAreas } from "@/server/services/crime-data/neighborhoods";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() {
  const out: Record<string, unknown> = { ts: new Date().toISOString() };
  try {
    const rows = await getRowsLA();
    out.rowCount = rows.length;
  } catch (e) { out.fetchError = (e as Error).message; }
  try {
    const areas = await getDiscoveredAreasLA();
    out.directLADiscoveredCount = areas.length;
  } catch (e) { out.directError = (e as Error).message; }
  try {
    const list = await listKnownAreas();
    out.listKnownTotalCount = list.length;
    out.listKnownLAEntries = list.filter((a) => a.jurisdiction === "Los Angeles").length;
    out.listKnownSDEntries = list.filter((a) => a.jurisdiction === "San Diego").length;
    out.firstLA = list.find((a) => a.jurisdiction === "Los Angeles") ?? null;
  } catch (e) { out.listError = (e as Error).message; }
  try {
    const { CITIES } = await import("@/server/services/crime-data/cities");
    out.citiesCount = CITIES.length;
    out.cityLabels = CITIES.map((c) => c.label);
    // Independently re-run each city's discover and see what each yields
    const perCity: Record<string, number> = {};
    for (const c of CITIES) {
      const d = await c.discover().catch((e) => { perCity[`${c.slug}_error`] = -1 as never; return [] as Awaited<ReturnType<typeof c.discover>>; });
      perCity[c.slug] = d.length;
    }
    out.perCityDiscoverDirect = perCity;
  } catch (e) { out.citiesError = (e as Error).message; }
  return NextResponse.json(out);
}
