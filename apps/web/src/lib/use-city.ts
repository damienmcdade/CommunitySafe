"use client";
import { useCallback, useEffect, useState } from "react";

export interface CityInfo {
  slug: string;
  label: string;
  /// Default area to show when the user lands on a tab without selecting an
  /// area (used as the jurisdiction for citywide views + insights).
  defaultArea: string;
  /// Map centroid for re-centering the Crime Map.
  centroid: { lat: number; lng: number };
  /// Status banner shown when this city is selected (empty for fully-wired
  /// cities, populated for stub cities so we never lie about data coverage).
  banner?: string;
}

export const CITIES: CityInfo[] = [
  { slug: "san-diego",     label: "San Diego",     defaultArea: "san-diego",     centroid: { lat: 32.78, lng: -117.18 } },
  { slug: "los-angeles",   label: "Los Angeles",   defaultArea: "la-hollywood",  centroid: { lat: 34.05, lng: -118.32 } },
  { slug: "san-francisco", label: "San Francisco", defaultArea: "sf-mission",    centroid: { lat: 37.76, lng: -122.44 } },
  { slug: "oakland",       label: "Oakland",       defaultArea: "oakland",       centroid: { lat: 37.80, lng: -122.27 },
    banner: "Oakland's public crime feed is older than the other cities — counts shown are historical, not current week." },
  { slug: "long-beach",    label: "Long Beach",    defaultArea: "long-beach-city", centroid: { lat: 33.77, lng: -118.19 },
    banner: "Long Beach: no public crime API confirmed yet. Search and routing work; incident data is empty until a feed is wired." },
  { slug: "san-jose",      label: "San Jose",      defaultArea: "san-jose-city", centroid: { lat: 37.34, lng: -121.89 },
    banner: "San Jose: no public crime API confirmed yet. Search and routing work; incident data is empty until a feed is wired." },
];

const STORAGE_KEY = "travelsafe.city.v1";

let listeners = new Set<(c: CityInfo) => void>();
let current: CityInfo | null = null;

function load(): CityInfo {
  if (current) return current;
  if (typeof window === "undefined") return CITIES[0];
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const found = CITIES.find((c) => c.slug === stored);
  current = found ?? CITIES[0];
  return current;
}

function save(city: CityInfo) {
  current = city;
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, city.slug);
  for (const cb of listeners) cb(city);
}

/// React hook giving the currently-selected city + a setter. Backed by
/// localStorage so the choice persists across visits, and broadcasts to any
/// other useCity() consumer so the whole UI re-renders on switch.
export function useCity() {
  const [city, setCityState] = useState<CityInfo>(() => (typeof window === "undefined" ? CITIES[0] : load()));

  useEffect(() => {
    setCityState(load());
    const sub = (c: CityInfo) => setCityState(c);
    listeners.add(sub);
    return () => { listeners.delete(sub); };
  }, []);

  const setCity = useCallback((slug: string) => {
    const next = CITIES.find((c) => c.slug === slug);
    if (next) save(next);
  }, []);

  return { city, setCity, cities: CITIES };
}
