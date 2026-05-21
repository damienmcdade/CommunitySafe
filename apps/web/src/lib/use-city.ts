"use client";
import { useCallback, useEffect, useState } from "react";

export interface CityInfo {
  slug: string;
  label: string;
  /// Default jurisdiction slug used for citywide views when no specific area
  /// is selected.
  defaultArea: string;
  /// Map centroid for re-centering the Crime Map.
  centroid: { lat: number; lng: number };
}

// Only cities with verified, current public crime APIs.
export const CITIES: CityInfo[] = [
  { slug: "san-diego",     label: "San Diego",     defaultArea: "san-diego",     centroid: { lat: 32.78, lng: -117.18 } },
  { slug: "los-angeles",   label: "Los Angeles",   defaultArea: "la-hollywood",  centroid: { lat: 34.05, lng: -118.32 } },
  { slug: "san-francisco", label: "San Francisco", defaultArea: "sf-mission",    centroid: { lat: 37.76, lng: -122.44 } },
];

const STORAGE_KEY = "travelsafe.city.v1";

const listeners = new Set<(c: CityInfo) => void>();
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

/// React hook returning the currently-selected city + a setter. The choice
/// is persisted to localStorage and broadcasts to every other useCity()
/// consumer so the whole UI re-renders on a switch.
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
