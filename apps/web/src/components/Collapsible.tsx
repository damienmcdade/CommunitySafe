"use client";
import { useEffect, useState } from "react";

// v64 — site-wide collapsible primitive. Users asked for cards to be
// collapsible with long ones collapsed by default so they can scan
// headlines + key metrics without scrolling past walls of text.
//
// Usage:
//   <Collapsible title="Citywide Safety Score" summary={<GradeBadge />}>
//     <SafetyScoreBody ... />
//   </Collapsible>
//
// Defaults: long cards collapse via `defaultCollapsed`; short cards
// (a sentence + a number) can opt out by leaving it false. Per-user
// expansion state persists to localStorage so repeat visitors aren't
// re-collapsing the same card on every visit. Keyed by `storageKey`
// (caller-supplied) so the persistence is stable across renders.

interface Props {
  /// Card title — rendered in the always-visible header.
  title: string;
  /// Optional summary node rendered next to the title even when
  /// collapsed (e.g. a grade badge or count). Stays visible so users
  /// see the key metric without expanding.
  summary?: React.ReactNode;
  /// Whether the card is collapsed when first mounted. Long cards
  /// should pass `true` so the page is scannable; short cards can
  /// stay open by default.
  defaultCollapsed?: boolean;
  /// Stable key for localStorage persistence. Pass a per-card unique
  /// string (e.g. `"safety-score-${citySlug}"`). When omitted, the
  /// expansion state is in-memory only.
  storageKey?: string;
  /// Optional CSS class on the wrapper section. Defaults to "surface".
  className?: string;
  /// Body content, rendered when expanded.
  children: React.ReactNode;
}

export function Collapsible({
  title,
  summary,
  defaultCollapsed = false,
  storageKey,
  className = "surface",
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage AFTER mount so SSR and client agree on
  // the initial render. Avoids the dreaded hydration mismatch when a
  // user has previously expanded a card the server defaulted closed.
  useEffect(() => {
    setHydrated(true);
    if (!storageKey) return;
    try {
      const stored = window.localStorage.getItem(`collapsible:${storageKey}`);
      if (stored === "1") setCollapsed(false);
      else if (stored === "0") setCollapsed(true);
    } catch {
      // localStorage can throw in private-browsing on some browsers.
      // Best-effort persistence; in-memory state is the fallback.
    }
  }, [storageKey]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    if (storageKey) {
      try {
        window.localStorage.setItem(`collapsible:${storageKey}`, next ? "0" : "1");
      } catch {
        // ignore — see comment in mount effect.
      }
    }
  }

  // Pre-hydration the server already shipped the defaultCollapsed
  // state. Suppress the toggle button until hydrated so a click that
  // races React's hydration doesn't fire against an inconsistent
  // state.
  return (
    <section className={className}>
      <button
        type="button"
        onClick={toggle}
        disabled={!hydrated}
        aria-expanded={!collapsed}
        className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left hover:bg-bay-50/40 transition-colors disabled:cursor-default"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span aria-hidden="true" className={`inline-block transition-transform text-slate2-500 text-sm ${collapsed ? "" : "rotate-90"}`}>
            ▶
          </span>
          <h3 className="font-display text-base sm:text-lg text-slate2-900 truncate">{title}</h3>
        </div>
        {summary && (
          <div className="text-sm text-slate2-700 shrink-0">{summary}</div>
        )}
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5 -mt-2">
          {children}
        </div>
      )}
    </section>
  );
}
