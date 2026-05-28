import { NextResponse } from "next/server";
import { wrap } from "@/server/lib/http";
import { getNwsAlerts, type OfficialAlert } from "@/server/services/official-alerts/nws";
import { getUsgsEarthquakes } from "@/server/services/official-alerts/usgs";
import { getAmberAlerts } from "@/server/services/official-alerts/amber";
import { OFFICIAL_ALERTS_CITY_META } from "@/server/services/official-alerts/city-meta";

export const dynamic = "force-dynamic";

/// Aggregates every supported official-alerts source for the user's
/// city. Each adapter is independent and degrades silently — if
/// USGS errors we still ship the NWS list and vice versa, so the
/// card never goes blank because one upstream is down.
export const GET = wrap(async (req: Request) => {
  const url = new URL(req.url);
  const citySlug = url.searchParams.get("city");
  // City lookup is intentionally against a server-safe meta map. We
  // can't import the client-bundle CITIES (use-city.ts is
  // "use client"); doing so threw at runtime under Fluid Compute.
  const city = citySlug ? OFFICIAL_ALERTS_CITY_META[citySlug] ?? null : null;

  // v95p19 — AMBER alerts join NWS + USGS. AMBER is filtered by the
  // user's state (not city) because abductions move across cities.
  const [nws, usgs, amber] = await Promise.all([
    getNwsAlerts(city?.state ?? null, city?.label ?? null),
    getUsgsEarthquakes(city?.centroid ?? null),
    getAmberAlerts(city?.state ?? null),
  ]);

  // Newest first. AMBER alerts are issued with severity "Extreme" by
  // default; we boost them to the top of the list (regardless of the
  // chronological sort) so they are not buried under routine weather.
  const merged: OfficialAlert[] = [...nws, ...usgs, ...amber].sort(
    (a, b) => +new Date(b.effective) - +new Date(a.effective),
  );
  const amberFirst: OfficialAlert[] = merged.sort((a, b) => {
    const ax = a.source === "AMBER Alert" ? 0 : 1;
    const bx = b.source === "AMBER Alert" ? 0 : 1;
    return ax - bx;
  });
  const alerts = amberFirst;

  // Sources list reflects which adapters CONTRIBUTED, not the full
  // catalog — keeps the card honest about today's data shape. The
  // catalog itself stays visible in the disclaimer.
  const sourceLabels: string[] = [];
  if (amber.length > 0) sourceLabels.push("AMBER Alerts");
  if (nws.length > 0) sourceLabels.push("National Weather Service");
  if (usgs.length > 0) sourceLabels.push("USGS Earthquakes");
  if (sourceLabels.length === 0) sourceLabels.push("National Weather Service", "USGS Earthquakes", "AMBER Alerts");

  return NextResponse.json({
    sources: sourceLabels,
    alerts,
    disclaimer:
      "Aggregated from the National Weather Service (active weather alerts), " +
      "USGS Earthquakes (M2.5+ within 300km, past 72h), and active AMBER Alerts " +
      "(Child Abduction Emergencies) for the user's state. Independent of " +
      "TravelSafe community posts.",
  });
});
