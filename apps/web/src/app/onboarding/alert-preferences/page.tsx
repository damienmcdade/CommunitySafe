"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

type Cat = "PERSONS" | "PROPERTY" | "SOCIETY";
type Freq = "DIGEST_DAILY" | "REAL_TIME";

const CATEGORIES: { value: Cat; label: string; help: string }[] = [
  { value: "PERSONS",  label: "Crimes against people",      help: "Things like assault, robbery, and threats." },
  { value: "PROPERTY", label: "Property crimes",            help: "Things like theft, burglary, and vandalism." },
  { value: "SOCIETY",  label: "Other offenses",             help: "Things like drug, weapon, and disorderly-conduct offenses." },
];

export default function AlertPreferencesPage() {
  const router = useRouter();
  const [picked, setPicked] = useState<Cat[]>(["PERSONS", "PROPERTY"]);
  const [freq, setFreq] = useState<Freq>("DIGEST_DAILY");
  const [cap, setCap] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(c: Cat) {
    setPicked((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      await api("/preferences/alerts", {
        method: "PUT",
        body: JSON.stringify({
          categories: picked,
          pushMinRiskLevel: 3,
          notificationFrequency: freq,
          notificationDailyCap: cap,
        }),
      });
      router.push("/onboarding/trusted-contacts");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="font-display text-3xl text-slate2-900">Safety Awareness</h1>
      <p className="mt-2 text-slate2-500">
        Pick categories of public-incident data you want to see and (optionally) be notified about.
        These are <strong>categories</strong> — never individual people.
      </p>

      <section className="mt-8 surface p-6 space-y-4">
        {CATEGORIES.map((c) => (
          <label key={c.value} className="flex gap-3 items-start cursor-pointer">
            <input
              type="checkbox"
              checked={picked.includes(c.value)}
              onChange={() => toggle(c.value)}
              className="mt-1 h-4 w-4 accent-slate2-700"
            />
            <div>
              <div className="text-slate2-900">{c.label}</div>
              <div className="text-sm text-slate2-500">{c.help}</div>
            </div>
          </label>
        ))}
      </section>

      <section className="mt-6 surface p-6">
        <h2 className="font-display text-lg text-slate2-900">Notification cadence</h2>
        <p className="text-sm text-slate2-500 mt-1">
          We default to a once-daily digest. Real-time pings are capped to prevent fatigue.
        </p>
        <div role="radiogroup" aria-label="Notification cadence" className="mt-4 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input id="freq-daily" type="radio" name="freq" checked={freq === "DIGEST_DAILY"} onChange={() => setFreq("DIGEST_DAILY")} />
            <span>Daily digest (recommended)</span>
          </label>
          <label className="flex items-center gap-2">
            <input id="freq-realtime" type="radio" name="freq" checked={freq === "REAL_TIME"} onChange={() => setFreq("REAL_TIME")} />
            <span>Real-time</span>
          </label>
        </div>
        {freq === "REAL_TIME" && (
          <div className="mt-3 text-sm">
            <label htmlFor="cap-input" className="text-slate2-700">Max real-time pings per day (hard cap: 10)</label>
            <input
              id="cap-input"
              name="cap"
              type="number" min={1} max={10}
              value={cap}
              onChange={(e) => setCap(Math.min(10, Math.max(1, Number(e.target.value))))}
              className="mt-1 ml-2 w-20 px-2 py-1 surface text-center"
            />
          </div>
        )}
      </section>

      {error && <p role="alert" className="mt-4 text-sm text-dusk-700">{error}</p>}
      <button onClick={onSave} disabled={busy} className="mt-6 px-4 py-2 bg-slate2-900 text-sand-50 rounded-xl disabled:opacity-50">
        {busy ? "Saving…" : "Save and continue"}
      </button>
    </main>
  );
}
