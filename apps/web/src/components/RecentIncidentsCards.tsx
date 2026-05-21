"use client";
import { useApi } from "@/lib/api-client";
import { IncidentCard, type IncidentCardItem } from "./IncidentCard";

interface Resp { area: string; reports: IncidentCardItem[] }

export function RecentIncidentsCards({
  area,
  jurisdiction,
  limit = 8,
  title = "Recently reported in this area",
}: {
  area?: string;
  jurisdiction?: string;
  limit?: number;
  title?: string;
}) {
  const path =
    area ? `/crime-data/recent?neighborhood=${area}&limit=${limit}`
    : jurisdiction ? `/crime-data/recent?jurisdiction=${jurisdiction}&limit=${limit}`
    : null;
  const { data, loading, error } = useApi<Resp>(path, [path]);
  const reports = data?.reports ?? [];

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="font-display text-xl text-slate2-900">{title}</h2>
        <span className="text-xs text-slate2-500">SDPD NIBRS · neighborhood-level</span>
      </header>
      {loading && (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="surface p-4 space-y-2"><div className="skel h-4 w-2/3" /><div className="skel h-3 w-1/2" /></li>
          ))}
        </ul>
      )}
      {error && !loading && (
        <p className="text-sm text-dusk-700">Couldn&apos;t reach SDPD just now. Try again in a moment.</p>
      )}
      {!loading && !error && reports.length === 0 && (
        <p className="surface-muted p-4 text-sm text-slate2-500">
          No recent SDPD incidents in this area. That&apos;s typical for many San Diego neighborhoods most weeks.
        </p>
      )}
      {!loading && reports.length > 0 && (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {reports.map((r) => (<li key={r.id}><IncidentCard incident={r} /></li>))}
        </ul>
      )}
    </section>
  );
}
