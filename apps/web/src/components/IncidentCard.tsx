"use client";
import { relativeTime } from "@/lib/sse";

export interface IncidentCardItem {
  id: string;
  area: string;
  occurredAt: string;
  nibrsCategory: "PERSONS" | "PROPERTY" | "SOCIETY";
  ibrOffenseDescription: string;
  beat?: string | null;
  blockLabel?: string;
}

const TONE: Record<IncidentCardItem["nibrsCategory"], { ring: string; chip: string; label: string }> = {
  PERSONS:  { ring: "border-l-bay-500",    chip: "bg-bay-200 text-bay-700",     label: "Persons" },
  PROPERTY: { ring: "border-l-coral-500",  chip: "bg-coral-200 text-coral-700", label: "Property" },
  SOCIETY:  { ring: "border-l-sage-500",   chip: "bg-sage-200 text-sage-700",   label: "Society / other" },
};

export function IncidentCard({ incident }: { incident: IncidentCardItem }) {
  const t = TONE[incident.nibrsCategory];
  const when = relativeTime(incident.occurredAt);
  return (
    <article className={`surface p-4 border-l-4 ${t.ring} animate-rise-in`}>
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-slate2-900 font-medium leading-snug">{incident.ibrOffenseDescription}</h3>
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${t.chip}`}>{t.label}</span>
      </header>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate2-500">
        <div><dt className="inline text-slate2-700">When · </dt><dd className="inline">{when}</dd></div>
        <div><dt className="inline text-slate2-700">Area · </dt><dd className="inline">{incident.area}</dd></div>
        {incident.beat && <div><dt className="inline text-slate2-700">Beat · </dt><dd className="inline">{incident.beat}</dd></div>}
        {incident.blockLabel && <div className="col-span-2 truncate"><dt className="inline text-slate2-700">Block · </dt><dd className="inline">{incident.blockLabel}</dd></div>}
      </dl>
    </article>
  );
}
