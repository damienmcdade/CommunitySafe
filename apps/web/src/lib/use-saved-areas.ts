"use client";
import { useCallback, useSyncExternalStore } from "react";
import type { AreaSelection } from "./use-area";

/// Saved/followed neighborhoods — a small per-device list the user
/// curates. Powers the "your spots" rail at the top of every tab and
/// later (Phase 2C) the weekly digest. Same useSyncExternalStore pattern
/// as use-area.ts so SSR hydration is clean and every consumer reads
/// the same value within one render tick.
///
/// Storage shape: an ARRAY of AreaSelection objects so order is
/// preserved (oldest-saved first). Capped at MAX_SAVED to keep the rail
/// scannable.

const STORAGE_KEY = "travelsafe.saved-areas.v1";
const MAX_SAVED = 5;

const listeners = new Set<() => void>();
let store: AreaSelection[] | null = null;
let snapshot: AreaSelection[] | null = null;

function load(): AreaSelection[] {
  if (store) return store;
  if (typeof window === "undefined") { store = []; return store; }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    store = raw ? (JSON.parse(raw) as AreaSelection[]) : [];
  } catch {
    store = [];
  }
  return store;
}

function save(next: AreaSelection[]) {
  store = next;
  snapshot = null;
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* quota — ignore */ }
  }
  for (const cb of listeners) cb();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

function getSnapshot(): AreaSelection[] {
  const s = load();
  if (snapshot && snapshot === s) return snapshot;
  snapshot = s;
  return s;
}

function getServerSnapshot(): AreaSelection[] {
  return [];
}

/// Helper — returns true if the given area slug is already saved.
export function isSavedArea(slug: string): boolean {
  return load().some((a) => a.slug === slug);
}

export function useSavedAreas() {
  const saved = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback((area: AreaSelection) => {
    const cur = load();
    const existing = cur.findIndex((a) => a.slug === area.slug);
    if (existing >= 0) {
      // Already saved — remove.
      const next = cur.filter((_, i) => i !== existing);
      save(next);
    } else {
      // Save, evicting oldest if at cap.
      const next = [...cur, { slug: area.slug, label: area.label, jurisdiction: area.jurisdiction }];
      while (next.length > MAX_SAVED) next.shift();
      save(next);
    }
  }, []);

  const remove = useCallback((slug: string) => {
    save(load().filter((a) => a.slug !== slug));
  }, []);

  const isSaved = useCallback((slug: string) => saved.some((a) => a.slug === slug), [saved]);

  return { saved, toggle, remove, isSaved, max: MAX_SAVED };
}
