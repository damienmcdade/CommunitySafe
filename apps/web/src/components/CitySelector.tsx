"use client";
import { useEffect, useRef, useState } from "react";
import { useCity } from "@/lib/use-city";

// Per-city dataset descriptions surfaced in the dropdown so users can see
// which feed powers each city before switching.
const CITY_NOTES: Record<string, string> = {
  "san-diego":     "Powered by the SDPD NIBRS Crime Offenses dataset, refreshed quarterly.",
  "los-angeles":   "Powered by the LAPD Crime Data 2020–Present dataset on data.lacity.org.",
  "san-francisco": "Powered by the SFPD Incident Reports dataset on DataSF, refreshed daily.",
};

export function CitySelector() {
  const { city, setCity, cities } = useCity();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate2-700 hover:bg-bay-100 hover:text-bay-700 transition-colors"
        aria-label="Change city"
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-bay-500" />
        <span className="font-medium">{city.label}</span>
        <svg viewBox="0 0 16 16" className="w-3 h-3 opacity-60" fill="none" stroke="currentColor"><path d="M4 6l4 4 4-4" strokeWidth="1.5" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 surface p-2 z-30 animate-pop-in">
          <p className="px-2 pt-1 pb-2 text-[10px] uppercase tracking-wider text-slate2-500">
            Choose a city
          </p>
          <ul className="space-y-0.5">
            {cities.map((c) => (
              <li key={c.slug}>
                <button
                  onClick={() => { setCity(c.slug); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    c.slug === city.slug ? "bg-bay-200 text-bay-700 font-medium" : "hover:bg-sand-100 text-slate2-900"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{c.label}</span>
                    {c.slug === city.slug && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-bay-700">Current</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate2-500 leading-snug">
                    {CITY_NOTES[c.slug] ?? ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-3 py-2 text-[10px] text-slate2-500 border-t border-sand-200">
            Your selection is stored locally and applied across every tab.
          </p>
        </div>
      )}
    </div>
  );
}

// Lightweight per-tab notice. Currently every supported city has a working
// feed, so this is a no-op render — kept as an extension point for future
// per-city advisories.
export function CityBanner() {
  return null;
}
