"use client";
import { useApi } from "@/lib/api-client";
import { useCity } from "@/lib/use-city";

interface OfficialAlert {
  id: string;
  source: string;
  category: string;
  severity: "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
  headline: string;
  description: string;
  effective: string;
  expires: string | null;
  url: string;
}
interface Resp { sources: string[]; alerts: OfficialAlert[]; roadAgency: string | null; disclaimer: string }

const SEVERITY_CLASS: Record<OfficialAlert["severity"], string> = {
  Extreme:  "bg-dusk-500/15 text-dusk-700",
  Severe:   "bg-amber2-200 text-amber2-700",
  Moderate: "bg-sand-200 text-sand-700",
  Minor:    "bg-sage-200 text-sage-700",
  Unknown:  "bg-sand-100 text-slate2-700",
};

/// Road conditions surface. Each city routes to its own state highway-patrol /
/// DOT feed (California → CHP, and a per-state ArcGIS registry for the rest,
/// see server/services/official-alerts/state-traffic.ts). `roadAgency` from the
/// API names the source even when there are zero active incidents, so the card
/// shows a calm populated "no active incidents" state instead of going blank.
/// For states without a free public feed we show one honest line rather than
/// hide the feature. Styled calm — traffic is awareness, not emergency — to
/// stay on the right side of the project's anti-fear posture.
export function TrafficAlertsPanel() {
  const { city } = useCity();
  const { data } = useApi<Resp>(`/official-alerts?city=${encodeURIComponent(city.slug)}`, [city.slug]);

  // Wait for the first response so we don't flash the wrong state.
  if (!data) return null;

  const agency = data.roadAgency ?? null;
  const incidents = (data.alerts ?? []).filter((a) => a.category === "traffic");

  return (
    <section className="surface p-5" data-testid="traffic-alerts-panel">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-display text-lg text-slate2-900">Road conditions</h2>
        {agency && <span className="text-xs text-slate2-500">{agency}</span>}
      </header>

      {agency ? (
        <>
          <p className="mt-1 text-xs text-slate2-500">
            Active collisions, closures, and road conditions near {city.label}, from the official
            {" "}{agency} traffic feed — independent of CommunitySafe community posts.
          </p>
          {incidents.length === 0 ? (
            <p className="mt-4 surface-muted p-3 text-sm text-sage-700">
              No active road incidents reported by {agency} near {city.label} right now.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {incidents.map((a) => (
                <li key={a.id} className="surface-muted p-3">
                  <div className="flex items-center justify-between gap-3">
                    <a href={a.url} target="_blank" rel="noreferrer" className="text-slate2-900 text-sm font-medium hover:underline">
                      {a.headline}
                    </a>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${SEVERITY_CLASS[a.severity]}`}>{a.severity}</span>
                  </div>
                  {a.description && a.description !== a.headline && (
                    <p className="text-xs text-slate2-600 mt-1">{a.description}</p>
                  )}
                  <div className="text-xs text-slate2-500 mt-1">
                    {a.effective ? `reported ${new Date(a.effective).toLocaleString()}` : "report time not available"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-1 text-xs text-slate2-500">
          {/* fix(audit traffic-fallback-honesty-1): don't assert the state has NO
              feed — several states (GA/VA/OH/CO) publish one; the data may simply
              be empty/unavailable right now. Keep the copy factual. */}
          Live traffic incidents aren&apos;t available for {city.label} right now. Weather, earthquake,
          and AMBER alerts for {city.label} still appear in the official-alerts surfaces above.
        </p>
      )}
    </section>
  );
}
