"use client";
import dynamic from "next/dynamic";

const CrimeMap = dynamic(() => import("./CrimeMap"), {
  ssr: false,
  loading: () => (
    <div className="surface h-[560px] flex items-center justify-center text-slate2-500 animate-pulse">
      Loading San Diego map…
    </div>
  ),
});

export default function MapPage() {
  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-slate2-900">Crime Map</h1>
        <p className="mt-1 text-slate2-500 max-w-2xl">
          A read of where SDPD incident reports cluster across San Diego right now. Hover any
          neighborhood to see its breakdown — persons, property, society — and compare with the
          ranked side list.
        </p>
      </header>
      <CrimeMap />
      <p className="text-xs text-slate2-500">
        Data: SDPD NIBRS via the City of San Diego Open Data Portal (refreshed quarterly).
        Map tiles: CARTO + OpenStreetMap contributors.
      </p>
    </main>
  );
}
