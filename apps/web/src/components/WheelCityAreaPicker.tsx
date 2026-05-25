"use client";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/api-client";
import { useCity, CITIES } from "@/lib/use-city";
import { useArea } from "@/lib/use-area";
import { WheelPicker, type WheelItem } from "./WheelPicker";

interface AreaRow { slug: string; label: string; jurisdiction: string }
interface AreasResp { areas: AreaRow[]; stale?: boolean }

/// Two-wheel City + Neighborhood picker. Replaces the inline
/// LocationSearch input on Neighborhood Awareness — same job (let the
/// user pick a neighborhood) with the wheel UX users prefer (no
/// typing, every option visible, easy to thumb-scroll). The left
/// wheel changes the selected city, the right wheel scopes to that
/// city's supported neighborhoods. Picking commits to the global
/// useCity / useArea stores so the rest of the app stays in sync.
///
/// `onCommit` (optional) — fires AFTER the global stores are
/// updated. Header dropdowns use this to close themselves so the
/// commit flow feels intentional.
///
/// `compact` (optional) — stacks the two wheels vertically and
/// trims spacing for tight surfaces like the header dropdown.
export function WheelCityAreaPicker({
  onCommit,
  compact = false,
}: {
  onCommit?: () => void;
  compact?: boolean;
} = {}) {
  const { city, setCity } = useCity();
  const { area, setArea } = useArea(city.slug);

  // Auto-commit model (v23): each wheel settle commits immediately
  // to the global useCity / useArea stores. The prior pending+button
  // flow felt broken to users because scrolling the wheel appeared
  // to do nothing until they noticed the "Use this selection" button
  // below — which the v23 audit confirmed several users missed
  // entirely. With auto-commit the slider behaves like every other
  // wheel UX they've seen (iOS date picker, Android NumberPicker).
  //
  // Trade-off accepted: city changes mid-scrub trigger a page-data
  // refetch underneath. We still keep a transient `pendingCity`
  // state so the area wheel can populate the new city's
  // neighborhoods before the user finishes browsing — the city
  // change commits the moment the city wheel settles, then the
  // first area in the new list auto-commits a tick later.
  const [pendingCity, setPendingCity] = useState<string>(city.slug);

  useEffect(() => { setPendingCity(city.slug); }, [city.slug]);

  const pendingCityInfo = CITIES.find((c) => c.slug === pendingCity) ?? city;

  // Fetch neighborhoods for the PENDING city so the right wheel
  // reflects the user's in-progress city pick before commit.
  const areasPath = `/geo/areas?city=${pendingCity}`;
  const { data: areasResp, loading: areasLoading } = useApi<AreasResp>(areasPath, [areasPath]);
  const cityAreas = useMemo(() => {
    const areas = areasResp?.areas ?? [];
    return areas
      .filter((a) => (a?.jurisdiction ?? "").toLowerCase() === pendingCityInfo.label.toLowerCase())
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [areasResp, pendingCityInfo.label]);

  // Auto-commit city on wheel settle, AND auto-commit the first
  // area in the new city if the user hasn't picked one yet (so the
  // Neighborhood Awareness page is never stuck on a "Pick one"
  // empty state after a city change).
  function handleCityChange(slug: string) {
    setPendingCity(slug);
    if (slug !== city.slug) setCity(slug);
  }

  // Auto-commit the first area of a new city as soon as the area
  // list loads, so users who picked a city never see "no area
  // selected" downstream. Only fires when the current area doesn't
  // belong to the now-selected city.
  useEffect(() => {
    if (cityAreas.length === 0) return;
    const current = area?.slug ?? null;
    if (current && cityAreas.some((a) => a.slug === current)) return;
    const first = cityAreas[0];
    setArea({ slug: first.slug, label: first.label, jurisdiction: first.jurisdiction });
  }, [cityAreas, area?.slug, setArea]);

  function handleAreaChange(slug: string) {
    const picked = cityAreas.find((a) => a.slug === slug);
    if (!picked) return;
    setArea({ slug: picked.slug, label: picked.label, jurisdiction: picked.jurisdiction });
    onCommit?.();
  }

  const cityItems: WheelItem[] = useMemo(
    () => [...CITIES]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((c) => ({
        value: c.slug,
        label: c.label,
        detail: c.stateLabel,
        disabled: c.status !== "live",
      })),
    [],
  );

  const areaItems: WheelItem[] = useMemo(
    () => cityAreas.map((a) => ({
      value: a.slug,
      label: a.label,
      detail: undefined,
    })),
    [cityAreas],
  );

  // Compact mode is for the header dropdown — drop the framing
  // <section>, tighten gaps, smaller wheels. Default mode is for
  // in-page placement on Neighborhood Awareness.
  const wheelHeight = compact ? 180 : 220;
  const wheelRow    = compact ? 36  : 40;
  // Stack vertically on narrow viewports always (sm:grid-cols-2),
  // and stack in compact mode too if the dropdown is on a phone.
  const gridCls = compact
    ? "grid grid-cols-1 sm:grid-cols-2 gap-2"
    : "grid grid-cols-1 sm:grid-cols-2 gap-3";

  const body = (
    <>
      <div className={gridCls}>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate2-500 mb-1 text-center">City</div>
          <WheelPicker
            items={cityItems}
            value={pendingCity}
            onChange={handleCityChange}
            ariaLabel="City"
            height={wheelHeight}
            rowHeight={wheelRow}
            searchable
            searchPlaceholder="City"
          />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate2-500 mb-1 text-center">Neighborhood</div>
          {areasLoading && areaItems.length === 0 ? (
            <div style={{ height: wheelHeight }} className="flex items-center justify-center text-xs text-slate2-500 animate-pulse">
              Loading {pendingCityInfo.label} neighborhoods…
            </div>
          ) : areaItems.length === 0 ? (
            <div style={{ height: wheelHeight }} className="flex items-center justify-center text-xs text-slate2-500">
              No neighborhoods loaded for {pendingCityInfo.label}.
            </div>
          ) : (
            <WheelPicker
              items={areaItems}
              value={area?.slug ?? areaItems[0]?.value ?? ""}
              onChange={handleAreaChange}
              ariaLabel="Neighborhood"
              height={wheelHeight}
              rowHeight={wheelRow}
              searchable
              searchPlaceholder="Neighborhood"
            />
          )}
        </div>
      </div>

      <p className={`mt-3 text-[11px] text-slate2-500 text-center ${compact ? "text-[10px]" : ""}`}>
        Selection commits the moment each wheel settles. Switch states from the State pill in the header.
      </p>
    </>
  );

  if (compact) return <div>{body}</div>;

  return (
    <section className="surface p-4 sm:p-5">
      <header className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="font-display text-lg text-slate2-900">Pick a city + neighborhood</h3>
          <p className="text-xs text-slate2-500 mt-0.5">
            Spin the wheels to select. Every supported neighborhood for the chosen city is listed in the right wheel — labels wrap so nothing is hidden.
          </p>
        </div>
      </header>
      {body}
    </section>
  );
}
