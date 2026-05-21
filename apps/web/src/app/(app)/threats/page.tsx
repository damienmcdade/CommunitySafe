"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { requestLocation } from "@/lib/geolocation";
import { ensurePushSubscription } from "@/lib/push";
import { DataProvenanceBanner, type ProvenanceLike } from "@/components/DataProvenanceBanner";
import { RiskBadge } from "@/components/RiskBadge";

interface Alert {
  area: string;
  category: "PERSONS" | "PROPERTY" | "SOCIETY";
  riskLevel: 1 | 2 | 3 | 4 | 5;
  summary: string;
  recency: string;
  provenance: ProvenanceLike;
}

export default function ThreatsPage() {
  const [area, setArea] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [locationOn, setLocationOn] = useState(false);

  async function enableLocation() {
    setError(null);
    try {
      const pos = await requestLocation();
      setLocationOn(true);
      const r = await api<{ area: string; alerts: Alert[] }>(
        `/crime-data/alerts?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`,
      );
      setArea(r.area);
      setAlerts(r.alerts);
    } catch (err) {
      setError(`Location unavailable (${(err as Error).message}). Try entering a neighborhood manually on the Community tab.`);
    }
  }

  async function enableNotifications() {
    const r = await ensurePushSubscription();
    setPushStatus(r.ok ? "Notifications enabled (daily digest by default)." : `Notifications not enabled: ${r.reason}.`);
  }

  useEffect(() => {
    // No auto-prompt. Per spec, both location and notifications are opt-in toggles.
  }, []);

  return (
    <main className="space-y-8">
      <section>
        <h1 className="font-display text-3xl text-slate2-900">Area awareness</h1>
        <p className="mt-2 text-slate2-500 max-w-2xl">
          TravelSafe shows neighborhood-level safety context using public crime data.
          It does not track individuals or stream live incidents. In an emergency, call 911 directly.
        </p>
      </section>

      <section className="surface p-6 space-y-4">
        <h2 className="font-display text-lg text-slate2-900">Permissions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={enableLocation}
            className="px-4 py-2 bg-slate2-900 text-sand-50 rounded-xl"
          >
            {locationOn ? "Refresh location" : "Enable location"}
          </button>
          <button
            onClick={enableNotifications}
            className="px-4 py-2 bg-white border border-sand-200 text-slate2-900 rounded-xl"
          >
            Enable notifications
          </button>
        </div>
        {pushStatus && <p className="text-xs text-slate2-500">{pushStatus}</p>}
        <p className="text-xs text-slate2-500">
          Notifications default to a once-daily digest. Higher cadence is opt-in and capped to prevent fatigue.
        </p>
      </section>

      {error && <p className="text-sm text-dusk-700">{error}</p>}

      {alerts && (
        <section className="space-y-4">
          <h2 className="font-display text-2xl text-slate2-900">{area}</h2>
          {alerts.length === 0 ? (
            <div className="surface p-6 text-slate2-500">
              No recent incidents in the cached window for this area. This is typical for many San Diego neighborhoods most of the time.
            </div>
          ) : (
            <ul className="space-y-3">
              {alerts.map((a, i) => (
                <li key={i} className="surface p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-slate2-900 font-medium">{a.category.toLowerCase()} incidents</div>
                    <RiskBadge level={a.riskLevel} />
                  </div>
                  <p className="mt-2 text-slate2-700">{a.summary}</p>
                  <p className="text-xs text-slate2-500 mt-2">Recency: {a.recency}</p>
                  <p className="text-xs text-slate2-500 mt-1">
                    Reminder: do not approach or confront anyone. Report serious incidents to the police.
                  </p>
                </li>
              ))}
            </ul>
          )}
          <DataProvenanceBanner provenance={alerts[0]?.provenance ?? null} />
        </section>
      )}
    </main>
  );
}
