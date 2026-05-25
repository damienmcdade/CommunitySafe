"use client";
import { useEffect, useRef, useState } from "react";
import { useCity } from "@/lib/use-city";
import { WheelCityAreaPicker } from "./WheelCityAreaPicker";

// Shared selector-pill styling. Used by both CitySelector and the
// StateSelector below so the two controls are visually identical.
// Padding tightens on mobile so the pill fits in narrow headers
// without clipping. min-w-0 + max-w-[60vw] guards against
// pathological label widths from cities with long names.
const TRIGGER_CLS = "inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-sm bg-white border border-bay-200 text-slate2-900 shadow-card hover:bg-bay-50 hover:border-bay-400 hover:shadow-glow-bay transition-all min-w-0 max-w-[60vw] sm:max-w-none";

/// Header city switcher. Two modes share one dropdown:
///
///   1. Search-first (default open state): a single combobox the user
///      types into. Matches the same combobox UX we ship on Safe Route
///      and SafeZone, scaled for 30 cities. Arrow keys + Enter commit.
///
///   2. Browse-by-state (collapsible disclosure): the original
///      state + city wheels for users who don't know which city to
///      pick and want to scroll geographically. Kept because some
///      users find browsing faster than typing for short city lists.
///
/// Search is the default because typing "det" is far faster than
/// finding Michigan → Detroit on two wheels — the wheel UX was
/// painful past the SD/LA/SF starter set.
export function CitySelector() {
  const { city, setCity } = useCity();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Close on outside click / Escape. On Escape, return focus to the
  // trigger button so keyboard users land back on a recognizable
  // affordance rather than nowhere (WCAG focus-management).
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    if (open) {
      document.addEventListener("click", onClick);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(slug: string) {
    setCity(slug);
    setOpen(false);
    // Return focus to the trigger after pick so the user can continue
    // with keyboard nav from a known location.
    triggerRef.current?.focus();
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={TRIGGER_CLS}
        aria-label={`Change city — currently ${city.label}, ${city.state}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {/* Location-pin icon — clearly signals "this is your selected
            place" rather than the prior tiny dot. */}
        <svg viewBox="0 0 16 16" className="w-4 h-4 text-bay-700 shrink-0" fill="currentColor" aria-hidden>
          <path d="M8 1a5 5 0 0 0-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 0 0-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
        </svg>
        <span className="flex items-baseline gap-1.5 min-w-0">
          {/* "City" prefix label hidden on mobile to save horizontal
              real-estate — the icon already signals "this is a place
              picker". Label truncates instead of breaking the
              container. */}
          <span className="hidden sm:inline text-[11px] uppercase tracking-wider text-slate2-500 shrink-0">City</span>
          <span className="font-semibold truncate">{city.label}</span>
        </span>
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-slate2-500 shrink-0" fill="none" stroke="currentColor" aria-hidden>
          <path d="M4 6l4 4 4-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Change state, city and neighborhood"
          // v45 — widened from 28rem to 36rem to fit the THREE wheels
          // (State + City + Neighborhood) comfortably on desktop. On
          // narrow viewports collapses to (viewport - 1rem) and the
          // wheels stack vertically per the picker's compact mode.
          className="absolute right-0 mt-2 w-[36rem] max-w-[calc(100vw-1rem)] surface p-3 z-30 animate-pop-in"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-1 pb-2 text-[11px] uppercase tracking-wider text-slate2-500">
            Pick a state, city + neighborhood
          </p>
          {/* Wheel picker stays open across wheel changes — the user
              commits via the in-picker button which closes the dropdown
              via the onCommit callback. Replaces the prior search +
              browse-by-state UX which closed the dropdown immediately
              on city pick (forcing the user back out before they could
              pick a neighborhood). */}
          <WheelCityAreaPicker compact onCommit={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}


// StateSelector removed in v45 — its job is folded into the State
// wheel inside WheelCityAreaPicker, which CitySelector now opens.
// Picking a state in the wheel filters the city wheel down to that
// state's cities; the user then picks any city in that state from
// the wheel (instead of the previous flow that auto-jumped to the
// first city and locked the user out of picking a different one).

// Lightweight per-tab notice. Currently every supported city has a working
// feed, so this is a no-op render — kept as an extension point for future
// per-city advisories.
export function CityBanner() {
  return null;
}
