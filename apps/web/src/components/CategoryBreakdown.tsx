"use client";

interface CategoryCounts { PERSONS: number; PROPERTY: number; SOCIETY: number }

const COLORS: Record<keyof CategoryCounts, { bg: string; text: string; label: string }> = {
  PERSONS:  { bg: "#357F9C", text: "text-bay-700",   label: "Persons" },
  PROPERTY: { bg: "#D26E47", text: "text-coral-700", label: "Property" },
  SOCIETY:  { bg: "#6C8B62", text: "text-sage-700",  label: "Society" },
};

export function CategoryBreakdown({ counts, title = "Category mix", subtitle }: { counts: CategoryCounts; title?: string; subtitle?: string }) {
  const total = counts.PERSONS + counts.PROPERTY + counts.SOCIETY;
  if (total === 0) {
    return (
      <section className="surface p-5">
        <h3 className="font-display text-lg text-slate2-900">{title}</h3>
        <p className="mt-2 text-sm text-slate2-500">No incidents in the recent window for this view.</p>
      </section>
    );
  }
  const entries = (Object.entries(counts) as Array<[keyof CategoryCounts, number]>)
    .sort((a, b) => b[1] - a[1]);

  return (
    <section className="surface p-5">
      <header className="flex items-baseline justify-between">
        <h3 className="font-display text-lg text-slate2-900">{title}</h3>
        <span className="text-xs text-slate2-500">{total.toLocaleString()} incidents</span>
      </header>
      {subtitle && <p className="mt-1 text-xs text-slate2-500">{subtitle}</p>}

      {/* Stacked bar */}
      <div className="mt-4 flex h-3 rounded-full overflow-hidden bg-sand-100">
        {entries.map(([k, n]) => (
          <div
            key={k}
            className="h-full transition-all duration-500"
            style={{ width: `${(n / total) * 100}%`, background: COLORS[k].bg }}
            title={`${COLORS[k].label}: ${n}`}
          />
        ))}
      </div>

      {/* Legend rows */}
      <ul className="mt-4 space-y-2">
        {entries.map(([k, n]) => {
          const pct = Math.round((n / total) * 100);
          return (
            <li key={k} className="flex items-center gap-3 text-sm">
              <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[k].bg }} />
              <span className="text-slate2-900 flex-1">{COLORS[k].label}</span>
              <span className={`tabular-nums ${COLORS[k].text}`}>{n.toLocaleString()}</span>
              <span className="text-xs text-slate2-500 tabular-nums w-10 text-right">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
