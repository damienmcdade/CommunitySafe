"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useApi } from "@/lib/api-client";

interface KnownArea { slug: string; label: string; jurisdiction: string; centroid: { lat: number; lng: number } }
interface AreaBreakdown {
  slug: string;
  label: string;
  incidentCount: number;
  riskLevel: 1 | 2 | 3 | 4 | 5;
  byCategory: { PERSONS: number; PROPERTY: number; SOCIETY: number };
  dominantCategory: "PERSONS" | "PROPERTY" | "SOCIETY" | null;
}
interface Citywide {
  totalIncidents: number;
  perArea: AreaBreakdown[];
}

const CATEGORY_COLOR: Record<"PERSONS" | "PROPERTY" | "SOCIETY", { fill: string; stroke: string; label: string }> = {
  PERSONS:  { fill: "#357F9C", stroke: "#1A4B5E", label: "Crimes against persons" },
  PROPERTY: { fill: "#D26E47", stroke: "#8E4528", label: "Property crimes" },
  SOCIETY:  { fill: "#6C8B62", stroke: "#3F5C3B", label: "Society / other offenses" },
};
const NEUTRAL = { fill: "#A48E63", stroke: "#6B5A38" };

interface Combined { area: KnownArea; stats: AreaBreakdown | null }

export default function CrimeMap() {
  const { data: areas, loading: areasLoading } = useApi<KnownArea[]>("/geo/areas");
  const { data: citywide, loading: cityLoading, error } = useApi<Citywide>("/crime-data/citywide");
  const [hovered, setHovered] = useState<string | null>(null);

  const combined: Combined[] = useMemo(() => {
    if (!areas) return [];
    const byArea = new Map((citywide?.perArea ?? []).map((p) => [p.slug, p]));
    return areas.map((a) => ({ area: a, stats: byArea.get(a.slug) ?? null }));
  }, [areas, citywide]);

  const maxCount = useMemo(
    () => Math.max(1, ...combined.map((c) => c.stats?.incidentCount ?? 0)),
    [combined],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-3 surface overflow-hidden relative">
        {(areasLoading || cityLoading) && (
          <div className="absolute top-3 right-3 z-[400] surface-muted px-3 py-1.5 text-xs text-slate2-500 animate-pulse">
            Loading official SDPD data…
          </div>
        )}
        <MapContainer center={[32.78, -117.18]} zoom={11} scrollWheelZoom style={{ height: 560, width: "100%" }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          {combined.map(({ area, stats }) => {
            const count = stats?.incidentCount ?? 0;
            const radiusBase = Math.max(10, Math.min(46, 12 + Math.sqrt(count) * 1.8));
            const palette = stats?.dominantCategory ? CATEGORY_COLOR[stats.dominantCategory] : NEUTRAL;
            const isHovered = hovered === area.slug;
            return (
              <CircleMarker
                key={area.slug}
                center={[area.centroid.lat, area.centroid.lng]}
                radius={radiusBase}
                pathOptions={{
                  color: palette.stroke,
                  fillColor: palette.fill,
                  fillOpacity: isHovered ? 0.65 : 0.45,
                  weight: isHovered ? 2.5 : 1.5,
                }}
                eventHandlers={{
                  mouseover: () => setHovered(area.slug),
                  mouseout: () => setHovered(null),
                }}
              >
                <Tooltip direction="top" offset={[0, -radiusBase]} opacity={1}>
                  <div className="font-sans text-xs">
                    <div className="font-medium text-slate2-900">{area.label}</div>
                    <div className="text-slate2-700">{count.toLocaleString()} incidents (recent window)</div>
                    {stats && (
                      <ul className="mt-1 space-y-0.5 text-slate2-500">
                        <li>Persons: {stats.byCategory.PERSONS}</li>
                        <li>Property: {stats.byCategory.PROPERTY}</li>
                        <li>Society / other: {stats.byCategory.SOCIETY}</li>
                      </ul>
                    )}
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
          <FitToBounds areas={combined.map((c) => c.area)} />
        </MapContainer>
      </div>

      <aside className="lg:col-span-2 space-y-4">
        <Legend />
        <section className="surface p-5">
          <header className="flex items-baseline justify-between">
            <h2 className="font-display text-lg text-slate2-900">Areas at a glance</h2>
            <span className="text-xs text-slate2-500">{(citywide?.totalIncidents ?? 0).toLocaleString()} total incidents</span>
          </header>
          {error && <p className="mt-3 text-sm text-dusk-700">Couldn&apos;t reach SDPD right now. Try again in a moment.</p>}
          <ol className="mt-3 divide-y divide-sand-200">
            {combined.length === 0 && <li className="py-3 text-sm text-slate2-500">Loading…</li>}
            {combined
              .slice()
              .sort((a, b) => (b.stats?.incidentCount ?? 0) - (a.stats?.incidentCount ?? 0))
              .map(({ area, stats }) => {
                const count = stats?.incidentCount ?? 0;
                const fillPct = (count / maxCount) * 100;
                const palette = stats?.dominantCategory ? CATEGORY_COLOR[stats.dominantCategory] : NEUTRAL;
                return (
                  <li
                    key={area.slug}
                    className={`py-3 transition-colors px-2 -mx-2 rounded-md ${hovered === area.slug ? "bg-bay-50" : ""}`}
                    onMouseEnter={() => setHovered(area.slug)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={`/neighborhood`} className="text-slate2-900 hover:text-bay-700 transition-colors">
                        {area.label}
                      </Link>
                      <span className="text-xs text-slate2-500">{count.toLocaleString()}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-sand-100 overflow-hidden">
                      <div className="h-full transition-all duration-500" style={{ width: `${fillPct}%`, background: palette.fill }} />
                    </div>
                    {stats && stats.dominantCategory && count > 0 && (
                      <div className="mt-1 text-xs text-slate2-500">
                        Mostly: <span style={{ color: palette.stroke }} className="font-medium">{CATEGORY_COLOR[stats.dominantCategory].label.toLowerCase()}</span>
                      </div>
                    )}
                  </li>
                );
              })}
          </ol>
        </section>
      </aside>
    </div>
  );
}

function FitToBounds({ areas }: { areas: KnownArea[] }) {
  const map = useMap();
  useEffect(() => {
    if (areas.length === 0) return;
    const lats = areas.map((a) => a.centroid.lat);
    const lngs = areas.map((a) => a.centroid.lng);
    const padding = 0.05;
    map.fitBounds([[Math.min(...lats) - padding, Math.min(...lngs) - padding], [Math.max(...lats) + padding, Math.max(...lngs) + padding]]);
  }, [areas, map]);
  return null;
}

function Legend() {
  return (
    <section className="surface p-5 text-sm">
      <h2 className="font-display text-lg text-slate2-900">How to read the map</h2>
      <p className="mt-2 text-xs text-slate2-500">
        Each circle is one San Diego neighborhood. Bigger = more SDPD-reported incidents recently.
        Color = the most-common incident category in that area.
      </p>
      <div className="mt-4">
        <div className="text-xs font-medium text-slate2-700 mb-2">Color = dominant category</div>
        <ul className="space-y-1.5 text-xs">
          <LegendDot color={CATEGORY_COLOR.PERSONS.fill} label="Crimes against persons (assault, robbery, intimidation)" />
          <LegendDot color={CATEGORY_COLOR.PROPERTY.fill} label="Property crimes (theft, burglary, vandalism)" />
          <LegendDot color={CATEGORY_COLOR.SOCIETY.fill} label="Society / other (drug, weapons, disorderly conduct)" />
        </ul>
      </div>
      <div className="mt-4">
        <div className="text-xs font-medium text-slate2-700 mb-2">Size = number of incidents</div>
        <div className="flex items-end gap-3">
          <SizeChip diameter={20} caption="~10" />
          <SizeChip diameter={32} caption="~100" />
          <SizeChip diameter={48} caption="500+" />
        </div>
      </div>
      <p className="mt-4 text-xs text-slate2-500">
        Higher counts often reflect higher reporting + population density too — not just &quot;more crime.&quot;
      </p>
    </section>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1 inline-block w-3 h-3 rounded-full shrink-0" style={{ background: color, opacity: 0.6 }} />
      <span className="text-slate2-700">{label}</span>
    </li>
  );
}

function SizeChip({ diameter, caption }: { diameter: number; caption: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="inline-block rounded-full"
        style={{ width: diameter, height: diameter, background: CATEGORY_COLOR.PROPERTY.fill, opacity: 0.4, border: `1.5px solid ${CATEGORY_COLOR.PROPERTY.stroke}` }}
      />
      <span className="text-[10px] text-slate2-500">{caption}</span>
    </div>
  );
}
